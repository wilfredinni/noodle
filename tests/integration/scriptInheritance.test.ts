import { afterEach, beforeEach, expect, it } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { filestore, saveSettings, loadSettings } from "../../src/filestore"
import { lang } from "../../src/lang"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { RunScope } from "../../src/runScope"
import {
  collectionAudit,
  collectionRun,
  requestRun,
} from "../../src/app/services"
import type { Request, ScriptFields } from "../../src/schema"

let dir: string
let server: ReturnType<typeof Bun.serve>
let hits: number
const request = (id: string, fields: ScriptFields = {}): Request => ({
  id,
  name: id,
  method: "GET",
  url: `http://127.0.0.1:${server.port}/`,
  headers: {},
  params: [],
  timeout: 0,
  ...fields,
})
const block = (name: string): ScriptFields => ({
  scripts: {
    pre: `const local = "${name}"; noodle.run.set("order", (noodle.run.get("order") || "") + local + "-pre,");`,
    post: `const local = "${name}"; noodle.run.set("order", noodle.run.get("order") + local + "-post,"); console.log(local);`,
  },
  tests: `const local = "${name}"; test(local, () => expect(noodle.run.get("order")).toBe("root-pre,outer-pre,inner-pre,request-pre,root-post,outer-post,inner-post,request-post,"))`,
})
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-inheritance-"))
  hits = 0
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      hits++
      return Response.json({ id: 1 })
    },
  })
  await mkdir(join(dir, "outer/inner"), { recursive: true })
})
afterEach(async () => {
  server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

it("preserves the test result byte limit when there are no inherited blocks", async () => {
  await saveSettings(dir, { cookies: { enabled: false } })
  const req = request("outer/request", {
    tests: 'for(let i=0;i<4;i++) test("x".repeat(65400),()=>{})',
  })
  await writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
  const result = await requestRun(req.id, dir, undefined, undefined, true)
  expect(result.failed).toBe(false)
  expect(result.result.tests?.results).toHaveLength(4)
  expect(result.result.tests?.error).toBeUndefined()
})

it("bounds diagnostics across inherited blocks without hiding failed tests or leaking partial logs", async () => {
  await saveSettings(dir, {
    cookies: { enabled: false },
    scripts: { post: 'console.log("x".repeat(65000))' },
    tests: 'for(let i=0;i<4;i++) test("x".repeat(60000),()=>{})',
  })
  await writeFile(
    join(dir, "outer/folder.yml"),
    lang.serializeFolder({
      id: "outer",
      name: "outer",
      path: "outer",
      children: [],
      scripts: { post: 'console.log("private-log".repeat(1000))' },
      tests: 'test("limit",()=>expect(1).toBe(2))',
    }),
  )
  const req = request("outer/request", {
    tests: 'for(let i=0;i<10;i++) test("y".repeat(60000),()=>{})',
  })
  await writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
  const result = await requestRun(req.id, dir, undefined, undefined, true)
  expect(result.failed).toBe(true)
  expect(result.result.failureCategories).toContain("test")
  expect(result.result.tests?.error?.message).toContain("limit")
  expect(Buffer.byteLength(JSON.stringify(result.result))).toBeLessThan(350000)
  expect(result.result.scripts?.results[1]?.logs).toEqual([
    {
      level: "log",
      message: "[TRUNCATED]",
      source: { scope: "folder", path: "outer/folder.yml" },
    },
  ])
})

it("round-trips inherited literal blocks and runs collection, outer, inner and request in every phase", async () => {
  const root = block("root")
  await saveSettings(dir, { cookies: { enabled: false }, ...root })
  expect((await loadSettings(dir)).scripts).toEqual(root.scripts)
  for (const [path, name] of [
    ["outer", "outer"],
    ["outer/inner", "inner"],
  ]) {
    await writeFile(
      join(dir, path!, "folder.yml"),
      lang.serializeFolder({
        id: "folder",
        path: "outer",
        children: [],
        name: name!,
        ...block(name!),
      }),
    )
  }
  const req = request("outer/inner/request", block("request"))
  await writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
  const result = await requestRun(req.id, dir, undefined, undefined, true)
  expect(result.failed).toBe(false)
  expect(
    result.result.scripts?.results.map((result) => result.source?.path),
  ).toEqual([
    "settings.yml",
    "outer/folder.yml",
    "outer/inner/folder.yml",
    "outer/inner/request.yml",
    "settings.yml",
    "outer/folder.yml",
    "outer/inner/folder.yml",
    "outer/inner/request.yml",
  ])
  expect(result.result.tests?.results.map((test) => test.name)).toEqual([
    "root",
    "outer",
    "inner",
    "request",
  ])
  const audit = await collectionAudit(dir, true)
  expect(JSON.stringify(audit)).not.toContain("unknown field")
  expect((await filestore.loadCollection(dir)).scripts).toEqual(root.scripts)
})

it("stops pre on failure, discards only that block, and preserves ordered persistence", async () => {
  await saveSettings(dir, {
    scripts: {
      pre: 'noodle.run.set("value", "root", {persist:"environment"})',
    },
  })
  await writeFile(
    join(dir, "outer/folder.yml"),
    lang.serializeFolder({
      id: "folder",
      name: "folder",
      path: "outer",
      children: [],
      scripts: {
        pre: 'noodle.run.set("value", "discard"); throw Error("stop")',
      },
    }),
  )
  const req = request("outer/request", {
    scripts: { pre: 'throw Error("never")' },
    tests: 'test("never",()=>{})',
  })
  const scope = new RunScope()
  const saved: unknown[] = []
  const result = await executeRequestLifecycle({
    request: req,
    requestPath: req.id,
    collection: await filestore.loadCollection(dir),
    runScope: scope,
    persistScriptChanges: async (intents) => {
      saved.push(intents)
      return {
        outcomes: intents.map(({ variable, target, operation }) => ({
          variable,
          target,
          operation,
          status: "saved" as const,
        })),
        secretValues: [],
      }
    },
  })
  expect(result.status).toBe("error")
  expect(scope.get("value")).toBe("root")
  expect(saved).toHaveLength(1)
  expect(result.execution.scripts?.results).toHaveLength(2)
  expect(result.execution.tests?.evaluated).toBe(false)
  expect(hits).toBe(0)
})

it("continues posts and test blocks after errors, preserving rollback and every error origin", async () => {
  await saveSettings(dir, {
    cookies: { enabled: false },
    scripts: {
      post: 'noodle.run.set("value", "discard"); throw Error("root-post")',
    },
    tests: 'test("first",()=>{}); throw Error("root-tests")',
  })
  await writeFile(
    join(dir, "outer/folder.yml"),
    lang.serializeFolder({
      id: "folder",
      name: "folder",
      path: "outer",
      children: [],
      scripts: {
        post: 'if(noodle.run.get("value") !== undefined) throw Error("rollback"); noodle.run.set("value", "folder")',
      },
      tests: 'throw Error("folder-tests")',
    }),
  )
  const req = request("outer/request", {
    tests: 'test("last",()=>expect(noodle.run.get("value")).toBe("folder"))',
  })
  await writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
  const result = await collectionRun(dir, undefined, undefined, true)
  expect(hits).toBe(1)
  const execution = result.results[0]!
  expect(execution.scripts?.results.map((script) => script.success)).toEqual([
    false,
    true,
  ])
  expect(execution.tests?.results.map((test) => test.passed)).toEqual([
    true,
    true,
  ])
  expect(execution.tests?.errors?.map((error) => error.source?.path)).toEqual([
    "settings.yml",
    "outer/folder.yml",
  ])
  expect(execution.tests?.error).toEqual(execution.tests?.errors?.[0])
  expect(result.summary.testScriptErrors).toBe(2)
})

it("runs saved children with inherited blocks and keeps cycle protection", async () => {
  await saveSettings(dir, {
    cookies: { enabled: false },
    scripts: {
      pre: 'noodle.run.set("visits", (noodle.run.get("visits") || 0) + 1)',
    },
  })
  for (const req of [
    request("parent", {
      scripts: {
        pre: 'await noodle.runRequest("child"); if(noodle.run.get("visits") !== 2) throw Error("child inheritance")',
      },
    }),
    request("child"),
  ])
    await writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
  expect(
    (await requestRun("parent", dir, undefined, undefined, true)).failed,
  ).toBe(false)
  await saveSettings(dir, {
    cookies: { enabled: false },
    scripts: { pre: 'await noodle.runRequest("parent")' },
  })
  const failed = await requestRun("parent", dir, undefined, undefined, true)
  expect(failed.failed).toBe(true)
  expect(JSON.stringify(failed)).toContain("Recursive request call")
})
