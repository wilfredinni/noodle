import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspect } from "node:util"
import { lang } from "../../src/lang"
import { filestore, loadSettings, saveSettings } from "../../src/filestore"
import { loadTimeline, saveTimelineEntry } from "../../src/filestore/timeline"
import {
  collectionAudit,
  collectionRun,
  requestRun,
} from "../../src/app/services"
import { createScriptSourceResolver } from "../../src/scriptSourceResolver"
import { requestScriptBlocks } from "../../src/scriptInheritance"
import { executeRequestLifecycle } from "../../src/requestLifecycle"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { RunScope } from "../../src/runScope"
import type { Request } from "../../src/schema"

let dir: string
let outside: string
let server: ReturnType<typeof Bun.serve>
let hits: string[]
const origin = { scope: "request" as const, scopeId: "a", path: "a.yml" }
const request = (id: string, fields: Partial<Request> = {}): Request => ({
  id,
  name: id,
  method: "GET",
  url: `http://127.0.0.1:${server.port}/`,
  timeout: 0,
  headers: {},
  params: [],
  ...fields,
})
const save = (req: Request) =>
  fs.writeFile(join(dir, `${req.id}.yml`), lang.serializeRequest(req))
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), "noodle-external-"))
  outside = await fs.mkdtemp(join(tmpdir(), "noodle-outside-"))
  await fs.mkdir(join(dir, "scripts"))
  await saveSettings(dir, { cookies: { enabled: false } })
  hits = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      hits.push(req.headers.get("x-order") ?? "")
      return Response.json({ id: "captured" })
    },
  })
})
afterEach(async () => {
  server?.stop(true)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

it("runs the shipped external examples individually and as a folder using loopback", async () => {
  server.stop(true)
  const paths: string[] = []
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      paths.push(path)
      if (path === "/users/1")
        return Response.json({ id: 1, username: "example-user" })
      expect(req.headers.get("X-Example")).toBe("external-scripts")
      expect(req.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/)
      if (path === "/posts/2")
        expect(req.headers.get("X-User-Name")).toBe("example-user")
      else expect(req.headers.has("X-User-Name")).toBe(false)
      return Response.json({ id: Number(path.split("/").at(-1)), title: path })
    },
  })
  const folder = join(dir, "external-scripts")
  await fs.cp(
    new URL("../../collections/external-scripts", import.meta.url),
    folder,
    { recursive: true },
  )
  for (const name of await fs.readdir(folder)) {
    const path = join(folder, name)
    const source = await fs.readFile(path, "utf8")
    await fs.writeFile(
      path,
      source.replaceAll(
        "https://jsonplaceholder.typicode.com",
        `http://127.0.0.1:${server.port}`,
      ),
    )
  }
  for (const id of ["get-post", "get-post-with-user"]) {
    const run = await requestRun(
      `external-scripts/${id}`,
      dir,
      undefined,
      undefined,
      true,
    )
    expect(run.failed).toBe(false)
    expect(run.result.tests?.results).toHaveLength(id === "get-post" ? 4 : 5)
    expect(
      run.result.scripts?.results.map((script) => [
        script.phase,
        script.scope,
        script.sourceKind,
      ]),
    ).toEqual([
      ["pre", "folder", "external"],
      ["pre", "request", "external"],
      ["post", "request", "external"],
      ["post", "folder", "external"],
    ])
    expect(run.result.tests?.invocations?.[1]?.source?.sourcePath).toBe(
      "./external-scripts/post-tests.js",
    )
  }
  const run = await collectionRun(
    dir,
    undefined,
    undefined,
    true,
    undefined,
    false,
    ["external-scripts/"],
  )
  expect(run.failed).toBe(false)
  expect(run.results).toHaveLength(2)
  expect(run.summary.testPasses).toBe(9)
  expect(paths.sort()).toEqual([
    "/posts/1",
    "/posts/1",
    "/posts/2",
    "/posts/2",
    "/users/1",
    "/users/1",
  ])
})

