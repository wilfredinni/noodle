import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { CollectionCookieJar } from "../../src/cookies"
import { setSecretBackendForTests } from "../../src/secrets"
import { collectionRun, requestRun } from "../../src/app/services"
import { lang } from "../../src/lang"
import { filestore, saveTimelineEntry, loadTimeline } from "../../src/filestore"
import { buildTimelineEntry } from "../../src/timelineEntry"
import {
  formatRequestRun,
  formatCollectionRun,
} from "../../src/app/humanOutput"
import type { Request } from "../../src/schema"

let dir: string
let server: ReturnType<typeof Bun.serve>
let url: string
let hits: string[]
let jars: CollectionCookieJar[]
const base = (overrides: Partial<Request> = {}): Request => ({
  id: "first",
  name: "First",
  method: "GET",
  url: `${url}/users`,
  headers: {},
  params: [],
  timeout: 0,
  ...overrides,
})
const send = (
  request: Request,
  runScope = new RunScope(),
  cookies?: CollectionCookieJar,
) =>
  executeRequestLifecycle({
    request,
    runScope,
    transport: { proxyPolicy: { kind: "direct", source: "cli" }, cookies },
  })
const save = (request: Request) =>
  writeFile(join(dir, `${request.id}.yml`), lang.serializeRequest(request))

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-tests-"))
  hits = []
  jars = []
  const vault = new Map<string, string>()
  setSecretBackendForTests({
    async get({ service, name }) {
      return vault.get(`${service}:${name}`) ?? null
    },
    async set({ service, name, value }) {
      vault.set(`${service}:${name}`, value)
    },
    async delete({ service, name }) {
      return vault.delete(`${service}:${name}`)
    },
  })
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      hits.push(path)
      if (path === "/redirect")
        return new Response(null, {
          status: 303,
          headers: { location: "/users?final=yes" },
        })
      return Response.json(
        {
          id: 7,
          token: "captured-secret",
          header: request.headers.get("X-Folder"),
          auth: request.headers.get("Authorization"),
        },
        {
          status: path === "/error" ? 422 : 200,
          headers: { "set-cookie": "received=cookie-secret; Path=/; HttpOnly" },
        },
      )
    },
  })
  url = `http://127.0.0.1:${server.port}`
})
afterEach(async () => {
  await Promise.all(jars.map((jar) => jar.close()))
  server?.stop(true)
  setSecretBackendForTests(undefined)
  await rm(dir, { recursive: true, force: true })
})

