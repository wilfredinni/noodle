import { describe, expect, it } from "bun:test"
import {
  runPreRequestScript,
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
  it("stages durable snapshots without changing baseline reads or transient semantics", async () => {
    const scope = new RunScope()
    const environment = {
      name: "dev",
      vars: { REMOVE: "baseline", TOKEN: "old-secret" },
      secretVars: { TOKEN: "keychain" as const },
    }
    const execution = await runPreRequestScript(
      `
      run.set("VALUE", { count: 1 }, { persist: "environment" });
      run.set("VALUE", 2);
      run.set("TOKEN", "new-secret", { persist: "secret" });
      run.set("TOKEN", "public");
      run.unset("REMOVE", { persist: "environment" });
      if (env.get("REMOVE") !== "baseline" || run.get("REMOVE") !== undefined) throw Error("read semantics");
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
        run.set("KEY", "first", { persist: "environment" });
        run.unset("KEY", { persist: "environment" });
        run.set("KEY", "latest", { persist: "secret" });
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
      'run.set("KEY", 1, {})',
      'run.set("KEY", 1, { persist: "wrong" })',
      'run.set("KEY", 1, { persist: "secret", extra: true })',
      'run.unset("KEY", null)',
      'run.set("_color", "red", { persist: "environment" })',
      'run.set("KEY", "", { persist: "secret" })',
      'for (let i = 0; i < 101; i++) run.set("key" + i, 1, { persist: "environment" })',
      'run.set("a", "x".repeat(140000), { persist: "environment" }); run.set("b", "y".repeat(140000), { persist: "environment" })',
      'run.set("KEY", "secret", { persist: "secret" }); while(true) {}',
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
      run.set("surface", {
        globals: ["request", "env", "run", "crypto", "console"].map(name => [name, members(globalThis[name])]),
        frozen: [request, request.headers, request.params, request.body, request.auth, env, run, crypto, console].every(Object.isFrozen),
        forbidden: [typeof Bun, typeof process, typeof require, typeof module, typeof Deno, typeof fetch, typeof WebSocket, typeof Worker, typeof setTimeout]
      })`,
      request(),
      undefined,
      scope,
    )

    expect(execution.result.success).toBe(true)
    const expected = ["request", "env", "run", "crypto", "console"].map(
      (global) => [
        global,
        SCRIPT_API_CONTRACT.filter(
          (entry) => entry.global === global && entry.member,
        ).map((entry) => entry.member),
      ],
    )
    expect(scope.get("surface")).toEqual({
      globals: expected,
      frozen: true,
      forbidden: Array(9).fill("undefined"),
    })
    expect(
      SCRIPT_API_CONTRACT.every((entry) =>
        entry.phases.every((phase) => phase === "pre" || phase === "post"),
      ),
    ).toBe(true)
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
        if (request.headers.get("DUPLICATE") !== "old") throw new Error("header get");
        request.headers.set("DuPlIcAtE", "new");
        request.headers.delete("last");
        request.params.set("x", "new");
        request.params.append("x", "later");
        request.params.delete("y");
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
        if (env.get("VISIBLE") !== "yes" || env.get("old") !== undefined) throw new Error("env");
        if (request.body.json().one !== 1) throw new Error("body");
        request.body.setJson({ok: true});
        request.auth.setApiKey("x-key", "top-secret", "header");
        run.set("digest", crypto.sha256("value", "hex"));
        run.set("old", {replaced: true});
        run.set("temporary", 1);
        run.unset("temporary");
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
      `request.url = "https://changed.example"; run.set("value", 1); console.warn("before failure"); throw new Error("boom")`,
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
      `run.set("random", crypto.randomBytes(8, "hex"));
       run.set("environmentCopy", env.get("SECRET"));
       run.set("scopeCopy", run.get("prior").token);
       request.headers.set("Authorization", "Bearer new-header-secret");
       run.set("headerCopy", request.headers.get("Authorization").split(" ")[1]);
       request.headers.delete("Authorization");
       run.set("initialHeaderCopy", request.headers.get("X-Token"));
       request.headers.delete("X-Token");
       run.unset("prior")`,
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

  it("rejects unsafe values, async work, oversized sources, and invalid API input", async () => {
    const cases: Array<[string, string]> = [
      [`run.set("x", {constructor: 1})`, "ScriptApiValidationError"],
      [
        `run.set("x", Object.create({unsafe: true}))`,
        "ScriptApiValidationError",
      ],
      [
        `const x = []; Object.setPrototypeOf(x, {}); run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `const x = Object.create({unsafe: true}); Object.getPrototypeOf = () => Object.prototype; run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [`const x = {}; x.self = x; run.set("x", x)`, "ScriptApiValidationError"],
      [
        `const x = {}; x.self = x; Set.prototype.has = () => false; run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [`run.set("x", Array(1))`, "ScriptApiValidationError"],
      [
        `const a = []; Object.defineProperty(a, "constructor", {value: 1, enumerable: true}); run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [
        `const a = []; a.extra = undefined; run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [
        `const a = []; Object.defineProperty(a, "0", {get() { return 1 }, enumerable: true}); run.set("x", {nested: a})`,
        "ScriptApiValidationError",
      ],
      [`run.set("x", {missing: undefined})`, "ScriptApiValidationError"],
      [
        `Object.getOwnPropertyDescriptor = () => ({enumerable: true, value: null}); run.set("x", {missing: undefined})`,
        "ScriptApiValidationError",
      ],
      [
        `Array.prototype[Symbol.iterator] = function* () {}; run.set("x", {constructor: 1})`,
        "ScriptApiValidationError",
      ],
      [
        `Array.prototype[Symbol.iterator] = function* () {}; run.set("x", {missing: undefined})`,
        "ScriptApiValidationError",
      ],
      [`run.set("x", {callable() {}})`, "ScriptApiValidationError"],
      [`run.set("x", {symbol: Symbol("x")})`, "ScriptApiValidationError"],
      [
        `const x = {}; x[Symbol("member")] = true; run.set("x", x)`,
        "ScriptApiValidationError",
      ],
      [
        `run.set("x", "x".repeat(${SCRIPT_LIMITS.bridgeValueBytes}))`,
        "ScriptApiValidationError",
      ],
      [`Promise.resolve(1)`, "ScriptAsyncUnsupportedError"],
      [`Promise.resolve().then(() => 1)`, "ScriptAsyncUnsupportedError"],
      [`import value from "host"`, "ScriptSyntaxError"],
      [`import("host")`, "ScriptAsyncUnsupportedError"],
      [`request.url = "ftp://example.com"`, "ScriptApiValidationError"],
      [`request.url = ""`, "ScriptApiValidationError"],
      [`request.method = "TRACE"`, "ScriptApiValidationError"],
      [`crypto.randomBytes(4097, "hex")`, "ScriptApiValidationError"],
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
      `run.set("x", "x".repeat(5 * 1024 * 1024))`,
      request(),
      undefined,
      new RunScope(),
    )
    expect(oversizedBridge.result.error?.name).toBe("ScriptApiValidationError")

    const recovered = await runPreRequestScript(
      `try { request.url = "ftp://example.com" } catch {}
       request.url = "localhost:3000/recovered"`,
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
      `request.headers.set("x-clean", "yes")`,
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
        'request.headers.set("x-clean", "yes")',
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
