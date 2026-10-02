import { afterEach, beforeEach, expect, it } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { postmanImporter } from "../../src/converters/postman"
import { insomniaImporter } from "../../src/converters/insomnia"
import { runImport } from "../../src/app/import"
import { formatImport } from "../../src/app/humanOutput"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-import-scripts-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})
const event = (listen: string) => ({
  listen,
  script: {
    type: "text/javascript",
    exec: ['pm.environment.set("secret", "foreign-secret")'],
  },
})
const postman = () => ({
  info: {
    name: "Foreign",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  event: [event("prerequest")],
  item: [
    {
      name: "Folder",
      event: [event("test")],
      item: [
        {
          name: "Request",
          event: [
            event("prerequest"),
            { listen: "test", script: { src: "./foreign.js" } },
          ],
          request: { method: "GET", url: "http://127.0.0.1/" },
        },
      ],
    },
  ],
})
const insomnia = () => ({
  _type: "export",
  __export_format: 4,
  resources: [
    {
      _type: "workspace",
      _id: "w",
      name: "Foreign",
      preRequestScript: "insomnia.environment.set('secret', 'foreign-secret')",
    },
    {
      _type: "request_group",
      _id: "f",
      parentId: "w",
      name: "Folder",
      afterResponseScript: "insomnia.test('x', () => {})",
    },
    {
      _type: "request",
      _id: "r",
      parentId: "f",
      name: "Request",
      method: "GET",
      url: "http://127.0.0.1/",
      preRequestScript: "context.request.setHeader('secret', 'foreign-secret')",
      afterResponseScript: "insomnia.test('x', () => {})",
    },
  ],
})

it.each(
  ["collection pre", "folder pre", "request pre", "request tests"].flatMap(
    (scope) => [[scope, "default"] as const, [scope, "current"] as const],
  ),
)(
  "rejects %s at an existing %s target before any writes",
  async (scope, destination) => {
    const input = postman()
    input.event = []
    input.item[0]!.event = []
    input.item[0]!.item[0]!.event = []
    const source = join(dir, "source.json")
    await writeFile(source, JSON.stringify(input))
    const result = await runImport({ source, outputDir: dir, silent: true })
    const settingsPath = join(result.path, "settings.yml")
    const settings = await readFile(settingsPath, "utf8")
    const existing = "name: Existing\nmethod: GET\nurl: http://127.0.0.1/\n"
    await writeFile(join(result.path, "existing.yml"), existing)
    const before = await readdir(result.path, { recursive: true })
    const hook = {
      listen: scope === "request tests" ? "test" : "prerequest",
      script: { type: "text/javascript", exec: ['console.log("imported")'] },
    }
    input.event = scope === "collection pre" ? [hook] : []
    input.item[0]!.event = scope === "folder pre" ? [hook] : []
    input.item[0]!.item[0]!.event = scope.startsWith("request") ? [hook] : []
    await writeFile(
      source,
      JSON.stringify({
        ...input,
        item: [{ name: "New outer folder", item: input.item }],
      }),
    )
    await expect(
      runImport({
        source,
        outputDir: dir,
        silent: true,
        destination:
          destination === "current"
            ? { kind: "current", collectionDir: result.path }
            : undefined,
      }),
    ).rejects.toThrow(
      "Collection scripts require importing into a new collection",
    )
    expect(await readFile(settingsPath, "utf8")).toBe(settings)
    expect(await readFile(join(result.path, "existing.yml"), "utf8")).toBe(
      existing,
    )
    expect(await readdir(result.path, { recursive: true })).toEqual(before)
    const fresh = await runImport({
      source,
      outputDir: join(dir, "fresh"),
      silent: true,
    })
    expect(fresh.warnings).toBeUndefined()
    expect(await readdir(fresh.path, { recursive: true })).toContain(
      join("new-outer-folder", "folder", "get-request.yml"),
    )
  },
)

it("detects Postman collection, folder and request phases without converting source", async () => {
  const result = await postmanImporter.import(JSON.stringify(postman()))
  expect(
    result.warnings?.map(({ itemPath, phase }) => [itemPath, phase]),
  ).toEqual([
    [["Foreign"], "prerequest"],
    [["Foreign", "Folder"], "test"],
    [["Foreign", "Folder", "Request"], "prerequest"],
    [["Foreign", "Folder", "Request"], "test"],
  ])
  expect(JSON.stringify(result)).not.toContain("foreign-secret")
  expect(JSON.stringify(result.collection)).not.toContain('"scripts"')
})

it("detects Insomnia script phases in JSON v4 and v5 without rewriting APIs", async () => {
  for (const version of [4, 5]) {
    const result = await insomniaImporter.import(
      JSON.stringify({ ...insomnia(), __export_format: version }),
    )
    expect(
      result.warnings?.map(({ itemPath, phase }) => [itemPath, phase]),
    ).toEqual([
      [["Foreign"], "preRequestScript"],
      [["Foreign", "Folder"], "afterResponseScript"],
      [["Foreign", "Folder", "Request"], "preRequestScript"],
      [["Foreign", "Folder", "Request"], "afterResponseScript"],
    ])
    expect(JSON.stringify(result)).not.toContain("foreign-secret")
    expect(JSON.stringify(result.collection)).not.toContain('"scripts"')
  }
})

it("keeps script-free and empty-script imports warning-free", async () => {
  const pm = postman()
  pm.event = []
  pm.item[0]!.event = []
  pm.item[0]!.item[0]!.event = [
    { listen: "test", script: { type: "text/javascript", exec: ["", " "] } },
  ]
  expect(
    (await postmanImporter.import(JSON.stringify(pm))).warnings,
  ).toBeUndefined()
  const input = insomnia()
  for (const resource of input.resources) {
    resource.preRequestScript = ""
    resource.afterResponseScript = " "
  }
  expect(
    (await insomniaImporter.import(JSON.stringify(input))).warnings,
  ).toBeUndefined()
})

it("surfaces structured warnings in import results, human output and CLI JSON", async () => {
  const source = join(dir, "postman.json")
  await writeFile(source, JSON.stringify(postman()))
  const result = await runImport({
    source,
    outputDir: join(dir, "out"),
    silent: true,
  })
  expect(result.warnings).toHaveLength(4)
  expect(formatImport(result)).toContain("Unsupported script globals: pm")
  expect(formatImport(result)).toContain("prerequest")
  expect(
    await readFile(join(result.path, "folder/get-request.yml"), "utf8"),
  ).not.toContain("pm.")
  const child = Bun.spawn(
    [
      process.execPath,
      "src/app/cli.ts",
      "import",
      source,
      "--output",
      join(dir, "cli"),
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(code).toBe(0)
  expect(stderr).toBe("")
  expect(JSON.parse(stdout).data.warnings).toEqual(result.warnings)
  expect(stdout).not.toContain("foreign-secret")
})

it("preserves compatible Postman placement and literal source, then executes inherited pre and request tests", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      return Response.json({ order: req.headers.get("x-order") })
    },
  })
  const compatible = (listen: string, source: string) => ({
    listen,
    script: { type: "text/javascript", exec: [source] },
  })
  const collectionPre = 'noodle.run.set("order", "collection")'
  const folderPre =
    'noodle.run.set("order", noodle.run.get("order") + "/folder")'
  const requestPre =
    'noodle.request.headers.set("X-Order", noodle.run.get("order") + "/request"); console.log("{{literal}}")'
  const tests =
    'test("inherited", () => expect(noodle.response.json().order).toBe("collection/folder/request"))'
  try {
    const input = postman()
    input.event = [compatible("prerequest", collectionPre)]
    input.item[0]!.event = [compatible("prerequest", folderPre)]
    input.item[0]!.item[0]!.event = [
      compatible("prerequest", requestPre),
      compatible("test", tests),
    ]
    input.item[0]!.item[0]!.request.url = `http://127.0.0.1:${server.port}/`
    const source = join(dir, "compatible.json")
    await writeFile(source, JSON.stringify(input))
    const result = await runImport({ source, outputDir: dir, silent: true })
    expect(result.warnings).toBeUndefined()
    const { loadSettings, saveSettings, filestore } =
      await import("../../src/filestore")
    expect((await loadSettings(result.path)).scripts?.pre).toBe(collectionPre)
    await saveSettings(result.path, {
      ...(await loadSettings(result.path)),
      cookies: { enabled: false },
    })
    const collection = await filestore.loadCollection(result.path)
    const folder = collection.items[0]!
    expect(folder.type).toBe("folder")
    if (folder.type !== "folder") throw Error("missing folder")
    expect(folder.data.scripts?.pre).toBe(folderPre)
    expect(folder.data.children[0]!.data).toMatchObject({
      scripts: { pre: requestPre },
      tests,
    })
    const { requestRun, collectionRun } = await import("../../src/app/services")
    const manual = await requestRun(
      "folder/get-request",
      result.path,
      undefined,
      undefined,
      true,
    )
    expect(manual.failed).toBe(false)
    expect(manual.result.tests?.results[0]?.passed).toBe(true)
    expect(manual.result.scripts?.results.at(-1)?.logs[0]?.message).toBe(
      "{{literal}}",
    )
    expect(
      (
        await collectionRun(result.path, undefined, undefined, true)
      ).results.every((result) => result.failureCategories.length === 0),
    ).toBe(true)
    await expect(
      runImport({
        source,
        silent: true,
        destination: { kind: "current", collectionDir: result.path },
      }),
    ).rejects.toThrow(
      "Collection scripts require importing into a new collection",
    )
  } finally {
    server.stop(true)
  }
})

