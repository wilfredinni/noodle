import { afterEach, beforeEach, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionRun,
  type CollectionRunEvent,
  type CollectionRunOptions,
  type RunDetail,
} from "../../src/app/services"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import { lang } from "../../src/lang"
import type { Request, TimelineEntry } from "../../src/schema"
import {
  CollectionCookieJar,
  setCookieJarStorageForTests,
} from "../../src/cookies"
import { setSecretBackendForTests } from "../../src/secrets"
import { defaultOAuth2Auth } from "../../src/auth/defaults"
import { executor } from "../../src/requests"

let dir: string
let server: ReturnType<typeof Bun.serve>
let url: string
let entered: ReturnType<typeof Promise.withResolvers<void>>
let release: ReturnType<typeof Promise.withResolvers<void>>
let events: CollectionRunEvent[]
let hits: string[]
const originalSend = executor.send
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-cancel-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
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
  events = []
  hits = []
  entered = Promise.withResolvers<void>()
  release = Promise.withResolvers<void>()
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (req) => {
      const path = new URL(req.url).pathname
      hits.push(path)
      if (path === "/hold") {
        entered.resolve()
        await release.promise
      }
      return Response.json({ id: 7 }, { status: path === "/fail" ? 500 : 200 })
    },
  })
  url = `http://127.0.0.1:${server.port}`
})
afterEach(async () => {
  executor.send = originalSend
  release.resolve()
  server.stop(true)
  setCookieJarStorageForTests()
  setSecretBackendForTests(undefined)
  await rm(dir, { recursive: true, force: true })
})
const request = (id: string, overrides: Partial<Request> = {}): Request => ({
  id,
  name: id,
  method: "GET",
  url: `${url}/${id}`,
  timeout: 0,
  headers: {},
  params: [],
  ...overrides,
})
const save = (id: string, overrides: Partial<Request> = {}) =>
  writeFile(
    join(dir, `${id}.yml`),
    lang.serializeRequest(request(id, overrides)),
  )
const run = (
  options: CollectionRunOptions = {},
  targets: string[] = [],
  delayMs = 0,
  dataPath?: string,
  failFast = false,
  onDetail?: RunDetail,
) =>
  collectionRun(
    dir,
    undefined,
    undefined,
    true,
    undefined,
    false,
    targets,
    [],
    [],
    failFast,
    onDetail,
    delayMs,
    dataPath,
    false,
    { onEvent: (event) => events.push(event), ...options },
  )

it("cancels before execution with complete dataset identities and no preparation", async () => {
  await save("a")
  await save("b")
  await writeFile(join(dir, "settings.yml"), "environment: missing\n")
  await writeFile(join(dir, "rows.json"), "[{},{ }]")
  const controller = new AbortController()
  controller.abort("private reason")
  const result = await run(
    { signal: controller.signal },
    [],
    0,
    join(dir, "rows.json"),
  )
  expect(result).toMatchObject({
    cancelled: true,
    failed: true,
    results: [],
    iterations: 2,
    summary: {
      selected: 4,
      executed: 0,
      completed: 0,
      cancelled: 0,
      unstarted: 4,
      skipped: 4,
      requestFailures: 0,
      failureCategories: [],
    },
  })
  expect(result.skipped).toEqual([
    { id: "a", iteration: 0, reason: "cancelled" },
    { id: "b", iteration: 0, reason: "cancelled" },
    { id: "a", iteration: 1, reason: "cancelled" },
    { id: "b", iteration: 1, reason: "cancelled" },
  ])
  expect(events).toEqual(
    result.skipped.map((skip) => ({ type: "request-skip", ...skip })),
  )
  expect(hits).toEqual([])
  expect(JSON.stringify(result)).not.toContain("private reason")
})

