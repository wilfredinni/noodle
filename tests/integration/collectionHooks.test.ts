import { afterEach, beforeEach, expect, it } from "bun:test"
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  collectionRun,
  collectionAudit,
  type CollectionRunEvent,
  type RequestRunDetail,
} from "../../src/app/services"
import {
  parseCollectionSettings,
  loadSettings,
  saveSettings,
} from "../../src/filestore"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"
import { setCookieJarStorageForTests } from "../../src/cookies"

let dir: string
let server: ReturnType<typeof Bun.serve>
let hits: string[]
let cookies: (string | null)[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-hooks-"))
  setCookieJarStorageForTests({ keyLockFile: join(dir, "cookie-key") })
  await copyFile(
    join(import.meta.dir, "../fixtures/collection-hooks/settings.yml"),
    join(dir, "settings.yml"),
  )
  hits = []
  cookies = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      hits.push(path)
      cookies.push(request.headers.get("cookie"))
      return Response.json(
        { path },
        {
          status: path.includes("fail") ? 500 : 200,
          headers: path.startsWith("/setup")
            ? { "set-cookie": "session=hook-cookie-secret; Path=/" }
            : {},
        },
      )
    },
  })
  await save("setup", {
    scripts: { post: 'noodle.run.set("shared", "ready")' },
  })
  await save("main", {
    tags: ["smoke"],
    tests:
      'test("setup shared", () => expect(noodle.run.get("shared")).toBe("ready"))',
  })
  await save("teardown", {
    tests:
      'test("inherited", () => expect(noodle.run.get("inherited")).toBe(3))',
  })
})
afterEach(async () => {
  server?.stop(true)
  setCookieJarStorageForTests()
  await rm(dir, { recursive: true, force: true })
})
const save = (id: string, fields: Partial<Request> = {}) =>
  writeFile(
    join(dir, `${id}.yml`),
    lang.serializeRequest({
      id,
      name: id,
      method: "GET",
      url: `http://127.0.0.1:${server.port}/${id}`,
      headers: {},
      params: [],
      timeout: 1000,
      ...fields,
    }),
  )
const run = (
  options: {
    targets?: string[]
    tags?: string[]
    exclude?: string[]
    failFast?: boolean
    data?: string
    signal?: AbortSignal
    event?: (event: CollectionRunEvent) => void
    details?: RequestRunDetail[]
  } = {},
) =>
  collectionRun(
    dir,
    undefined,
    undefined,
    true,
    undefined,
    false,
    options.targets ?? [],
    options.tags ?? [],
    options.exclude ?? [],
    options.failFast ?? false,
    (detail) => options.details?.push(detail),
    0,
    options.data,
    false,
    { signal: options.signal, onEvent: options.event },
  )