it("preserves only compatible Insomnia request hooks without synthesizing inherited tests", async () => {
  const input = insomnia()
  input.resources[0]!.preRequestScript = 'console.log("workspace")'
  input.resources[1]!.afterResponseScript = 'console.log("folder")'
  input.resources[2]!.preRequestScript =
    'noodle.request.headers.set("X-Time", String(Date.now()))'
  input.resources[2]!.afterResponseScript =
    'if (noodle.response.status === 200) noodle.run.set("id", noodle.response.json().id)'
  const result = await insomniaImporter.import(JSON.stringify(input))
  expect(result.warnings).toHaveLength(2)
  const folder = result.collection.items[0]!
  expect(result.collection.scripts).toBeUndefined()
  if (folder.type !== "folder") throw Error("missing folder")
  expect(folder.data.scripts).toBeUndefined()
  expect(folder.data.tests).toBeUndefined()
  expect(folder.data.children[0]!.data).toMatchObject({
    scripts: {
      pre: input.resources[2]!.preRequestScript,
      post: input.resources[2]!.afterResponseScript,
    },
  })
})

it.each(["TRACE", 123])(
  "warns for each compatible hook on a skipped Insomnia request with method %j",
  async (method) => {
    const input = insomnia()
    const skipped = input.resources[2]!
    skipped.preRequestScript = 'console.log("private-pre-source")'
    skipped.afterResponseScript = 'console.log("private-post-source")'
    input.resources.push({
      _type: "request",
      _id: "valid",
      parentId: "f",
      name: "Valid",
      method: "GET",
      url: "http://127.0.0.1/",
      preRequestScript: "",
      afterResponseScript: "",
    })
    const result = await insomniaImporter.import(
      JSON.stringify({
        ...input,
        resources: input.resources.map((resource) =>
          resource === skipped ? { ...resource, method } : resource,
        ),
      }),
    )
    const folder = result.collection.items[0]!
    if (folder.type !== "folder") throw Error("missing folder")
    expect(folder.data.children.map(({ data }) => data.name)).toEqual(["Valid"])
    expect(
      result.warnings?.map(({ itemPath, phase, reason }) => [
        itemPath,
        phase,
        reason,
      ]),
    ).toEqual([
      [["Foreign"], "preRequestScript", "unsupported-globals"],
      [["Foreign", "Folder"], "afterResponseScript", "unsupported-globals"],
      [
        ["Foreign", "Folder", "Request"],
        "preRequestScript",
        "unsupported-placement",
      ],
      [
        ["Foreign", "Folder", "Request"],
        "afterResponseScript",
        "unsupported-placement",
      ],
    ])
    expect(JSON.stringify(result)).not.toContain("private-pre-source")
    expect(JSON.stringify(result)).not.toContain("private-post-source")
  },
)

