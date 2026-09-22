import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { runPreRequestScript, SCRIPT_LIMITS } from "../../src/preRequestScript"
import { RunScope } from "../../src/runScope"
import type { Collection, Request } from "../../src/schema"
import { executor } from "../../src/requests"
import type { TransportExecutionOptions } from "../../src/requests/send"
import { buildTimelineEntry } from "../../src/timelineEntry"

let server: ReturnType<typeof Bun.serve>
let url: string
let seen: { path: string; authorization: string | null; body: string }[]
const request = (id = "root", overrides: Partial<Request> = {}): Request => ({
  id,
  name: id,
  method: "GET",
  url: `${url}/${id}`,
  timeout: 0,
  headers: {},
  params: [],
  ...overrides,
})
const collection = (requests: Request[]): Collection => ({
  id: "test",
  name: "Test",
  items: requests.map((data) => ({ type: "request", data })),
})
const run = (
  root: Request,
  children: Request[] = [],
  scope = new RunScope(),
  signal?: AbortSignal,
) =>
  executeRequestLifecycle({
    request: root,
    collection: collection([root, ...children]),
    requestPath: root.id,
    runScope: scope,
    transport: { signal, proxyPolicy: { kind: "direct", source: "cli" } },
  })

beforeEach(() => {
  seen = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const body = await req.text()
      seen.push({ path, authorization: req.headers.get("authorization"), body })
      return Response.json(
        { token: "child-token", id: 7, body },
        {
          status: path === "/error" ? 422 : 200,
          headers: {
            "x-child": "yes",
            ...(path === "/secret"
              ? { authorization: "Bearer child-token" }
              : {}),
          },
        },
      )
    },
  })
  url = `http://127.0.0.1:${server.port}`
})
afterEach(() => {
  server.stop(true)
})