it("runs saved hooks once around filtered main requests with inherited scripts and shared scope", async () => {
  const details: RequestRunDetail[] = []
  const events: CollectionRunEvent[] = []
  const result = await run({
    tags: ["smoke"],
    details,
    event: (event) => events.push(event),
  })
  expect(hits).toEqual(["/setup", "/main", "/teardown"])
  expect(result.failed).toBe(false)
  expect(result.results.map((row) => row.stage)).toEqual([
    "setup",
    "main",
    "teardown",
  ])
  expect(details.map((row) => row.stage)).toEqual(["setup", "main", "teardown"])
  expect(events[0]).toMatchObject({
    requestIds: ["setup", "main", "teardown"],
    stages: ["setup", "main", "teardown"],
  })
  expect(result.summary.stages?.teardown).toMatchObject({
    executed: 1,
    passed: 1,
  })
  expect(
    (await run({ targets: ["setup", "main", "teardown"] })).results,
  ).toHaveLength(3)
})
it("does no HTTP for unmatched tags, excluded mains, or hook-only targets", async () => {
  for (const options of [
    { tags: ["absent"] },
    { exclude: ["smoke"] },
    { targets: ["setup", "teardown"] },
  ]) {
    expect((await run(options)).summary.selected).toBe(0)
    expect(hits).toEqual([])
  }
})
it("validates references and all sources before setup HTTP", async () => {
  await save("teardown", { scripts: { post: "./missing.js" } })
  expect((await run()).failure?.category).toBe("configuration")
  expect(hits).toEqual([])
  await saveSettings(dir, { hooks: { setup: "missing" } })
  expect((await run()).failure?.message).toContain("missing request")
  expect(hits).toEqual([])
  expect((await collectionAudit(dir, false)).valid).toBe(false)
})
it("skips main after setup failure but attempts teardown", async () => {
  await save("setup", { scripts: { pre: 'throw Error("setup failed")' } })
  await save("teardown")
  const result = await run()
  expect(hits).toEqual(["/teardown"])
  expect(result.skipped).toEqual([
    { id: "main", stage: "main", reason: "setup-failed" },
  ])
  expect(result.results.map((row) => row.ok)).toEqual([false, true])
  expect(result.failed).toBe(true)
})
it("attempts teardown after ordinary and fail-fast failures, retaining both failures", async () => {
  await save("main", { url: `http://127.0.0.1:${server.port}/fail-main` })
  await save("other")
  await save("teardown", {
    url: `http://127.0.0.1:${server.port}/fail-cleanup`,
  })
  const result = await run({ failFast: true })
  expect(hits).toEqual(["/setup", "/fail-main", "/fail-cleanup"])
  expect(result.summary.requestFailures).toBe(2)
  expect(result.skipped).toEqual([
    { id: "other", stage: "main", reason: "fail-fast" },
  ])
  hits = []
  await run()
  expect(hits).toEqual(["/setup", "/fail-main", "/other", "/fail-cleanup"])
})
it("cancellation after a failure supersedes fail-fast and does not start teardown", async () => {
  await save("main", { scripts: { pre: 'throw Error("fail")' } })
  const controller = new AbortController()
  const result = await run({
    failFast: true,
    signal: controller.signal,
    event: (event) => {
      if (event.type === "request-complete" && event.stage === "main")
        controller.abort()
    },
  })
  expect(hits).toEqual(["/setup"])
  expect(result.cancelled).toBe(true)
  expect(result.skipped).toContainEqual({
    id: "teardown",
    stage: "teardown",
    reason: "cancelled",
  })
})
it("pre-cancellation sends nothing", async () => {
  const result = await run({ signal: AbortSignal.abort() })
  expect(hits).toEqual([])
  expect(result.summary.executed).toBe(0)
  expect(result.cancelled).toBe(true)
})
it("isolates dataset scopes and cookies while sharing them across each row's stages", async () => {
  const settings = await loadSettings(dir)
  await saveSettings(dir, { ...settings, cookies: { enabled: true } })
  await writeFile(
    join(dir, "rows.json"),
    JSON.stringify([{ row: "one" }, { row: "two" }]),
  )
  await save("setup", {
    url: `http://127.0.0.1:${server.port}/setup-$row`,
    scripts: {
      pre: 'if (noodle.run.get("shared") !== undefined) throw Error("scope leak")',
      post: 'noodle.run.set("shared", "ready"); console.log(noodle.cookies.get("session"))',
    },
  })
  const details: RequestRunDetail[] = []
  const result = await run({ data: join(dir, "rows.json"), details })
  expect(result.failed).toBe(false)
  expect(hits).toEqual([
    "/setup-one",
    "/main",
    "/teardown",
    "/setup-two",
    "/main",
    "/teardown",
  ])
  expect(cookies).toEqual([
    null,
    "session=hook-cookie-secret",
    "session=hook-cookie-secret",
    null,
    "session=hook-cookie-secret",
    "session=hook-cookie-secret",
  ])
  expect(result.results.map((row) => row.iteration)).toEqual([0, 0, 0, 1, 1, 1])
  expect(JSON.stringify({ result, details })).not.toContain(
    "hook-cookie-secret",
  )
})
it("fail-fast cleans up only the started row", async () => {
  await writeFile(join(dir, "rows.json"), "[{},{}]")
  await save("main", { scripts: { pre: 'throw Error("fail")' } })
  await save("teardown")
  const result = await run({ failFast: true, data: join(dir, "rows.json") })
  expect(hits).toEqual(["/setup", "/teardown"])
  expect(result.skipped.filter((row) => row.iteration === 1)).toHaveLength(3)
  expect(result.summary.selected).toBe(
    result.summary.completed +
      result.summary.cancelled +
      result.summary.unstarted,
  )
})
it("strictly parses and canonically round-trips optional hooks", async () => {
  for (const hooks of [
    null,
    [],
    "setup",
    { other: "main" },
    { setup: 1 },
    { setup: "../bad" },
    { setup: "same", teardown: "same" },
  ])
    expect(() => parseCollectionSettings({ hooks })).toThrow()
  await saveSettings(dir, { hooks: { setup: "setup", teardown: "teardown" } })
  expect((await loadSettings(dir)).hooks).toEqual({
    setup: "setup",
    teardown: "teardown",
  })
  await saveSettings(dir, { hooks: {} })
  expect((await loadSettings(dir)).hooks).toBeUndefined()
})
it("cancels active setup, main, or teardown without starting another stage", async () => {
  for (const stage of ["setup", "main", "teardown"] as const) {
    const controller = new AbortController()
    server.reload({
      fetch(request) {
        const path = new URL(request.url).pathname
        hits.push(path)
        if (path === `/${stage}`) controller.abort()
        return Response.json({})
      },
    })
    hits = []
    const result = await run({ signal: controller.signal })
    expect(result.cancelled).toBe(true)
    expect(result.results.at(-1)?.stage).toBe(stage)
    expect(result.results.at(-1)?.cancelled).toBe(true)
    expect(hits).toEqual(
      ["/setup", "/main", "/teardown"].slice(
        0,
        ["setup", "main", "teardown"].indexOf(stage) + 1,
      ),
    )
  }
})
it("continues with fresh rows after setup failure without fail-fast", async () => {
  await writeFile(join(dir, "rows.json"), '[{"bad":true},{"bad":false}]')
  await save("setup", {
    scripts: {
      pre: 'if (noodle.iteration.data.bad) throw Error("bad row")',
      post: 'noodle.run.set("shared", "ready")',
    },
  })
  await save("teardown")
  const result = await run({ data: join(dir, "rows.json") })
  expect(hits).toEqual(["/teardown", "/setup", "/main", "/teardown"])
  expect(result.summary.requestFailures).toBe(1)
})