it("warns instead of concatenating duplicate events or enabling disabled, external and package scripts", async () => {
  const input = postman()
  input.event = []
  input.item[0]!.event = []
  const hook = {
    listen: "prerequest",
    script: {
      type: "text/javascript",
      exec: ['console.log("literal-secret")'],
    },
  }
  for (const events of [
    [hook, hook],
    [{ ...hook, disabled: true }],
    [
      {
        ...hook,
        script: { ...hook.script, src: "https://example.invalid/private.js" },
      },
    ],
    [
      {
        ...hook,
        script: { ...hook.script, packages: { dep: "secret-package" } },
      },
    ],
    [{ ...hook, script: { ...hook.script, exec: ["const broken = ;"] } }],
  ]) {
    input.item[0]!.item[0]!.event = events
    const result = await postmanImporter.import(JSON.stringify(input))
    expect(result.warnings?.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.collection)).not.toContain('"scripts"')
    expect(JSON.stringify(result.warnings)).not.toContain("literal-secret")
    expect(JSON.stringify(result.warnings)).not.toContain("private.js")
  }
})

it("reports Insomnia plugin APIs and both formats in human and JSON CLI output", async () => {
  for (const input of [postman(), insomnia()]) {
    const source = join(dir, "source.json")
    await writeFile(source, JSON.stringify(input))
    for (const json of [false, true]) {
      const binary = process.env.NOODLE_TEST_BINARY
      const child = Bun.spawn(
        [
          ...(binary ? [binary] : [process.execPath, "src/app/cli.ts"]),
          "import",
          source,
          "--output",
          join(dir, "outputs"),
          ...(json ? ["--json"] : []),
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect(code).toBe(0)
      expect(stderr).toBe("")
      expect(stdout).not.toContain("foreign-secret")
      if (json) {
        const result = JSON.parse(stdout)
        expect(result.status).toBe("success")
        expect(result.data.warnings).toHaveLength(4)
        expect(
          result.data.warnings.some(
            (warning: { unsupportedGlobals: string[] }) =>
              warning.unsupportedGlobals.includes("context") ||
              warning.unsupportedGlobals.includes("pm"),
          ),
        ).toBe(true)
      } else expect(stdout).toContain("Script was not converted")
    }
  }
})