it("preserves completed results and settles an interrupted HTTP request exactly once", async () => {
  await save("a")
  await save("b", { url: `${url}/hold` })
  await save("c")
  const controller = new AbortController()
  const running = run({ signal: controller.signal })
  await entered.promise
  controller.abort(new Error("private reason"))
  const result = await running
  expect(result.results).toMatchObject([
    { id: "a", ok: true, response: { status: 200 } },
    { id: "b", cancelled: true, ok: false, failureCategories: [] },
  ])
  expect(result.summary).toMatchObject({
    selected: 3,
    executed: 2,
    completed: 1,
    cancelled: 1,
    unstarted: 1,
    requestSuccesses: 1,
    requestFailures: 0,
  })
  expect(events.map((event) => [event.type, event.id])).toEqual([
    ["request-start", "a"],
    ["request-complete", "a"],
    ["request-start", "b"],
    ["request-complete", "b"],
    ["request-skip", "c"],
  ])
  expect(events[3]).toMatchObject({ result: result.results[1] })
  expect(hits).toEqual(["/a", "/hold"])
  expect(JSON.stringify(result)).not.toContain("private reason")
})

for (const phase of ["pre", "post"] as const) {
  it(`retains ${phase} diagnostics and cancels a saved child without late writes`, async () => {
    const root = request("root", {
      captures: { ID: { value: "body.id", enabled: true } },
      assertions: [{ expression: "status", operator: "equals", value: 200 }],
      tests: 'test("later",()=>expect(true).toBe(true))',
      scripts:
        phase === "pre"
          ? {
              pre: 'console.log("before"); noodle.run.set("LATE", true); await noodle.runRequest("child")',
            }
          : {
              post: 'console.log("before"); noodle.run.set("LATE", true); await noodle.runRequest("child")',
            },
    })
    const child = request("child", { url: `${url}/hold` })
    const scope = new RunScope()
    scope.set("EARLIER", 1)
    const controller = new AbortController()
    const running = executeRequestLifecycle({
      request: root,
      collection: {
        id: "test",
        name: "test",
        items: [root, child].map((request) => ({
          type: "request" as const,
          data: request,
        })),
      },
      requestPath: "root",
      runScope: scope,
      transport: {
        signal: controller.signal,
        proxyPolicy: { kind: "direct", source: "cli" },
      },
    })
    await entered.promise
    controller.abort(new Error("private child abort reason"))
    const result = await running
    expect(JSON.stringify(result)).not.toContain("private child abort reason")
    expect(result.status).toBe("cancelled")
    expect(scope.get("LATE")).toBeUndefined()
    expect(scope.get("EARLIER")).toBe(1)
    expect(result.execution.scripts?.results[0]).toMatchObject({
      phase,
      cancelled: true,
      logs: [{ message: "before" }],
      requests: [{ requestId: "child", cancelled: true }],
    })
    expect(result.execution.assertions?.evaluated).toBe(false)
    expect(result.execution.tests?.evaluated).toBe(false)
    if (phase === "post") {
      expect(result).toMatchObject({
        response: { status: 200 },
        execution: {
          captures: { evaluated: true, results: [{ success: true, value: 7 }] },
        },
      })
      expect(scope.get("ID")).toBe(7)
      if (result.status === "cancelled")
        expect(result.response?.bodyBytes).toEqual(
          new TextEncoder().encode('{"id":7}'),
        )
    } else expect(hits).toEqual(["/hold"])
  })
}

for (const phase of ["pre", "post"] as const) {
  it(`keeps a direct ${phase} child cancelled when it inherits a caller TimeoutError`, async () => {
    const controller = new AbortController()
    const source = `await noodle.sendRequest({url: "${url}/hold"})`
    const running = executeRequestLifecycle({
      request: request("root", {
        scripts: phase === "pre" ? { pre: source } : { post: source },
      }),
      runScope: new RunScope(),
      transport: {
        signal: controller.signal,
        proxyPolicy: { kind: "direct", source: "cli" },
      },
    })
    await entered.promise
    controller.abort(
      new DOMException("private child timeout reason", "TimeoutError"),
    )
    const result = await running
    expect(result.status).toBe("cancelled")
    expect(result.execution.scripts?.results[0]?.requests).toMatchObject([
      {
        cancelled: true,
        failureCategories: [],
        error: { name: "AbortError", message: "Request cancelled" },
      },
    ])
    expect(JSON.stringify(result)).not.toContain("private child timeout reason")
  })
}