it("round-trips every scope, external tests and inline whitespace, omitting empty strings", async () => {
  const fields = {
    scripts: { pre: "./scripts/pre.js", post: "  console.log('post')\n\n" },
    tests: "./scripts/tests.js",
  }
  await saveSettings(dir, fields)
  expect(await loadSettings(dir)).toEqual(fields)
  const folder = {
    id: "users",
    path: "users",
    name: "Users",
    children: [],
    ...fields,
  }
  expect(lang.parseFolder(lang.serializeFolder(folder))).toMatchObject(fields)
  expect(
    lang.parseRequest("a", lang.serializeRequest(request("a", fields))),
  ).toMatchObject(fields)
  const empty = { scripts: { pre: "", post: "" }, tests: "" }
  expect(lang.serializeRequest(request("a", empty))).not.toContain("scripts:")
  expect(lang.serializeFolder({ ...folder, ...empty })).not.toContain("tests:")
  await saveSettings(dir, empty)
  expect(await loadSettings(dir)).toEqual({})
})

it("rejects malformed declarations without revealing absolute inputs", async () => {
  for (const source of [
    join(outside, "secret.js"),
    "../a.js",
    "./../a.js",
    "./x/../a.js",
    "./x//a.js",
    "././a.js",
    "./x\\a.js",
    "C:\\a.js",
    "./a.ts",
    "a.js",
    "./a.js\0",
  ]) {
    expect(() =>
      lang.parseRequest(
        "a",
        `name: A\nmethod: GET\nurl: http://localhost\ntests: ${JSON.stringify(source)}\n`,
      ),
    ).toThrow()
    const result = createScriptSourceResolver(dir).resolve(source, origin)
    await expect(result).rejects.toThrow()
    try {
      await result
    } catch (error) {
      expect(String(error)).not.toContain(outside)
    }
  }
})

it("confines files and rejects missing, directory, oversize and invalid UTF-8 sources", async () => {
  await fs.mkdir(join(dir, "scripts/directory.js"))
  await fs.writeFile(
    join(dir, "scripts/large.js"),
    Buffer.alloc(256 * 1024 + 1, 32),
  )
  await fs.writeFile(
    join(dir, "scripts/invalid.js"),
    new Uint8Array([0xc3, 0x28]),
  )
  await fs.writeFile(
    join(outside, "private.js"),
    'throw Error("private content")',
  )
  await fs.symlink(join(outside, "private.js"), join(dir, "scripts/escape.js"))
  await fs.symlink(outside, join(dir, "scripts/outside"))
  for (const name of [
    "missing.js",
    "directory.js",
    "large.js",
    "invalid.js",
    "escape.js",
    "outside/private.js",
  ]) {
    try {
      await createScriptSourceResolver(dir).resolve(`./scripts/${name}`, origin)
      throw Error("unexpected success")
    } catch (error) {
      expect(String(error)).toContain("ScriptSourceError")
      expect(String(error)).not.toContain(dir)
      expect(String(error)).not.toContain(outside)
      expect(String(error)).not.toContain("private content")
      // Inspection includes nested causes, unlike String(error).
      expect(inspect(error)).not.toContain(dir)
      expect(inspect(error)).not.toContain(outside)
    }
  }
  await fs.writeFile(
    join(dir, "scripts/exact.js"),
    Buffer.alloc(256 * 1024, 32),
  )
  expect(
    (
      await createScriptSourceResolver(dir).resolve(
        "./scripts/exact.js",
        origin,
      )
    ).text.length,
  ).toBe(256 * 1024)
})

it("reads canonical aliases once per run and accepts an aliased collection root", async () => {
  await fs.writeFile(join(dir, "scripts/a.js"), "// original")
  await fs.symlink(join(dir, "scripts/a.js"), join(dir, "scripts/alias.js"))
  await fs.symlink(dir, join(outside, "root"))
  const open = spyOn(fs, "open")
  try {
    const resolver = createScriptSourceResolver(join(outside, "root"))
    const sources = await Promise.all([
      resolver.resolve("./scripts/a.js", origin),
      resolver.resolve("./scripts/alias.js", origin),
      resolver.resolve("./scripts/a.js", origin),
    ])
    expect(open).toHaveBeenCalledTimes(1)
    expect(sources.map((source) => source.text)).toEqual(
      Array(3).fill("// original"),
    )
    await fs.writeFile(join(dir, "scripts/a.js"), "// changed")
    expect((await resolver.resolve("./scripts/a.js", origin)).text).toBe(
      "// original",
    )
    expect(
      (await createScriptSourceResolver(dir).resolve("./scripts/a.js", origin))
        .text,
    ).toBe("// changed")
  } finally {
    open.mockRestore()
  }
})

