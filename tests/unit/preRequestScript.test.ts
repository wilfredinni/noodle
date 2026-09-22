import { describe, expect, it } from "bun:test"
import {
  runPreRequestScript,
  runRequestScript,
  SCRIPT_API_CONTRACT,
  SCRIPT_LIMITS,
  scriptWasmMemoryForTests,
} from "../../src/preRequestScript"
import type { SubstitutedRequest } from "../../src/requests/substitute"
import { RunScope } from "../../src/runScope"

function request(
  overrides: Partial<SubstitutedRequest> = {},
): SubstitutedRequest {
  return {
    id: "request",
    name: "Request",
    method: "GET",
    url: "https://example.com",
    timeout: 0,
    headers: {},
    params: [],
    ...overrides,
  }
}

describe("pre-request script sandbox", () => {
  it("rolls back unhandled Promise rejections while allowing caught failures", async () => {
    for (const phase of ["pre", "post", "tests"] as const) {
      for (const source of [
        'Promise.reject(Error("unhandled"))',
        'new Promise((resolve, reject) => reject(Error("unhandled")))',
        'Promise.resolve().then(() => { throw Error("unhandled") })',
        '(async () => { await 1; throw Error("unhandled") })()',
      ]) {
        const scope = new RunScope()
        const result = await runRequestScript(
          phase,
          `${phase === "tests" ? "" : 'noodle.run.set("STAGED", 1);'} ${source}`,
          request(),
          undefined,
          scope,
          {
            response: {
              status: 200,
              statusText: "OK",
              headers: {},
              body: "{}",
              timeMs: 1,
            },
          },
        )
        expect(result.result.success).toBe(false)
        expect(result.result.error?.message).toBe("unhandled")
        expect(scope.get("STAGED")).toBeUndefined()
      }
    }
    const scope = new RunScope()
    const caught = await runPreRequestScript(
      'if (typeof globalThis.__quickjsCheckUnhandledRejections !== "undefined") throw Error("exposed tracker"); const failure = Promise.reject(Error("caught")); await 1; try { await failure } catch {} noodle.run.set("STAGED", 1)',
      request(),
      undefined,
      scope,
    )
    expect(caught.result.success).toBe(true)
    expect(scope.get("STAGED")).toBe(1)
  })

  it("stages durable snapshots without changing baseline reads or transient semantics", async () => {
    const scope = new RunScope()
    const environment = {
      name: "dev",
      vars: { REMOVE: "baseline", TOKEN: "old-secret" },
      secretVars: { TOKEN: "keychain" as const },
    }
    const execution = await runPreRequestScript(
      `
      noodle.run.set("VALUE", { count: 1 }, { persist: "environment" });
      noodle.run.set("VALUE", 2);
      noodle.run.set("TOKEN", "new-secret", { persist: "secret" });
      noodle.run.set("TOKEN", "public");
      noodle.run.unset("REMOVE", { persist: "environment" });
      if (noodle.env.get("REMOVE") !== "baseline" || noodle.run.get("REMOVE") !== undefined) throw Error("read semantics");
    `,
      request(),
      environment,
      scope,
    )
    expect(execution.result.success).toBe(true)
    expect(execution.persistenceIntents).toEqual([
      {
        variable: "VALUE",
        target: "environment",
        operation: "set",
        value: { count: 1 },
      },
      {
        variable: "TOKEN",
        target: "secret",
        operation: "set",
        value: "new-secret",
      },
      { variable: "REMOVE", target: "environment", operation: "unset" },
    ])
    expect(scope.get("VALUE")).toBe(2)
    expect(scope.get("TOKEN")).toBe("public")
    expect(scope.secretValues()).toContain("new-secret")
    expect(scope.environment(environment).vars).not.toHaveProperty("REMOVE")
    scope.set("REMOVE", "capture")
    expect(scope.environment(environment).vars.REMOVE).toBe("capture")
    scope.unset("REMOVE")
    expect(scope.environment(environment).vars.REMOVE).toBe("baseline")
  })

  it("keeps the latest explicit intent and discards all intents on script failure", async () => {
    for (const suffix of ["", '; throw Error("failed")']) {
      const scope = new RunScope()
      const execution = await runPreRequestScript(
        `
        noodle.run.set("KEY", "first", { persist: "environment" });
        noodle.run.unset("KEY", { persist: "environment" });
        noodle.run.set("KEY", "latest", { persist: "secret" });
        console.log("latest");
      ${suffix}`,
        request(),
        undefined,
        scope,
      )
      expect(execution.result.success).toBe(!suffix)
      expect(execution.persistenceIntents).toEqual(
        suffix
          ? undefined
          : [
              {
                variable: "KEY",
                target: "secret",
                operation: "set",
                value: "latest",
              },
            ],
      )
      expect(scope.get("KEY")).toBe(suffix ? undefined : "latest")
      expect(execution.secretValues).toContain("latest")
    }
  })

  it("validates persistence options and bounds keys and aggregate values", async () => {
    for (const source of [
      'noodle.run.set("KEY", 1, {})',
      'noodle.run.set("KEY", 1, { persist: "wrong" })',
      'noodle.run.set("KEY", 1, { persist: "secret", extra: true })',
      'noodle.run.unset("KEY", null)',
      'noodle.run.set("_color", "red", { persist: "environment" })',
      'noodle.run.set("KEY", "", { persist: "secret" })',
      'for (let i = 0; i < 101; i++) noodle.run.set("key" + i, 1, { persist: "environment" })',
      'noodle.run.set("a", "x".repeat(140000), { persist: "environment" }); noodle.run.set("b", "y".repeat(140000), { persist: "environment" })',
      'noodle.run.set("KEY", "secret", { persist: "secret" }); while(true) {}',
    ]) {
      const scope = new RunScope()
      const execution = await runPreRequestScript(
        source,
        request(),
        undefined,
        scope,
      )
      expect(execution.result.success).toBe(false)
      expect(execution.persistenceIntents).toBeUndefined()
      expect(scope.get("KEY")).toBeUndefined()
      expect(scope.get("key0")).toBeUndefined()
    }
  })

  it("exposes exactly the documented API and no host capabilities", async () => {
    const scope = new RunScope()
    const execution = await runPreRequestScript(
      `const members = (value, prefix = "") => Object.keys(value).flatMap(key => {
        const path = prefix ? prefix + "." + key : key;
        return value[key] && typeof value[key] === "object"
          ? [path, ...members(value[key], path)]
          : [path];
      });
      noodle.run.set("surface", {
        globals: ["noodle", "console"].map(name => [name, members(globalThis[name])]),
        frozen: [noodle, noodle.request, noodle.request.headers, noodle.request.params, noodle.request.body, noodle.request.auth, noodle.env, noodle.run, noodle.crypto, console, noodle.random].every(Object.isFrozen),
        legacy: [typeof request, typeof response, typeof env, typeof run, typeof crypto, typeof random, typeof cookies],
        postOnly: [typeof noodle.response, typeof noodle.cookies],
        nullPrototype: Object.getPrototypeOf(noodle) === null,
        globalDescriptor: Object.getOwnPropertyDescriptor(globalThis, "noodle").writable === false && Object.getOwnPropertyDescriptor(globalThis, "noodle").configurable === false,
        forbidden: [typeof Bun, typeof process, typeof require, typeof module, typeof Deno, typeof fetch, typeof WebSocket, typeof Worker, typeof setTimeout]
      })`,
      request(),
      undefined,
      scope,
    )

    expect(execution.result.success).toBe(true)
    const expected = ["noodle", "console"].map((global) => [
      global,
      SCRIPT_API_CONTRACT.filter(
        (entry) =>
          entry.global === global &&
          entry.member &&
          entry.phases.includes("pre"),
      ).map((entry) => entry.member),
    ])
    expect(scope.get("surface")).toEqual({
      globals: expected,
      frozen: true,
      legacy: Array(7).fill("undefined"),
      postOnly: Array(2).fill("undefined"),
      nullPrototype: true,
      globalDescriptor: true,
      forbidden: Array(9).fill("undefined"),
    })
    expect(
      SCRIPT_API_CONTRACT.every((entry) =>
        entry.phases.every(
          (phase) => phase === "pre" || phase === "post" || phase === "tests",
        ),
      ),
    ).toBe(true)
  })

  it("rejects bare APIs and replacing the namespace without committing writes", async () => {
    for (const source of [
      'run.set("staged", true)',
      "random.uuid()",
      "noodle = {}",
      "noodle.env = {}",
      "noodle.run.set = () => {}",
    ]) {
      const scope = new RunScope()
      const execution = await runPreRequestScript(
        `"use strict"; noodle.run.set("staged", true); ${source}`,
        request(),
        undefined,
        scope,
      )
      expect(execution.result.success).toBe(false)
      expect(scope.get("staged")).toBeUndefined()
    }
  })

  it("mutates a staged request with documented header and parameter semantics", async () => {
    const original = request({
      headers: { First: "1", duplicate: "old", DUPLICATE: "older", Last: "3" },
      params: [
        { name: "x", value: "1", enabled: true },
        { name: "x", value: "disabled", enabled: false },
        { name: "x", value: "2", enabled: true },
        { name: "y", value: "3", enabled: true },
      ],
    })
    const execution = await runPreRequestScript(
      `
        if (noodle.request.headers.get("DUPLICATE") !== "old") throw new Error("header get");
        noodle.request.headers.set("DuPlIcAtE", "new");
        noodle.request.headers.delete("last");
        noodle.request.params.set("x", "new");
        noodle.request.params.append("x", "later");
        noodle.request.params.delete("y");
      `,
      original,
      undefined,
      new RunScope(),
    )

    expect(execution.result.success).toBe(true)
    expect(execution.request.headers).toEqual({ First: "1", duplicate: "new" })
    expect(execution.request.params).toEqual([
      { name: "x", value: "new", enabled: true },
      { name: "x", value: "disabled", enabled: false },
      { name: "x", value: "later", enabled: true },
    ])
    expect(original.headers).toHaveProperty("DUPLICATE")
  })

  it("supports body, auth, environment, run scope, crypto, and bounded logs", async () => {
    const scope = new RunScope()
    scope.set("old", "value")
    const execution = await runPreRequestScript(
      `
        if (noodle.env.get("VISIBLE") !== "yes" || noodle.env.get("old") !== undefined) throw new Error("env");
        if (noodle.request.body.json().one !== 1) throw new Error("body");
        noodle.request.body.setJson({ok: true});
        noodle.request.auth.setApiKey("x-key", "top-secret", "header");
        noodle.run.set("digest", noodle.crypto.sha256("value", "hex"));
        noodle.run.set("old", {replaced: true});
        noodle.run.set("temporary", 1);
        noodle.run.unset("temporary");
        console.log("hello", {nested: {value: true}});
      `,
      request({ body: '{"one":1}', bodyType: "json" }),
      { name: "test", vars: { VISIBLE: "yes" } },
      scope,
    )

    expect(execution.result.success).toBe(true)
    expect(execution.request.body).toBe('{"ok":true}')
    expect(execution.request.auth).toEqual({
      type: "api_key",
      key: "x-key",
      value: "top-secret",
      placement: "header",
    })
    expect(scope.get("old")).toEqual({ replaced: true })
    expect(scope.get("temporary")).toBeUndefined()
    expect(scope.get("digest")).toBe(
      "cd42404d52ad55ccfa9aca4adc828aa5800ad9d385a0671fbcbf724118320619",
    )
    expect(execution.result.logs).toEqual([
      { level: "log", message: "hello {nested: {value: true}}" },
    ])
    expect(execution.secretValues).toContain("top-secret")
  })

  it("rolls back staged request and RunScope changes on failure", async () => {
    const scope = new RunScope()
    const original = request()
    const execution = await runPreRequestScript(
      `noodle.request.url = "https://changed.example"; noodle.run.set("value", 1); console.warn("before failure"); throw new Error("boom")`,
      original,
      undefined,
      scope,
    )

    expect(execution.request).toBe(original)
    expect(scope.get("value")).toBeUndefined()
    expect(execution.result).toMatchObject({
      success: false,
      logs: [{ level: "warn", message: "before failure" }],
      error: { name: "ScriptRuntimeError", message: "boom" },
    })
  })

  it("preserves secret status for values committed into RunScope", async () => {
    const scope = new RunScope()
    scope.set("prior", { token: "prior-secret" }, true)
    const execution = await runPreRequestScript(
      `noodle.run.set("random", noodle.crypto.randomBytes(8, "hex"));
       noodle.run.set("environmentCopy", noodle.env.get("SECRET"));
       noodle.run.set("scopeCopy", noodle.run.get("prior").token);
       noodle.request.headers.set("Authorization", "Bearer new-header-secret");
       noodle.run.set("headerCopy", noodle.request.headers.get("Authorization").split(" ")[1]);
       noodle.request.headers.delete("Authorization");
       noodle.run.set("initialHeaderCopy", noodle.request.headers.get("X-Token"));
       noodle.request.headers.delete("X-Token");
       noodle.run.unset("prior")`,
      request({ headers: { "X-Token": "initial-header-secret" } }),
      {
        name: "test",
        vars: { SECRET: "environment-secret" },
        secretVars: { SECRET: "keychain" },
      },
      scope,
    )

    expect(execution.result.success).toBe(true)
    expect(scope.get("prior")).toBeUndefined()
    expect(scope.get("scopeCopy")).toBe("prior-secret")
    expect(scope.secretValues()).toContain(scope.get("random") as string)
    expect(scope.secretValues()).toContain("environment-secret")
    expect(scope.secretValues()).toContain("prior-secret")
    expect(scope.secretValues()).toContain("new-header-secret")
    expect(scope.secretValues()).toContain("initial-header-secret")
  })

  it("rejects unsafe values, imports, oversized sources, and invalid API input", async () => {
    const cases: Array<[string, string]> = [
      [`noodle.run.set("x", {constructor: 1})`, "ScriptApiValidationError"],
      [
        `noodle.run.set("x", Object.create({unsafe: true}))`,
        "ScriptApiValidationError",
      ],
      [
        `const x = []; Object.setPrototypeOf(x, {}); noodle.run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `const x = Object.create({unsafe: true}); Object.getPrototypeOf = () => Object.prototype; noodle.run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `const x = {}; x.self = x; noodle.run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `const x = {}; x.self = x; Set.prototype.has = () => false; noodle.run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [`noodle.run.set("x", Array(1))`, "ScriptApiValidationError"],
      [
        `const a = []; Object.defineProperty(a, "constructor", {value: 1, enumerable: true}); noodle.run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [
        `const a = []; a.extra = undefined; noodle.run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [
        `const a = []; Object.defineProperty(a, "0", {get() { return 1 }, enumerable: true}); noodle.run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [`noodle.run.set("x", {missing: undefined})`, "ScriptApiValidationError"],
      [
        `Object.getOwnPropertyDescriptor = () => ({enumerable: true, value: null}); noodle.run.set("x", {missing: undefined})`,
        "ScriptApiValidationError",
      ],
      [
        `Array.prototype[Symbol.iterator] = function* () {}; noodle.run.set("x", {constructor: 1})`,
        "ScriptApiValidationError",
      ],
      [
        `Array.prototype[Symbol.iterator] = function* () {}; noodle.run.set("x", {missing: undefined})`,
        "ScriptApiValidationError",
      ],
      [`noodle.run.set("x", {callable() {}})`, "ScriptApiValidationError"],
      [
        `noodle.run.set("x", {symbol: Symbol("x")})`,
        "ScriptApiValidationError",
      ],
      [
        `const x = {}; x[Symbol("member")] = true; noodle.run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `noodle.run.set("x", "x".repeat(${SCRIPT_LIMITS.bridgeValueBytes}))`,
        "ScriptApiValidationError",
      ],
      [`import value from "host"`, "ScriptSyntaxError"],
      [`await import("host")`, "ScriptRuntimeError"],
      [`noodle.request.url = "ftp://example.com"`, "ScriptApiValidationError"],
      [`noodle.request.url = ""`, "ScriptApiValidationError"],
      [`noodle.request.method = "TRACE"`, "ScriptApiValidationError"],
      [`noodle.crypto.randomBytes(4097, "hex")`, "ScriptApiValidationError"],
    ]
    for (const [source, name] of cases) {
      const execution = await runPreRequestScript(
        source,
        request(),
        undefined,
        new RunScope(),
      )
      expect(execution.result.error?.name).toBe(name)
    }
    const oversized = await runPreRequestScript(
      " ".repeat(SCRIPT_LIMITS.sourceBytes + 1),
      request(),
      undefined,
      new RunScope(),
    )
    expect(oversized.result.error?.name).toBe("ScriptSourceLimitError")

    const oversizedBridge = await runPreRequestScript(
      `noodle.run.set("x", "x".repeat(5 * 1024 * 1024))`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(oversizedBridge.result.error?.name).toBe("ScriptApiValidationError")

    const recovered = await runPreRequestScript(
      `try { noodle.request.url = "ftp://example.com" } catch {}
       noodle.request.url = "localhost:3000/recovered"`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(recovered.result.success).toBe(true)
    expect(recovered.request.url).toBe("localhost:3000/recovered")
  })

  it("sanitizes thrown values and safely formats unsupported console values", async () => {
    const logged = await runPreRequestScript(
      `const circular = {}; circular.self = circular;
       console.log(circular, undefined, () => {}, Symbol("x"), 1n)`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(logged.result).toMatchObject({
      success: true,
      logs: [
        {
          level: "log",
          message: "{self: [Circular]} undefined [Function] [Symbol] 1n",
        },
      ],
    })

    const thrown = await runPreRequestScript(
      `throw { get name() { throw new Error("/private/host-path") }, get message() { throw new Error("secret") } }`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(thrown.result.error).toEqual({
      name: "ScriptRuntimeError",
      message: "Script execution failed",
    })

    const oversizedThrown = await runPreRequestScript(
      `const huge = "x".repeat(1024 * 1024);
       throw {name: huge, message: huge, stack: huge + " pre-request.js:7:9"}`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(oversizedThrown.result.error).toMatchObject({
      name: "ScriptRuntimeError",
      line: 7,
      column: 9,
    })
    expect(oversizedThrown.result.error?.message.length).toBe(4096)

    const recovered = await runPreRequestScript(
      `noodle.request.headers.set("x-clean", "yes")`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(recovered.result.success).toBe(true)
  })

  it("bounds console output without failing the script", async () => {
    const execution = await runPreRequestScript(
      `for (let i = 0; i < 200; i++) console.log("x".repeat(2000))`,
      request(),
      undefined,
      new RunScope(),
    )
    const bytes = execution.result.logs.reduce(
      (total, entry) =>
        total + new TextEncoder().encode(entry.message).byteLength,
      0,
    )
    expect(execution.result.success).toBe(true)
    expect(execution.result.logs.length).toBeLessThanOrEqual(
      SCRIPT_LIMITS.consoleEntries,
    )
    expect(bytes).toBeLessThanOrEqual(SCRIPT_LIMITS.consoleBytes)

    const single = await runPreRequestScript(
      `console.log("x".repeat(50000))`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(single.result.logs).toEqual([
      { level: "log", message: "x".repeat(50000) },
    ])

    const multibyteBoundary = await runPreRequestScript(
      `console.log("x".repeat(30000));
       console.log("x".repeat(30000));
       console.log("x".repeat(5535));
       console.log("💥");
       console.log("z")`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(
      multibyteBoundary.result.logs.map((entry) => entry.message.length),
    ).toEqual([30000, 30000, 5535])
  })

  it("survives deadline, stack, and repeated memory attacks", async () => {
    const cases: Array<[string, string]> = [
      ["while (true) {}", "ScriptTimeoutError"],
      ["const recurse = () => recurse(); recurse()", "ScriptStackLimitError"],
      [
        'const values = []; while (true) values.push("x".repeat(1024 * 1024))',
        "ScriptMemoryLimitError",
      ],
      [
        'const values = []; while (true) values.push("x".repeat(1024 * 1024))',
        "ScriptMemoryLimitError",
      ],
    ]
    for (const [source, name] of cases) {
      const attacked = await runPreRequestScript(
        source,
        request(),
        undefined,
        new RunScope(),
      )
      expect(attacked.result.error?.name).toBe(name)
      const clean = await runPreRequestScript(
        'noodle.request.headers.set("x-clean", "yes")',
        request(),
        undefined,
        new RunScope(),
      )
      expect(clean.result.success).toBe(true)
    }
    expect(scriptWasmMemoryForTests().buffer.byteLength).toBe(64 * 1024 * 1024)
    expect(() => scriptWasmMemoryForTests().grow(1)).toThrow()
  })
})
