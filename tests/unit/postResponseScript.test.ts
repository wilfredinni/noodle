import { describe, expect, it } from "bun:test"
import {
  runRequestScript,
  SCRIPT_LIMITS,
  scriptWasmMemoryForTests,
} from "../../src/preRequestScript"
import { RunScope } from "../../src/runScope"
import type { Response } from "../../src/schema"

const request = {
  id: "request",
  name: "Request",
  method: "GET" as const,
  url: "http://localhost/api/users?x=1",
  timeout: 0,
  headers: { "X-Read": "yes" },
  params: [{ name: "x", value: "1", enabled: true }],
  body: '{"request":true}',
  bodyType: "json" as const,
}
const response: Response = {
  status: 201,
  statusText: "Created",
  timeMs: 12.5,
  headers: { "Content-Type": "application/json", "X-Test": "value" },
  body: '{"id":7}',
}
const runPost = (
  source: string,
  body = response.body,
  scope = new RunScope(),
) =>
  runRequestScript("post", source, request, undefined, scope, {
    response: { ...response, body },
  })

describe("post-response sandbox", () => {
  it("rejects external-looking sources without interpreting comments or regex as files", async () => {
    for (const source of [
      "./post.js",
      "/tmp/post",
      "@/post.ts",
      "C:\\post.mjs",
    ])
      expect((await runPost(source)).result.error?.message).toContain(
        "Post-response scripts must be inline source",
      )
    for (const source of ["// post.js", "/* post.js */", "/inline/g", ""])
      expect((await runPost(source)).result.success).toBe(true)
  })
  it("reads metadata, headers, final request readers and isolated frozen APIs", async () => {
    const scope = new RunScope()
    const result = await runPost(
      `noodle.run.set("read", {
      status: noodle.response.status, statusText: noodle.response.statusText, time: noodle.response.timeMs,
      header: noodle.response.headers.get("CONTENT-type"), exists: noodle.response.headers.has("x-TEST"), missing: noodle.response.headers.get("missing"),
      url: noodle.request.url, method: noodle.request.method, requestHeader: noodle.request.headers.get("x-read"), param: noodle.request.params.get("x"), body: noodle.request.body.json(),
      frozen: Object.isFrozen(noodle.response) && Object.isFrozen(noodle.response.headers), nullPrototype: Object.getPrototypeOf(noodle.response) === null,
      cookies: typeof noodle.cookies, host: [typeof Bun, typeof fetch, typeof process]
    });`,
      response.body,
      scope,
    )
    expect(result.result).toMatchObject({ phase: "post", success: true })
    expect(scope.get("read")).toEqual({
      status: 201,
      statusText: "Created",
      time: 12.5,
      header: "application/json",
      exists: true,
      missing: null,
      url: request.url,
      method: "GET",
      requestHeader: "yes",
      param: "1",
      body: { request: true },
      frozen: true,
      nullPrototype: true,
      cookies: "undefined",
      host: ["undefined", "undefined", "undefined"],
    })
  })

  it("uses the captured native parser and caches JSON, including null and failures", async () => {
    const scope = new RunScope()
    expect(
      (
        await runPost(
          `JSON.parse = () => { throw Error("tampered") }; const first = noodle.response.json(); first.id = 9; noodle.run.set("cached", noodle.response.json() === first); noodle.run.set("id", noodle.response.json().id);`,
          response.body,
          scope,
        )
      ).result.success,
    ).toBe(true)
    expect(scope.get("cached")).toBe(true)
    expect(scope.get("id")).toBe(9)
    expect(response.body).toBe('{"id":7}')
    expect(
      (
        await runPost(
          `noodle.run.set("null_value", noodle.response.json()); if (noodle.response.json() !== null) throw Error("cache");`,
          "null",
          scope,
        )
      ).result.success,
    ).toBe(true)
    expect(scope.get("null_value")).toBeNull()
    expect(
      (
        await runPost(
          `let errors = []; for (let i=0;i<2;i++) { try { noodle.response.json() } catch (e) { errors.push(e.name + ":" + e.message) } } noodle.run.set("errors", errors);`,
          "invalid",
          scope,
        )
      ).result.success,
    ).toBe(true)
    expect(scope.get("errors")).toEqual(
      Array(2).fill("ScriptApiValidationError:response body is not valid JSON"),
    )
    expect(
      (await runPost("noodle.response.json()", "invalid")).result.error,
    ).toMatchObject({ name: "ScriptApiValidationError", line: 1 })
    expect(
      (
        await runPost(
          `if (noodle.response.json().id !== 7) throw Error("leaked cache")`,
        )
      ).result.success,
    ).toBe(true)
  })

  it("centrally rejects every request mutator and rolls back only staged run values", async () => {
    for (const mutation of [
      `noodle.request.url = "https://elsewhere.test"`,
      `noodle.request.method = "POST"`,
      `noodle.request.headers.set("x", "y")`,
      `noodle.request.headers.delete("x")`,
      `noodle.request.params.set("x", "y")`,
      `noodle.request.params.append("x", "y")`,
      `noodle.request.params.delete("x")`,
      `noodle.request.body.setText("x")`,
      `noodle.request.body.setJson({x:1})`,
      `noodle.request.body.clear()`,
      `noodle.request.auth.clear()`,
      `noodle.request.auth.setBearer("x")`,
      `noodle.request.auth.setBasic("x", "y")`,
      `noodle.request.auth.setApiKey("x", "y", "header")`,
    ]) {
      const scope = new RunScope()
      scope.set("prior", 1)
      const result = await runPost(
        `console.log("before"); noodle.run.set("prior", 2); noodle.run.set("staged", 1); ${mutation}`,
        response.body,
        scope,
      )
      expect(result.result).toMatchObject({
        success: false,
        error: {
          name: "ScriptApiValidationError",
          message: "request is read-only in post-response scripts",
        },
        logs: [{ level: "log", message: "before" }],
      })
      expect(scope.get("prior")).toBe(1)
      expect(scope.get("staged")).toBeUndefined()
      expect(result.request).toBe(request)
    }
  })

  it("accepts exact UTF-8 and escape-heavy 5 MiB bodies without envelope expansion", async () => {
    const limit = SCRIPT_LIMITS.responseBodyBytes
    for (const body of [
      "x".repeat(limit),
      "\n".repeat(limit),
      "😀".repeat(limit / 4),
    ]) {
      const scope = new RunScope()
      expect(
        (
          await runPost(
            `noodle.run.set("length", noodle.response.text().length); if (noodle.response.text() !== noodle.response.text()) throw Error("cache")`,
            body,
            scope,
          )
        ).result.success,
      ).toBe(true)
      expect(scope.get("length")).toBe(body.length)
    }
    const json = JSON.stringify({ padding: "x".repeat(limit - 14) })
    expect(Buffer.byteLength(json)).toBe(limit)
    expect(
      (
        await runPost(
          `if (noodle.response.json().padding.length !== ${limit - 14}) throw Error("truncated")`,
          json,
        )
      ).result.success,
    ).toBe(true)
    for (const body of ["x".repeat(limit + 1), "😀".repeat(limit / 4) + "é"]) {
      expect(
        (await runPost("noodle.response.text()", body)).result.error?.message,
      ).toContain(`exceeds ${limit} bytes`)
      expect(
        (await runPost("noodle.response.status", body)).result.success,
      ).toBe(true)
    }
    expect(
      (
        await runPost(
          "noodle.run.set('large', noodle.response.text())",
          "x".repeat(256 * 1024),
        )
      ).result.success,
    ).toBe(false)
  })

  it("recovers after post memory and deadline failures with fixed WASM memory", async () => {
    const hostileJson = "[" + "{},".repeat(1_000_000) + "{}]"
    expect(
      (await runPost("noodle.response.json()", hostileJson)).result.error?.name,
    ).toBe("ScriptMemoryLimitError")
    expect((await runPost("noodle.response.json()")).result.success).toBe(true)
    for (const source of [
      `const a=[]; while(true) a.push("x".repeat(1024*1024));`,
      `while(true) {}`,
    ]) {
      const result = await runPost(source)
      expect(result.result.success).toBe(false)
      expect(result.result.error?.name).toMatch(
        /Script(?:MemoryLimit|Timeout)Error/,
      )
      expect(
        (
          await runPost(
            `if (noodle.response.json().id !== 7) throw Error("recovery")`,
          )
        ).result.success,
      ).toBe(true)
      expect(scriptWasmMemoryForTests().buffer.byteLength).toBe(
        64 * 1024 * 1024,
      )
    }
  })
})