it("cancels delay across row boundaries without admitting the next execution", async () => {
  await save("a")
  await writeFile(join(dir, "rows.json"), "[{},{}]")
  const controller = new AbortController()
  const first = Promise.withResolvers<void>()
  const running = run(
    {
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event)
        if (event.type === "request-complete") first.resolve()
      },
    },
    [],
    60_000,
    join(dir, "rows.json"),
  )
  await first.promise
  // The next turn observes the real timer wait rather than waiting an arbitrary duration.
  await new Promise<void>((resolve) => setImmediate(resolve))
  controller.abort()
  const result = await running
  expect(result.summary).toMatchObject({
    completed: 1,
    cancelled: 0,
    unstarted: 1,
  })
  expect(result.skipped).toEqual([
    { id: "a", iteration: 1, reason: "cancelled" },
  ])
  expect(events.map((event) => [event.type, event.iteration])).toEqual([
    ["request-start", 0],
    ["request-complete", 0],
    ["request-skip", 1],
  ])
  expect(hits).toEqual(["/a"])
})

it("keeps timeouts as completed transport failures and continues", async () => {
  await save("a", { url: `${url}/hold`, timeout: 5 })
  await save("b")
  const result = await run()
  expect(result.cancelled).toBeUndefined()
  expect(result.results).toMatchObject([
    { ok: false, failureCategories: ["transport"] },
    { ok: true },
  ])
  expect(result.summary).toMatchObject({
    completed: 2,
    cancelled: 0,
    unstarted: 0,
    requestFailures: 1,
  })
})

it("latches fail-fast before completion observers abort and skips later iterations", async () => {
  await save("a", { url: `${url}/fail` })
  await save("b")
  await writeFile(join(dir, "rows.json"), "[{},{}]")
  const controller = new AbortController()
  const result = await run(
    {
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event)
        if (event.type === "request-complete") controller.abort()
      },
    },
    [],
    60_000,
    join(dir, "rows.json"),
    true,
  )
  expect(result.cancelled).toBeUndefined()
  expect(result.skipped).toEqual([
    { id: "b", iteration: 0, reason: "fail-fast" },
    { id: "a", iteration: 1, reason: "fail-fast" },
    { id: "b", iteration: 1, reason: "fail-fast" },
  ])
  expect(result.summary).toMatchObject({
    completed: 1,
    cancelled: 0,
    unstarted: 3,
    requestFailures: 1,
  })
  expect(events.map((event) => event.type)).toEqual([
    "request-start",
    "request-complete",
    "request-skip",
    "request-skip",
    "request-skip",
  ])
})

it("keeps a fully completed run completed when its completion observer aborts", async () => {
  await save("a")
  const controller = new AbortController()
  const result = await run({
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === "request-complete") controller.abort()
    },
  })
  expect(result.failed).toBe(false)
  expect(result.cancelled).toBeUndefined()
})

it("cancels noninteractive OAuth acquisition before resource HTTP", async () => {
  await save("a", {
    auth: {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials",
      access_token_url: `${url}/hold`,
      client_id: "client",
      credentials_id: crypto.randomUUID(),
    },
  })
  const controller = new AbortController()
  const running = run({ signal: controller.signal })
  await entered.promise
  controller.abort()
  const result = await running
  expect(result.results[0]).toMatchObject({
    cancelled: true,
    failureCategories: [],
  })
  expect(hits).toEqual(["/hold"])
})