describe("async request scripts", () => {
  it("redacts URL credentials from child diagnostics and manual history", async () => {
    for (const kind of ["http", "saved"]) {
      for (const credential of ["userinfo", "api_key", "access_token"]) {
        const secret = "child password"
        const encoded =
          credential === "access_token"
            ? "child+password"
            : encodeURIComponent(secret)
        const childUrl =
          credential === "userinfo"
            ? `${url.replace("//", `//audit-user:${encoded}@`)}/error`
            : `${url}/error?${credential}=${encoded}&page=2`
        const child = request("child", { url: childUrl })
        const root = request("root", {
          scripts: {
            pre: `
            try {
              await ${kind === "saved" ? 'noodle.runRequest("child")' : `noodle.sendRequest({url: ${JSON.stringify(child.url)}})`};
            } catch { console.log(${JSON.stringify(secret)}, ${JSON.stringify(encoded)}); }
          `,
          },
        })
        const result = await run(root, [child])
        expect(result.status).toBe("done")
        const entry = buildTimelineEntry(
          result.request,
          result,
          undefined,
          undefined,
          result.secretValues,
          true,
        )
        for (const output of [result.execution, entry]) {
          expect(JSON.stringify(output)).not.toContain(secret)
          expect(JSON.stringify(output)).not.toContain(encoded)
          expect(JSON.stringify(output)).toContain("[REDACTED]")
        }
      }
    }
  })

  it("excludes network wait from CPU time and propagates cancellation through nested calls", async () => {
    let started!: () => void
    let release!: () => void
    let timer: ReturnType<typeof setTimeout> | undefined
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    server.reload({
      fetch: async () => {
        started()
        await new Promise<void>((resolve) => {
          release = resolve
          // This is the response latency being tested, not a wait for test state.
          timer = setTimeout(resolve, SCRIPT_LIMITS.deadlineMs + 100)
        })
        return Response.json({ id: 7 })
      },
    })
    const options = { ...request(), headers: {} }
    const delayed = await runPreRequestScript(
      'await noodle.sendRequest({url: "unused"}); noodle.run.set("DONE", true)',
      options,
      undefined,
      new RunScope(),
      {
        execute: async (_kind, _input, _scope, signal) => {
          const response = await fetch(url, { signal })
          return {
            response: {
              status: 200,
              statusText: "OK",
              timeMs: 600,
              headers: {},
              body: await response.text(),
            },
            failureCategories: [],
          }
        },
      },
    )
    expect(delayed.result.success).toBe(true)
    expect(delayed.result.durationMs).toBeGreaterThan(500)
    clearTimeout(timer)
    const controller = new AbortController()
    let notify!: () => void
    const secondEntered = new Promise<void>((resolve) => {
      notify = resolve
    })
    server.reload({
      fetch: async () => {
        notify()
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return Response.json({ id: 7 })
      },
    })
    const running = run(
      request("root", { scripts: { pre: 'await noodle.runRequest("child")' } }),
      [request("child")],
      new RunScope(),
      controller.signal,
    )
    await entered
    await secondEntered
    controller.abort()
    await expect(running).rejects.toMatchObject({ name: "AbortError" })
    release()
  })

  it("bounds waiting requests by the ancestor deadline and retains no late variable writes", async () => {
    const scope = new RunScope()
    let cancelled = false
    const result = await runPreRequestScript(
      'await noodle.runRequest("child"); noodle.run.set("LATE", true)',
      { ...request(), headers: {} },
      undefined,
      scope,
      {
        deadline: Date.now() + 30,
        execute: async (_kind, _input, _scope, signal) => {
          await new Promise<void>((resolve) => {
            if (signal.aborted) {
              cancelled = true
              resolve()
            } else
              signal.addEventListener(
                "abort",
                () => {
                  cancelled = true
                  resolve()
                },
                { once: true },
              )
          })
          return { failureCategories: ["transport"] }
        },
      },
    )
    expect(result.result.error?.name).toBe("ScriptWallTimeoutError")
    expect(cancelled).toBe(true)
    expect(scope.get("LATE")).toBeUndefined()
  })

  it("inherits transport policy but not parent credentials, and disables interactive child OAuth", async () => {
    const original = executor.send
    const calls: {
      request: Parameters<typeof executor.send>[0]
      options?: TransportExecutionOptions
    }[] = []
    executor.send = async (request, options) => {
      calls.push({ request, options })
      return {
        status: 200,
        statusText: "OK",
        timeMs: 1,
        headers: {},
        body: "null",
      }
    }
    try {
      const root = request("root", {
        auth: { type: "bearer", token: "parent-secret" },
        scripts: {
          pre: `
        await noodle.runRequest("child");
        const response = await noodle.sendRequest({ url: ${JSON.stringify(url)} });
        if (response.json() !== null || response.json() !== null) throw Error("JSON null");
      `,
        },
      })
      const child = request("child", {
        auth: { type: "bearer", token: "child-secret" },
      })
      const proxyPolicy = { kind: "direct" as const, source: "cli" as const }
      const tlsPolicy = { collectionDir: "/unused", insecure: true }
      const result = await executeRequestLifecycle({
        request: root,
        runScope: new RunScope(),
        collection: collection([root, child]),
        transport: { proxyPolicy, tlsPolicy, oauthMode: "interactive" },
      })
      expect(result.status).toBe("done")
      expect(calls.map(({ options }) => options?.oauthMode)).toEqual([
        "cached-only",
        "cached-only",
        "interactive",
      ])
      expect(
        calls.every(({ options }) => options?.proxyPolicy === proxyPolicy),
      ).toBe(true)
      expect(
        calls.every(({ options }) => options?.tlsPolicy === tlsPolicy),
      ).toBe(true)
      expect(calls[0]?.request.auth).toEqual(child.auth)
      expect(calls[1]?.request.auth).toBeUndefined()
      expect(calls[1]?.request.headers).toEqual({})
      expect(calls[2]?.request.auth).toEqual(root.auth)
    } finally {
      executor.send = original
    }
  })

  it("validates literal request options and preserves lazy response reader limits", async () => {
    for (const options of [
      null,
      {},
      { url, extra: true },
      { url, method: "TRACE" },
      { url, timeout: -1 },
      { url, timeout: null },
      { url, body: {} },
      { url, headers: { bad: 1 } },
      { url: "ftp://example.test" },
    ]) {
      const result = await run(
        request("root", {
          scripts: {
            pre: `await noodle.sendRequest(${JSON.stringify(options)})`,
          },
        }),
      )
      expect(result.status).toBe("error")
    }
    expect(seen).toEqual([])
    server.reload({
      fetch: () =>
        new Response("x".repeat(SCRIPT_LIMITS.responseBodyBytes + 1)),
    })
    const result = await run(
      request("root", {
        scripts: {
          pre: `
      const response = await noodle.sendRequest({url: ${JSON.stringify(url)}});
      if (response.status !== 200) throw Error("metadata unavailable");
      response.text();
    `,
        },
      }),
    )
    expect(result.status).toBe("error")
    expect(result.execution.scripts?.results[0]?.error?.message).toContain(
      "response body exceeds",
    )
  })

  it("chains saved and literal requests, shares captures, and edits the current request explicitly", async () => {
    const scope = new RunScope()
    const login = request("login", {
      headers: { "X-Input": { value: "$INPUT", enabled: true } },
      captures: { TOKEN: { value: "body.token", enabled: true } },
      scripts: {
        pre: 'await Promise.resolve(); noodle.run.set("PRE", 1)',
        post: 'noodle.run.set("POST", noodle.run.get("PRE") + 1)',
      },
      tests:
        'test("async", async () => { await 1; expect(noodle.response.status).toBe(200) })',
    })
    const result = await run(
      request("root", {
        scripts: {
          pre: `
      noodle.run.set("INPUT", "parent");
      const login = await noodle.runRequest("login");
      if (login.headers.get("X-CHILD") !== "yes" || login.headers.has("absent")) throw Error("headers");
      if (!login.execution.tests.results[0].passed || noodle.run.get("POST") !== 2) throw Error("lifecycle");
      if (!Object.isFrozen(login) || !Object.isFrozen(login.json())) throw Error("mutable response");
      if (login.json() !== login.json()) throw Error("uncached JSON");
      const token = noodle.run.get("TOKEN");
      noodle.request.headers.set("Authorization", "Bearer " + token);
      const profile = await noodle.sendRequest({ url: ${JSON.stringify(url + "/profile")}, method: "POST", body: "$LITERAL", headers: { Authorization: "Bearer " + token } });
      noodle.run.set("ID", profile.json().id);
    `,
        },
      }),
      [login],
      scope,
    )
    expect(result.status).toBe("done")
    expect(result.execution.scripts?.results[0]?.error).toBeUndefined()
    expect(scope.get("TOKEN")).toBe("child-token")
    expect(scope.get("ID")).toBe(7)
    expect(seen.map((item) => item.path)).toEqual([
      "/login",
      "/profile",
      "/root",
    ])
    expect(seen[1]?.body).toBe("$LITERAL")
    expect(seen[2]?.authorization).toBe("Bearer child-token")
    expect(
      result.execution.scripts?.results[0]?.requests?.map(
        ({ kind, success }) => [kind, success],
      ),
    ).toEqual([
      ["saved", true],
      ["http", true],
    ])
  })

  it("rolls back parent and child values while preserving earlier values and secret redaction", async () => {
    const scope = new RunScope()
    scope.set("KEEP", "before")
    const child = request("child", {
      url: `${url}/secret`,
      captures: { CHILD: { value: "body.id", enabled: true } },
      scripts: {
        post: 'noodle.run.set("KEEP", "child"); noodle.run.set("SECRET", noodle.response.json().token, { persist: "secret" })',
      },
    })
    const result = await run(
      request("root", {
        scripts: {
          pre: `
      noodle.run.set("PARENT", 1);
      const child = await noodle.runRequest("child");
      if (noodle.run.get("KEEP") !== "child" || noodle.run.get("CHILD") !== 7) throw Error("visibility");
      console.log(child.json().token);
      throw Error(child.json().token);
    `,
        },
      }),
      [child],
      scope,
    )
    expect(result.status).toBe("error")
    expect(scope.get("KEEP")).toBe("before")
    expect(scope.get("PARENT")).toBeUndefined()
    expect(scope.get("CHILD")).toBeUndefined()
    expect(scope.get("SECRET")).toBeUndefined()
    expect(scope.secretValues()).toContain("child-token")
    expect(JSON.stringify(result.execution)).not.toContain("child-token")
    expect(seen.map((item) => item.path)).toEqual(["/secret"])
  })

  it("throws inspectable child failures and allows a successful fallback without merging failed values", async () => {
    const scope = new RunScope()
    const child = request("child", {
      url: `${url}/error`,
      captures: { LOST: { value: "body.id", enabled: true } },
      tests: 'test("fail", async () => { await 1; expect(1).toBe(2) })',
    })
    const result = await run(
      request("root", {
        scripts: {
          pre: `
      try { await noodle.runRequest("child"); throw Error("expected failure"); }
      catch (error) {
        if (error.name !== "ScriptRequestError" || error.response.status !== 422 || error.response.json().id !== 7) throw error;
        if (!error.failureCategories.includes("http") || !error.failureCategories.includes("test")) throw Error("categories");
        if (noodle.run.get("LOST") !== undefined) throw Error("leaked child value");
        noodle.run.set("RECOVERED", true);
      }
    `,
        },
      }),
      [child],
      scope,
    )
    expect(result.status).toBe("done")
    expect(scope.get("RECOVERED")).toBe(true)
    expect(result.execution.scripts?.results[0]?.requests?.[0]).toMatchObject({
      success: false,
      status: 422,
      failureCategories: ["http", "test"],
      error: {
        name: "ScriptRequestError",
        message: "Called request failed: http, test (HTTP 422)",
      },
    })
  })

  it("keeps nested persistence transient and preserves actual write order and unsets", async () => {
    const scope = new RunScope()
    scope.set("UNSET", "before")
    const child = request("child", {
      scripts: {
        pre: 'noodle.run.set("KEY", "child", { persist: "environment" }); noodle.run.unset("UNSET", { persist: "environment" })',
      },
    })
    const root = request("root", {
      scripts: {
        pre: `
      noodle.run.set("KEY", "parent");
      const child = await noodle.runRequest("child");
      if (child.execution.scripts.results[0].persistence[0].status !== "transient") throw Error("persisted");
      if (noodle.run.get("KEY") !== "child") throw Error("write order");
      noodle.run.set("KEY", "last", { persist: "environment" });
    `,
      },
    })
    const persisted: unknown[] = []
    const result = await executeRequestLifecycle({
      request: root,
      collection: collection([root, child]),
      runScope: scope,
      transport: { proxyPolicy: { kind: "direct", source: "cli" } },
      persistScriptChanges: async (intents) => {
        persisted.push(...intents)
        return {
          outcomes: intents.map(({ variable, target, operation }) => ({
            variable,
            target,
            operation,
            status: "saved",
          })),
          secretValues: [],
        }
      },
    })
    expect(result.status).toBe("done")
    expect(scope.get("KEY")).toBe("last")
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({ variable: "KEY", value: "last" })
    expect(
      scope.environment({ name: "test", vars: { UNSET: "baseline" } }).vars,
    ).not.toHaveProperty("UNSET")
  })

  it("rejects invalid IDs, missing requests, cycles, depth and call limits before extra HTTP", async () => {
    for (const id of [
      "../child",
      "/child",
      "child.yml",
      "a\\b",
      ".hidden",
      "a//b",
      "missing",
      "root",
    ])
      expect(
        (
          await run(
            request("root", {
              scripts: {
                pre: `await noodle.runRequest(${JSON.stringify(id)})`,
              },
            }),
          )
        ).status,
      ).toBe("error")
    expect(seen).toEqual([])
    const children = Array.from({ length: 5 }, (_, index) =>
      request(`child${index}`, {
        scripts: { pre: `await noodle.runRequest("child${index + 1}")` },
      }),
    )
    const tooDeep = await run(
      request("root", {
        scripts: { pre: 'await noodle.runRequest("child0")' },
      }),
      children,
    )
    expect(tooDeep.status).toBe("error")
    expect(JSON.stringify(tooDeep.execution)).toContain("depth limit")
    expect(seen).toEqual([])
    const repeated = await run(
      request("root", {
        scripts: {
          pre: 'for (let i = 0; i < 11; i++) await noodle.runRequest("child")',
        },
      }),
      [request("child")],
    )
    expect(repeated.status).toBe("error")
    expect(seen).toHaveLength(10)
    expect(JSON.stringify(repeated.execution)).toContain("10 calls")
    const caught = await run(
      request("root", {
        scripts: {
          pre: 'for (let i = 0; i < 20; i++) { try { await noodle.runRequest("child") } catch {} }',
        },
      }),
      [request("child")],
    )
    expect(caught.status).toBe("done")
    const calls = caught.execution.scripts?.results[0]?.requests
    expect(calls).toHaveLength(11)
    expect(calls?.[10]).toMatchObject({
      requestId: "child",
      success: false,
      failureCategories: ["configuration"],
      error: {
        message: "Script request limit is 10 calls per top-level request",
      },
    })
    const nested = await run(
      request("root", {
        scripts: { pre: 'await noodle.runRequest("nested")' },
      }),
      [
        request("child"),
        request("nested", {
          scripts: {
            pre: 'for (let i = 0; i < 20; i++) { try { await noodle.runRequest("child") } catch {} }',
          },
        }),
      ],
    )
    expect(nested.status).toBe("done")
    expect(nested.execution.scripts?.results[0]?.requests).toHaveLength(11)
  })

  it("rejects overlapping and unawaited calls, then recovers with a fresh invocation", async () => {
    for (const pre of [
      'await Promise.all([noodle.runRequest("child"), noodle.runRequest("child")])',
      'noodle.runRequest("child");',
      'const first = noodle.runRequest("child"); noodle.runRequest("child"); await first;',
    ]) {
      const result = await run(request("root", { scripts: { pre } }), [
        request("child"),
      ])
      expect(result.status).toBe("error")
      expect(result.execution.scripts?.results[0]?.success).toBe(false)
      expect(seen.some((item) => item.path === "/root")).toBe(false)
    }
    expect(
      (
        await run(
          request("root", {
            scripts: { pre: 'await noodle.runRequest("child")' },
          }),
          [request("child")],
        )
      ).status,
    ).toBe("done")
  })

  it("supports async post scripts without modifying the completed parent request", async () => {
    const scope = new RunScope()
    const result = await run(
      request("root", {
        scripts: {
          post: `
      const child = await noodle.runRequest("child");
      noodle.run.set("ID", child.json().id);
      try { noodle.request.url = "https://invalid.example"; } catch (error) { console.log(error.message); }
    `,
        },
      }),
      [request("child")],
      scope,
    )
    expect(result.status).toBe("done")
    expect(scope.get("ID")).toBe(7)
    expect(seen.map((item) => item.path)).toEqual(["/root", "/child"])
    expect(result.execution.scripts?.results[0]?.logs[0]?.message).toContain(
      "read-only",
    )
  })

  it("bounds unresolved Promises, CPU loops, and wall time and preserves source locations", async () => {
    for (const [source, name] of [
      ["await new Promise(() => {})", "ScriptPendingPromiseError"],
      ["await 1; while (true) {}", "ScriptTimeoutError"],
      ["await 1; for (;;) await Promise.resolve()", "ScriptTimeoutError"],
    ]) {
      const result = await runPreRequestScript(
        source!,
        { ...request(), headers: {} },
        undefined,
        new RunScope(),
      )
      expect(result.result.error?.name).toBe(name!)
    }
    const location = await runPreRequestScript(
      'await 1;\nthrow Error("located")',
      { ...request(), headers: {} },
      undefined,
      new RunScope(),
    )
    expect(location.result.error).toMatchObject({ message: "located", line: 2 })
    const expired = await runPreRequestScript(
      "await 1",
      { ...request(), headers: {} },
      undefined,
      new RunScope(),
      { deadline: Date.now() - 1 },
    )
    expect(expired.result.error?.name).toBe("ScriptWallTimeoutError")
    expect(SCRIPT_LIMITS.wallTimeMs).toBe(30_000)
  })
})