it("rejects a target swapped for an escaping symlink before open", async () => {
  await fs.writeFile(join(dir, "scripts/a.js"), "// safe")
  await fs.writeFile(join(outside, "private.js"), "// private")
  const actualOpen = fs.open
  const open = spyOn(fs, "open").mockImplementation(
    async (...args: Parameters<typeof fs.open>) => {
      await fs.unlink(join(dir, "scripts/a.js"))
      await fs.symlink(join(outside, "private.js"), join(dir, "scripts/a.js"))
      return actualOpen(...args)
    },
  )
  try {
    await expect(
      createScriptSourceResolver(dir).resolve("./scripts/a.js", origin),
    ).rejects.toThrow("source is invalid, missing, or unreadable")
  } finally {
    open.mockRestore()
  }
})

it("preflights every selected source before scripts or HTTP, including post and inherited tests", async () => {
  await save(
    request("a", { scripts: { pre: 'throw Error("must not execute")' } }),
  )
  await save(request("b", { scripts: { post: "./scripts/missing.js" } }))
  const run = await collectionRun(dir, undefined, undefined, true)
  expect(run.failure?.category).toBe("configuration")
  expect(run.results).toEqual([])
  expect(hits).toEqual([])
  await save(request("a"))
  expect(
    (
      await collectionRun(dir, undefined, undefined, true, undefined, false, [
        "a",
      ])
    ).failed,
  ).toBe(false)
  expect(hits).toHaveLength(1)
  await saveSettings(dir, {
    cookies: { enabled: false },
    tests: "./scripts/missing-tests.js",
  })
  await expect(requestRun("a", dir)).rejects.toThrow("missing-tests.js")
  expect(hits).toHaveLength(1)
  expect((await collectionAudit(dir, false)).valid).toBe(false)
})