it("closes every opened cookie handle even when a progress observer throws", async () => {
  await save("a")
  await writeFile(
    join(dir, "settings.yml"),
    `collection_id: ${crypto.randomUUID()}\ncookies:\n  enabled: true\n`,
  )
  setCookieJarStorageForTests({ keyLockFile: join(dir, "key"), configDir: dir })
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
  const close = CollectionCookieJar.prototype.close
  let closed = 0
  CollectionCookieJar.prototype.close = async function () {
    closed++
    await close.call(this)
  }
  try {
    await expect(
      collectionRun(dir, undefined, () => {
        throw new Error("observer failed")
      }),
    ).rejects.toThrow("observer failed")
    expect(closed).toBe(1)
  } finally {
    CollectionCookieJar.prototype.close = close
  }
})

it("emits only top-level events and redacts interrupted direct-child diagnostics", async () => {
  const secret = "cancel-secret-123456"
  await save("a", {
    scripts: {
      pre: `noodle.request.auth.setBearer("${secret}"); console.log("${secret}"); await noodle.sendRequest({url: "${url}/hold"})`,
    },
  })
  await save("b")
  const controller = new AbortController()
  const running = run({ signal: controller.signal })
  await entered.promise
  controller.abort()
  const result = await running
  expect(events.map((event) => [event.type, event.id])).toEqual([
    ["request-start", "a"],
    ["request-complete", "a"],
    ["request-skip", "b"],
  ])
  expect(JSON.stringify([result, events])).not.toContain(secret)
  expect(result.results[0]?.scripts?.results[0]).toMatchObject({
    cancelled: true,
    logs: [{ message: "[REDACTED]" }],
    requests: [{ kind: "http", cancelled: true }],
  })
})

it("closes the active dataset jar and base jar on cancellation", async () => {
  await save("a", { url: `${url}/hold` })
  await writeFile(
    join(dir, "settings.yml"),
    `collection_id: ${crypto.randomUUID()}\ncookies:\n  enabled: true\n`,
  )
  await writeFile(join(dir, "rows.json"), "[{},{}]")
  setCookieJarStorageForTests({ keyLockFile: join(dir, "key"), configDir: dir })
  const close = CollectionCookieJar.prototype.close
  let closed = 0
  CollectionCookieJar.prototype.close = async function () {
    closed++
    await close.call(this)
  }
  const controller = new AbortController()
  try {
    const running = run(
      { signal: controller.signal },
      [],
      0,
      join(dir, "rows.json"),
    )
    await entered.promise
    controller.abort()
    const result = await running
    expect(closed).toBe(2)
    expect(result.summary).toMatchObject({
      completed: 0,
      cancelled: 1,
      unstarted: 1,
    })
  } finally {
    CollectionCookieJar.prototype.close = close
  }
})

it("does not turn an internal request timeout into cancellation if the caller subsequently aborts", async () => {
  await save("a")
  await save("b")
  const controller = new AbortController()
  executor.send = async () => {
    controller.abort()
    throw new DOMException("Request timed out", "TimeoutError")
  }
  const result = await run({ signal: controller.signal })
  expect(result.results[0]).toMatchObject({
    ok: false,
    failureCategories: ["transport"],
  })
  expect(result.results[0]?.cancelled).toBeUndefined()
  expect(result.summary).toMatchObject({
    completed: 1,
    cancelled: 0,
    unstarted: 1,
    requestFailures: 1,
  })
  expect(result.skipped[0]?.reason).toBe("cancelled")
})

it("treats a caller-owned TimeoutError reason as cancellation without exposing it", async () => {
  await save("a")
  await save("b")
  const controller = new AbortController()
  const result = await run({
    signal: controller.signal,
    onEvent: (event) => {
      events.push(event)
      if (event.type === "request-start")
        controller.abort(
          new DOMException("private timeout reason", "TimeoutError"),
        )
    },
  })
  expect(result.results[0]).toMatchObject({
    cancelled: true,
    failureCategories: [],
    error: "Request cancelled",
  })
  expect(result.summary).toMatchObject({
    completed: 0,
    cancelled: 1,
    unstarted: 1,
    requestFailures: 0,
  })
  expect(hits).toEqual([])
  expect(JSON.stringify([result, events])).not.toContain(
    "private timeout reason",
  )
})

