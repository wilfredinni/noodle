import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadIterationData,
  validateExecutionCount,
} from "../../src/iterationData"
import { collectionRun, type RequestRunDetail } from "../../src/app/services"
import { CollectionCookieJar } from "../../src/cookies"
import { setSecretBackendForTests } from "../../src/secrets"
import { lang } from "../../src/lang"
import type { Request } from "../../src/schema"

let dir: string
let server: ReturnType<typeof Bun.serve>
let hits: { path: string; cookie: string | null; time: number }[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-data-"))
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  hits = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname
      hits.push({
        path,
        cookie: request.headers.get("cookie"),
        time: performance.now(),
      })
      return Response.json(
        { id: path, cookie: request.headers.get("cookie") },
        { headers: { "set-cookie": "row=changed; Path=/" } },
      )
    },
  })
})
afterEach(async () => {
  server.stop(true)
  setSecretBackendForTests(undefined)
  await rm(dir, { recursive: true, force: true })
})
const save = (id: string, fields: Partial<Request> = {}) =>
  writeFile(
    join(dir, `${id}.yml`),
    lang.serializeRequest({
      id,
      name: id,
      method: "GET",
      url: `http://127.0.0.1:${server.port}/$name`,
      headers: {},
      params: [],
      timeout: 0,
      ...fields,
    }),
  )
const run = (
  data: string,
  failFast = false,
  details?: RequestRunDetail[],
  delay = 0,
  targets: string[] = [],
) =>
  collectionRun(
    dir,
    "dev",
    undefined,
    true,
    undefined,
    false,
    targets,
    [],
    [],
    failFast,
    (detail) => details?.push(detail),
    delay,
    join(dir, data),
  )
const environment = async () => {
  await mkdir(join(dir, ".environments"))
  await writeFile(join(dir, ".environments/dev.env"), "name=environment\n")
}

it("parses BOM, quoted separators and multiline CSV, and preserves typed JSON", async () => {
  await writeFile(
    join(dir, "rows.csv"),
    '\ufeffname,note\r\nfirst,"one,two"\r\nsecond,"line1\nline2"\r\n',
  )
  expect(await loadIterationData("rows.csv", dir)).toEqual([
    { name: "first", note: "one,two" },
    { name: "second", note: "line1\nline2" },
  ])
  await writeFile(
    join(dir, "rows.json"),
    '[{"name":"first","id":3,"ok":true,"nil":null,"items":[1]}]',
  )
  expect(await loadIterationData("rows.json", dir)).toEqual([
    { name: "first", id: 3, ok: true, nil: null, items: [1] },
  ])
})

it("rejects invalid datasets and limits before any HTTP", async () => {
  await save("a")
  const invalid = [
    ["csv", ""],
    ["csv", "name\n"],
    ["csv", "a,a\n1,2"],
    ["csv", "a,b\n1"],
    ["csv", "bad-key\n1"],
    ["json", "{}"],
    ["json", "[]"],
    ["json", "[null]"],
    ["json", '[ {"constructor":"x"} ]'],
    ["json", '[ {"data":{"__proto__":{}}} ]'],
    ["json", JSON.stringify(Array.from({ length: 1001 }, () => ({ a: 1 })))],
    ["json", JSON.stringify([{ a: "x".repeat(262144) }])],
    ["json", " ".repeat(5 * 1024 * 1024 + 1)],
  ]
  for (const [extension, source] of invalid) {
    await writeFile(join(dir, `invalid.${extension}`), source!)
    const result = await run(`invalid.${extension}`)
    expect(result.failure?.category).toBe("configuration")
    expect(result.results).toHaveLength(0)
  }
  expect(() => validateExecutionCount(11, 1000)).toThrow("10,000")
  expect(hits).toHaveLength(0)
})

it("runs rows in order with fresh scopes, original immutable iteration data, children and distinct details", async () => {
  await environment()
  await writeFile(
    join(dir, "rows.json"),
    '[{"name":"first","id":1},{"name":"second","id":2}]',
  )
  await save("a", {
    scripts: {
      pre: 'if(noodle.run.get("previous") !== undefined) throw Error("scope leak"); if(noodle.env.get("name") !== "environment") throw Error("env"); await noodle.runRequest("child"); noodle.run.set("name", "overwritten"); noodle.run.set("previous", true)',
    },
    tests:
      'test("original",()=>{expect(noodle.iteration.data.name).not.toBe("overwritten");expect(noodle.iteration.index).toBe(noodle.iteration.data.id-1);expect(noodle.iteration.count).toBe(2);expect(Object.isFrozen(noodle.iteration.data)).toBe(true)})',
  })
  await save("b", {
    tests: 'test("shared",()=>expect(noodle.run.get("previous")).toBe(true))',
  })
  await save("child", {
    tests:
      'test("child iteration",()=>expect(noodle.iteration.data.id).toBe(noodle.iteration.index+1))',
  })
  const details: RequestRunDetail[] = []
  const result = await run("rows.json", false, details, 0, ["a", "b"])
  expect(result.failed).toBe(false)
  expect(hits.map((hit) => hit.path)).toEqual([
    "/first",
    "/first",
    "/overwritten",
    "/second",
    "/second",
    "/overwritten",
  ])
  expect(result.results.map((result) => [result.iteration, result.id])).toEqual(
    [
      [0, "a"],
      [0, "b"],
      [1, "a"],
      [1, "b"],
    ],
  )
  expect(details.map((detail) => [detail.iteration, detail.requestId])).toEqual(
    [
      [0, "a"],
      [0, "b"],
      [1, "a"],
      [1, "b"],
    ],
  )
  expect(result.summary).toMatchObject({
    selected: 4,
    executed: 4,
    requestSuccesses: 4,
  })
})

it("stops all remaining rows on fail-fast and applies delay across row boundaries", async () => {
  await environment()
  await writeFile(join(dir, "rows.csv"), "name\nfirst\nsecond\nthird\n")
  await save("a", {
    tests:
      'test("second fails",()=>expect(noodle.iteration.index).not.toBe(1))',
  })
  const result = await run("rows.csv", true, undefined, 30)
  expect(result.results).toHaveLength(2)
  expect(result.skipped).toEqual([
    { id: "a", iteration: 2, reason: "fail-fast" },
  ])
  expect(hits[1]!.time - hits[0]!.time).toBeGreaterThanOrEqual(29)
})

it("clones the same initial cookie snapshot per row and never persists iteration mutations", async () => {
  await environment()
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: true\n")
  await writeFile(
    join(dir, "rows.json"),
    '[{"name":"first"},{"name":"second"}]',
  )
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
  const original = CollectionCookieJar.open.bind(CollectionCookieJar)
  const open = spyOn(CollectionCookieJar, "open").mockImplementation(
    (_config, id) => original(join(dir, "config"), id),
  )
  try {
    await save("a", {
      tests:
        'test("isolated",()=>expect(noodle.response.json().cookie).toBeNull())',
    })
    await save("b", {
      tests:
        'test("within row",()=>expect(noodle.response.json().cookie).toContain("row=changed"))',
    })
    const result = await run("rows.json")
    expect(result.failed).toBe(false)
    expect(hits.map((hit) => hit.cookie)).toEqual([
      null,
      "row=changed",
      null,
      "row=changed",
    ])
    const settings = await import("../../src/filestore").then(
      ({ loadSettings }) => loadSettings(dir),
    )
    const jar = await original(join(dir, "config"), settings.collectionId!)
    expect(jar.cookieHeaderFor(`http://127.0.0.1:${server.port}/`)).toBe("")
    await jar.close()
  } finally {
    open.mockRestore()
  }
})