it("proves exact nested order, once per request, captures, assertions and inherited tests", async () => {
  await fs.mkdir(join(dir, "outer/inner"), { recursive: true })
  const expected =
    "collection-pre,outer-pre,inner-pre,request-pre,request-post,inner-post,outer-post,collection-post,"
  const fields = (scope: string) => ({
    scripts: {
      pre: `./scripts/${scope}-pre.js`,
      post: `./scripts/${scope}-post.js`,
    },
    tests: "./scripts/shared-tests.js",
  })
  for (const scope of ["collection", "outer", "inner", "request"]) {
    for (const phase of ["pre", "post"])
      await fs.writeFile(
        join(dir, `scripts/${scope}-${phase}.js`),
        `${scope === "collection" && phase === "pre" ? 'noodle.run.set("order", "");' : ""} noodle.run.set("order", noodle.run.get("order") + "${scope}-${phase},"); ${phase === "post" ? 'if(noodle.run.get("id") !== "captured") throw Error("capture order");' : ""} ${scope === "request" && phase === "pre" ? 'noodle.request.headers.set("X-Order", noodle.run.get("order"));' : ""} console.log("${scope}-${phase}")`,
      )
  }
  await fs.writeFile(
    join(dir, "scripts/shared-tests.js"),
    `test("order", () => expect(noodle.run.get("order")).toBe(${JSON.stringify(expected)}))`,
  )
  await saveSettings(dir, {
    cookies: { enabled: false },
    ...fields("collection"),
  })
  for (const path of ["outer", "outer/inner"])
    await fs.writeFile(
      join(dir, path, "folder.yml"),
      lang.serializeFolder({
        id: path,
        path,
        name: "same display name",
        children: [],
        ...fields(path.split("/").at(-1)!),
      }),
    )
  await fs.writeFile(
    join(dir, "folder.yml"),
    "scripts:\n  pre: ./scripts/missing-root.js\n",
  )
  for (const id of ["outer/inner/a", "outer/inner/b"])
    await save(
      request(id, {
        ...fields("request"),
        captures: { id: { value: "body.id", enabled: true } },
        assertions: [{ expression: "status", operator: "equals", value: 201 }],
      }),
    )
  const details: unknown[] = []
  const open = spyOn(fs, "open")
  const run = await collectionRun(
    dir,
    undefined,
    undefined,
    true,
    undefined,
    false,
    [],
    [],
    [],
    false,
    (detail) => details.push(detail),
  )
    .then((result) => {
      expect(
        open.mock.calls.filter(([path]) => String(path).includes("/scripts/")),
      ).toHaveLength(9)
      return result
    })
    .finally(() => open.mockRestore())
  expect(hits).toEqual(
    Array(2).fill("collection-pre,outer-pre,inner-pre,request-pre,"),
  )
  for (const result of run.results) {
    expect(result.failureCategories).toEqual(["assertion"])
    expect(
      result.scripts?.results.map(
        (script) => `${script.source?.scopeId}:${script.phase}`,
      ),
    ).toEqual([
      `${dir.split("/").at(-1)}:pre`,
      "outer:pre",
      "outer/inner:pre",
      `${result.id}:pre`,
      `${result.id}:post`,
      "outer/inner:post",
      "outer:post",
      `${dir.split("/").at(-1)}:post`,
    ])
    expect(result.tests?.results).toHaveLength(4)
    expect(result.tests?.results.every((test) => test.passed)).toBe(true)
    expect(
      result.tests?.invocations?.map((test) => test.source?.scope),
    ).toEqual(["collection", "folder", "folder", "request"])
    expect(
      result.scripts?.results.every(
        (script) => script.sourceKind === "external" && script.durationMs >= 0,
      ),
    ).toBe(true)
    expect(JSON.stringify(result)).not.toContain(dir)
  }
  expect(JSON.stringify(details)).toContain("collection-post")
})

it("reloads manual sources, keeps dynamic children on the same cache and retains history logs without source code", async () => {
  const path = join(dir, "scripts/a.js")
  await fs.writeFile(
    path,
    'noodle.request.headers.set("X-Order", "first"); console.log("live-marker")',
  )
  const req = request("a", {
    scripts: { pre: "./scripts/a.js" },
    tests: "./scripts/tests.js",
  })
  await fs.writeFile(
    join(dir, "scripts/tests.js"),
    'console.log("test-marker")',
  )
  await save(req)
  const collection = await filestore.loadCollection(dir)
  const execute = () =>
    executeRequestLifecycle({
      request: req,
      collection,
      requestPath: req.id,
      runScope: new RunScope(),
      transport: { collectionDir: dir },
    })
  const first = await execute()
  expect(first.status).toBe("done")
  expect(first.execution.tests?.invocations?.[0]?.source?.sourcePath).toBe(
    "./scripts/tests.js",
  )
  if (first.status !== "done") throw Error("expected response")
  const history = buildTimelineEntry(req, first)
  expect(history.scripts?.results[0]?.logs[0]?.message).toBe("live-marker")
  expect(history.tests?.logs[0]?.message).toBe("test-marker")
  expect(history.tests?.invocations?.[0]?.logs[0]?.message).toBe("test-marker")
  expect(JSON.stringify(history)).not.toContain("noodle.request.headers.set")
  expect(history.request).not.toHaveProperty("scripts")
  expect(history.request).not.toHaveProperty("tests")
  await saveTimelineEntry(dir, req.id, history)
  const [stored] = await loadTimeline(dir, req.id)
  expect(stored?.scripts).toEqual(history.scripts)
  expect(stored?.tests).toEqual(history.tests)
  await fs.writeFile(path, 'noodle.request.headers.set("X-Order", "second")')
  await execute()
  expect(hits).toEqual(["first", "second"])
  await save(
    request("parent", { scripts: { pre: 'await noodle.runRequest("a")' } }),
  )
  await save(request("unused", { scripts: { pre: "./scripts/unused.js" } }))
  expect(
    (await requestRun("parent", dir, undefined, undefined, true)).failed,
  ).toBe(false)
  await fs.unlink(path)
  const failed = (await requestRun("parent", dir, undefined, undefined, true))
    .result
  expect(failed.failureCategories).toEqual(["script"])
  expect(failed.scripts?.results[0]?.requests?.[0]?.failureCategories).toEqual([
    "configuration",
  ])
})