it("preserves a script deadline that aborts before caller cancellation", async () => {
  const root = request("root", {
    scripts: {
      pre: 'await noodle.sendRequest({url: "http://example.invalid"})',
    },
  })
  const controller = new AbortController()
  // Warm the VM before starting the deadline under test.
  await executeRequestLifecycle({
    request: request("warm", { scripts: { pre: "1" } }),
    runScope: new RunScope(),
  })
  executor.send = async (_request, options) => {
    const signal = options!.signal!
    await new Promise<void>((_resolve, reject) => {
      const timeout = () => {
        controller.abort()
        reject(signal.reason)
      }
      if (signal.aborted) timeout()
      else signal.addEventListener("abort", timeout, { once: true })
    })
    throw new Error("unreachable")
  }
  const result = await executeRequestLifecycle({
    request: root,
    runScope: new RunScope(),
    transport: { signal: controller.signal },
    scriptContext: {
      budget: { calls: 0 },
      stack: ["root"],
      depth: 0,
      deadline: Date.now() + 30,
    },
  })
  expect(result).toMatchObject({
    status: "error",
    failureCategory: "script",
    execution: {
      scripts: {
        results: [
          {
            error: { name: "ScriptWallTimeoutError" },
            requests: [{ failureCategories: ["transport"] }],
          },
        ],
      },
    },
  })
  expect(
    result.execution.scripts?.results[0]?.requests?.[0]?.cancelled,
  ).toBeUndefined()
})

for (const phase of ["pre", "post"] as const) {
  it(`retains cancellation in runner details during ${phase}`, async () => {
    await save("root", {
      scripts:
        phase === "pre"
          ? { pre: `await noodle.sendRequest({url: "${url}/hold"})` }
          : { post: `await noodle.sendRequest({url: "${url}/hold"})` },
    })
    const controller = new AbortController()
    const details: TimelineEntry[] = []
    const running = run(
      { signal: controller.signal },
      [],
      0,
      undefined,
      false,
      (detail) => {
        details.push(detail.entry)
      },
    )
    await entered.promise
    controller.abort(new Error("private cancellation reason"))
    await running
    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject({
      cancelled: true,
      error: { message: "Request cancelled" },
    })
    expect(details[0]?.response?.status).toBe(
      phase === "post" ? 200 : undefined,
    )
    expect(JSON.stringify(details)).not.toContain("private cancellation reason")
  })
}

it("retains finished child HTTP metadata when the child's post script is cancelled", async () => {
  await save("root", { scripts: { pre: 'await noodle.runRequest("child")' } })
  await save("child", {
    scripts: { post: `await noodle.sendRequest({url: "${url}/hold"})` },
  })
  const controller = new AbortController()
  const running = run({ signal: controller.signal }, ["root"])
  await entered.promise
  controller.abort(new Error("private child post reason"))
  const result = await running
  expect(result.results[0]?.scripts?.results[0]?.requests?.[0]).toMatchObject({
    kind: "saved",
    requestId: "child",
    status: 200,
    cancelled: true,
    error: { name: "AbortError", message: "Request cancelled" },
  })
  expect(JSON.stringify([result, events])).not.toContain(
    "private child post reason",
  )
  expect(events.map((event) => event.type)).toEqual([
    "request-start",
    "request-complete",
  ])
})

it("never marks a cancelled direct child successful even if its HTTP response completed", async () => {
  await save("root", {
    scripts: { pre: `await noodle.sendRequest({url: "${url}/ok"})` },
  })
  const controller = new AbortController()
  executor.send = async () => {
    controller.abort()
    return { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 1 }
  }
  const result = await run({ signal: controller.signal })
  expect(result.results[0]?.scripts?.results[0]?.requests?.[0]).toMatchObject({
    success: false,
    cancelled: true,
    status: 200,
  })
})