describe("inline tests lifecycle", () => {
  it("runs after folder resolution, substitution, pre, HTTP, capture, post and assertions", async () => {
    await mkdir(join(dir, "folder"))
    await writeFile(
      join(dir, "folder/folder.yml"),
      "headers:\n  X-Folder: $VALUE\n",
    )
    const req = base({
      id: "folder/first",
      scripts: {
        pre: 'if(noodle.request.headers.get("X-Folder") !== "scope") throw Error("merge/substitute"); noodle.run.set("stage", "pre"); noodle.request.headers.set("X-Pre", "prepared");',
        post: 'if(noodle.run.get("id") !== 7 || noodle.run.get("stage") !== "pre") throw Error("capture order"); noodle.run.set("stage", "post");',
      },
      captures: { id: { value: "body.id", enabled: true } },
      assertions: [{ expression: "body.id", operator: "equals", value: 7 }],
      tests:
        'test("order",()=>{expect(noodle.run.get("stage")).toBe("assertions"); expect(noodle.request.headers.get("X-Pre")).toBe("prepared"); expect(noodle.response.json().header).toBe("scope"); expect(noodle.env.get("VALUE")).toBe("baseline"); expect("$UNRESOLVED").toBe("$UNRESOLVED")})',
    })
    await save(req)
    const scope = new RunScope()
    scope.set("VALUE", "scope")
    const result = await executeRequestLifecycle({
      request: req,
      runScope: scope,
      collection: await filestore.loadCollection(dir),
      requestPath: req.id,
      environment: { name: "dev", vars: { VALUE: "baseline" } },
      transport: { proxyPolicy: { kind: "direct", source: "cli" } },
      persistCaptures: async (_req, _captures, execution) => {
        expect(scope.get("stage")).toBe("post")
        expect(execution.assertions?.results[0]?.passed).toBe(true)
        scope.set("stage", "assertions")
        return execution
      },
    })
    expect(result.status).toBe("done")
    expect(result.execution.tests?.results).toMatchObject([
      { name: "order", passed: true },
    ])
  })
  it("captures the final prepared leg for tests-only requests", async () => {
    const result = await send(
      base({
        method: "POST",
        url: `${url}/redirect`,
        body: "original",
        tests: `test("snapshot",()=>{expect(noodle.request.method).toBe("GET"); expect(noodle.request.url).toBe("${url}/users?final=yes"); expect(noodle.request.body.text()).toBeNull()})`,
      }),
    )
    expect(result.execution.tests?.results[0]?.passed).toBe(true)
    expect(hits).toEqual(["/redirect", "/users"])
  })
  it("evaluates every combination of HTTP, capture, post, assertion and test failures", async () => {
    for (let flags = 0; flags < 32; flags++) {
      await save(
        base({
          url: `${url}/${flags & 1 ? "error" : "users"}`,
          captures: {
            id: {
              value: flags & 2 ? "body.missing" : "body.id",
              enabled: true,
            },
          },
          scripts: { post: flags & 4 ? 'throw Error("post failed")' : "" },
          assertions: [
            {
              expression: "body.id",
              operator: "equals",
              value: flags & 8 ? 8 : 7,
            },
          ],
          tests: `test("checked",()=>expect(noodle.response.json().id).toBe(${flags & 16 ? 8 : 7})); test("continued",()=>{});`,
        }),
      )
      const { result, failed } = await requestRun(
        "first",
        dir,
        undefined,
        undefined,
        true,
      )
      expect(result.tests?.evaluated).toBe(true)
      expect(result.tests?.results.map((test) => test.passed)).toEqual([
        !(flags & 16),
        true,
      ])
      const categories = [
        [4, "script"],
        [1, "http"],
        [2, "capture"],
        [8, "assertion"],
        [16, "test"],
      ] as const
      expect(result.failureCategories).toEqual(
        categories
          .filter(([bit]) => flags & bit)
          .map(([, category]) => category),
      )
      expect(result.ok).toBe(flags === 0)
      expect(failed).toBe(flags !== 0)
    }
  })
  it("leaves tests unevaluated on pre or transport failures and omits legacy groups", async () => {
    const failedPre = await send(
      base({
        scripts: { pre: 'throw Error("pre")' },
        tests: 'test("never",()=>{})',
      }),
    )
    expect(failedPre.execution.tests).toEqual({
      evaluated: false,
      results: [],
      logs: [],
    })
    expect(hits).toEqual([])
    expect((await send(base())).execution).not.toHaveProperty("tests")
    expect((await send(base({ tests: "" }))).execution.tests).toMatchObject({
      evaluated: true,
      results: [],
      logs: [],
    })
    server.stop(true)
    const failedTransport = await send(base({ tests: 'test("never",()=>{})' }))
    expect(failedTransport.status).toBe("error")
    expect(failedTransport.execution.tests).toEqual({
      evaluated: false,
      results: [],
      logs: [],
    })
  })
  it("retains captures and successful post state after failed tests and applies fail-fast after diagnostics", async () => {
    await save(
      base({
        id: "a",
        captures: { id: { value: "body.id", enabled: true } },
        scripts: { post: 'noodle.run.set("post", 9)' },
        tests:
          'test("failure",()=>{expect(noodle.run.get("id")).toBe(7); expect(noodle.run.get("post")).toBe(9); expect(1).toBe(2)}); test("after failure",()=>{}); console.log("test log");',
      }),
    )
    await save(
      base({
        id: "b",
        tests:
          'test("shared",()=>{expect(noodle.run.get("id")).toBe(7); expect(noodle.run.get("post")).toBe(9)})',
      }),
    )
    const continued = await collectionRun(dir, undefined, undefined, true)
    expect(continued.results.map((result) => result.ok)).toEqual([false, true])
    expect(continued.summary).toMatchObject({
      testPasses: 2,
      testFailures: 1,
      testScriptErrors: 0,
      failureCategories: ["test"],
    })
    const stopped = await collectionRun(
      dir,
      undefined,
      undefined,
      true,
      undefined,
      false,
      [],
      [],
      [],
      true,
    )
    expect(stopped.skipped).toEqual([{ id: "b", reason: "fail-fast" }])
    expect(stopped.results[0]?.tests?.results).toHaveLength(2)
    const human = formatCollectionRun(stopped)
    expect(human).toContain("Tests: 1 passed, 1 failed, 0 script errors")
    expect(human).toContain("Expected value to satisfy toBe")
    expect(human).not.toContain("test log")
  })
  it("reports a top-level test error without inventing failed named tests", async () => {
    await save(
      base({
        tests:
          'test("passed",()=>{}); console.warn("kept"); throw Error("outside")',
      }),
    )
    const output = await requestRun("first", dir, undefined, undefined, true)
    expect(output.result).toMatchObject({
      ok: false,
      failureCategories: ["test"],
      tests: {
        results: [{ name: "passed", passed: true }],
        logs: [{ level: "warn", message: "kept" }],
        error: { message: "outside" },
      },
    })
    expect(formatRequestRun(output)).toContain(
      "Test script error: ScriptRuntimeError: outside",
    )
    expect(
      (await collectionRun(dir, undefined, undefined, true)).summary,
    ).toMatchObject({ testPasses: 1, testFailures: 0, testScriptErrors: 1 })
  })
  it("offers read-only final-URL cookies after post and preserves the jar on test failures", async () => {
    const jar = await CollectionCookieJar.open(dir, "test-cookie")
    jars.push(jar)
    const scope = new RunScope()
    const result = await send(
      base({
        url: `${url}/redirect`,
        scripts: {
          post: 'noodle.cookies.set({name:"post",value:"post-cookie",path:"/"}); noodle.run.set("post",true)',
        },
        tests: `
      test("read",()=>{expect(noodle.cookies.get("post")).toBe("post-cookie");expect(noodle.cookies.get("received")).toBe("cookie-secret");expect(noodle.run.get("post")).toBe(true)});
      test("write",()=>noodle.cookies.set({name:"changed",value:"x"}));
      test("delete",()=>noodle.cookies.delete("received"));
    `,
      }),
      scope,
      jar,
    )
    expect(result.execution.tests?.results.map((test) => test.passed)).toEqual([
      true,
      false,
      false,
    ])
    expect(result.execution.tests?.results[1]?.message).toBe(
      "cookies is read-only in tests",
    )
    expect(jar.cookieHeaderFor(`${url}/users`)).toContain(
      "received=cookie-secret",
    )
    expect(jar.cookieHeaderFor(`${url}/users`)).not.toContain("changed=")
    const suppressed = await send(
      base({
        sendCookies: false,
        tests:
          'test("suppressed",()=>expect(typeof noodle.cookies).toBe("undefined"))',
      }),
      new RunScope(),
      jar,
    )
    expect(suppressed.execution.tests?.results[0]?.passed).toBe(true)
  })
  it("redacts names, errors and logs, including short and late-discovered secrets, before timeline persistence", async () => {
    const req = base({
      auth: { type: "bearer", token: "original-auth" },
      scripts: {
        pre: 'noodle.request.auth.setBearer("created-auth")',
        post: 'noodle.crypto.hmacSha256("late-secret", "x", "hex")',
      },
      captures: {
        token: { value: "body.token", enabled: true, persist: "secret" },
      },
      tests: `console.log("late-secret created-auth original-auth captured-secret cookie-secret short");
        test(noodle.env.get("TOKEN"),()=>{throw Error(noodle.run.get("token") + " created-auth cookie-secret short")});
        console.log("test-secret"); noodle.crypto.hmacSha256("test-secret", "x", "hex");
        throw Error("original-auth test-secret");`,
    })
    const result = await executeRequestLifecycle({
      request: req,
      runScope: new RunScope(),
      environment: {
        name: "dev",
        vars: { TOKEN: "short", TINY: "x" },
        secretVars: { TOKEN: "keychain", TINY: "keychain" },
      },
      transport: { proxyPolicy: { kind: "direct", source: "cli" } },
    })
    expect(result.status).toBe("done")
    if (result.status !== "done") throw Error("missing response")
    const output = JSON.stringify(result.execution)
    for (const secret of [
      "original-auth",
      "created-auth",
      "captured-secret",
      "cookie-secret",
      "late-secret",
      "test-secret",
      "short",
    ])
      expect(output).not.toContain(secret)
    expect(result.execution.tests?.results[0]?.name).toBe("[REDACTED]")
    const entry = buildTimelineEntry(
      result.request,
      {
        status: "done",
        response: result.response,
        execution: result.execution,
      },
      "dev",
      undefined,
      result.secretValues,
      true,
    )
    await saveTimelineEntry(dir, req.id, entry)
    const loaded = await loadTimeline(dir, req.id)
    expect(loaded[0]?.tests).toEqual(entry.tests)
    expect(loaded[0]?.request).not.toHaveProperty("tests")
    const persisted = await readFile(join(dir, ".timeline/first.yml"), "utf8")
    for (const secret of [
      "created-auth",
      "captured-secret",
      "cookie-secret",
      "test-secret",
    ])
      expect(persisted).not.toContain(secret)
    const bounded = await saveTimelineEntry(dir, "bounded", {
      ...entry,
      tests: {
        evaluated: true,
        results: [
          {
            name: "n".repeat(11000),
            passed: false,
            message: "m".repeat(11000),
            durationMs: 0,
          },
        ],
        logs: [{ level: "log", message: "l".repeat(11000) }],
        error: { name: "Error", message: "e".repeat(11000) },
      },
    })
    expect(bounded.tests?.results[0]?.name).toBe("[TRUNCATED]")
    expect(bounded.tests?.results[0]?.message).toBe("[TRUNCATED]")
    expect(bounded.tests?.logs).toEqual([
      { level: "warn", message: "[TRUNCATED]" },
    ])
    expect(bounded.tests?.error?.message).toBe("[TRUNCATED]")
  })
  it("redacts before error cleanup and discards partial oversized diagnostics", async () => {
    for (const secret of [
      "alpha\nbravo",
      "S".repeat(5000),
      "界".repeat(3000),
    ]) {
      const result = await executeRequestLifecycle({
        request: base({
          tests: `
            test(noodle.env.get("TOKEN"), () => { throw Error("prefix " + noodle.env.get("TOKEN") + " end") });
            test("late", () => { throw Error("future\\nsecret") });
            noodle.crypto.hmacSha256("future\\nsecret", "x", "hex");
            test("oversized", () => { throw Error("z".repeat(270000)) });
            console.log(noodle.env.get("TOKEN"));
            console.log("p".repeat(65530) + "boundary-secret");
            throw Error(noodle.env.get("TOKEN"));
          `,
        }),
        environment: {
          name: "dev",
          vars: { TOKEN: secret },
          secretVars: { TOKEN: "keychain" },
        },
        runScope: new RunScope(),
        transport: { proxyPolicy: { kind: "direct", source: "cli" } },
      })
      const tests = result.execution.tests!
      expect(tests.results[0]).toMatchObject({
        name: "[REDACTED]",
        message: "prefix [REDACTED] end",
        passed: false,
      })
      expect(tests.results[1]?.message).toBe("[REDACTED]")
      expect(tests.results[2]?.message).toBe("[TRUNCATED]")
      expect(tests.error?.message).toBe("[REDACTED]")
      expect(tests.logs.map((log) => log.message)).toEqual([
        "[REDACTED]",
        "[TRUNCATED]",
      ])
      expect(JSON.stringify(tests)).not.toContain("alpha bravo")
      expect(JSON.stringify(tests)).not.toContain("SSSSSS")
    }
  })
})