it("passes only source text to the sandbox and redacts source metadata and errors", async () => {
  const secret = "private-token"
  for (const text of [
    'require("node:fs")',
    'import x from "node:fs"',
    'Bun.file("/tmp/private")',
  ]) {
    await fs.writeFile(join(dir, "scripts/a.js"), text)
    await save(request("a", { scripts: { pre: "./scripts/a.js" } }))
    const result = await requestRun("a", dir, undefined, undefined, true)
    expect(result.result.failureCategories).toEqual(["script"])
    expect(hits).toEqual([])
    expect(JSON.stringify(result)).not.toContain(dir)
  }
  await fs.writeFile(
    join(dir, `scripts/${secret}.js`),
    `console.log("${secret}"); throw Error("${secret}")`,
  )
  const req = request("a", { scripts: { pre: `./scripts/${secret}.js` } })
  const scope = new RunScope()
  scope.rememberSecrets([secret])
  const result = await executeRequestLifecycle({
    request: req,
    runScope: scope,
    transport: { collectionDir: dir },
  })
  expect(JSON.stringify(result.execution)).not.toContain(secret)
  expect(JSON.stringify(result.execution)).toContain("[REDACTED]")
  expect(requestScriptBlocks(req)).toHaveLength(1)
})

it.skipIf(process.platform === "win32")(
  "rejects FIFOs and unreadable sources without hanging",
  async () => {
    const fifo = join(dir, "scripts/pipe.js")
    expect(await Bun.spawn(["mkfifo", fifo]).exited).toBe(0)
    await expect(
      createScriptSourceResolver(dir).resolve("./scripts/pipe.js", origin),
    ).rejects.toThrow("regular file")
    const file = join(dir, "scripts/unreadable.js")
    await fs.writeFile(file, "// private")
    await fs.chmod(file, 0)
    try {
      await expect(
        createScriptSourceResolver(dir).resolve(
          "./scripts/unreadable.js",
          origin,
        ),
      ).rejects.toThrow("unreadable")
    } finally {
      await fs.chmod(file, 0o600)
    }
  },
)

it("executes collection-relative files through source and standalone CLI from another directory", async () => {
  const command = process.env.NOODLE_TEST_BINARY
    ? [process.env.NOODLE_TEST_BINARY]
    : [process.execPath, join(import.meta.dir, "../../src/app/cli.ts")]
  await fs.writeFile(
    join(dir, "scripts/a.js"),
    'noodle.request.headers.set("X-Order", "external-cli")',
  )
  await fs.writeFile(
    join(dir, "scripts/test.js"),
    'test("status",()=>expect(noodle.response.status).toBe(200))',
  )
  await save(
    request("a", {
      scripts: { pre: "./scripts/a.js" },
      tests: "./scripts/test.js",
    }),
  )
  const cli = async (args: string[]) => {
    const child = Bun.spawn([...command, ...args, "--noproxy", "--json"], {
      cwd: outside,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(stderr).toBe("")
    expect(stdout).not.toContain(dir)
    return { result: JSON.parse(stdout), code }
  }
  expect((await cli(["request", "run", "a", "--collection", dir])).code).toBe(0)
  expect((await cli(["collection", "run", dir])).code).toBe(0)
  expect(hits).toEqual(["external-cli", "external-cli"])
  await fs.unlink(join(dir, "scripts/test.js"))
  const invalid = await cli(["request", "run", "a", "--collection", dir])
  expect(invalid.code).toBe(2)
  expect(invalid.result.errors[0]).toContain("./scripts/test.js")
  expect(hits).toHaveLength(2)
})
