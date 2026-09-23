import { afterEach, beforeEach, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
      preRequestScript: "console.log('foreign-secret')",
      afterResponseScript: "insomnia.test('x', () => {})",
    },
  ],
})

it("detects Postman collection, folder and request phases without converting source", () => {
  const result = postmanImporter.import(JSON.stringify(postman()))
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

it("detects Insomnia script phases in JSON v4 and v5 without rewriting APIs", () => {
  for (const version of [4, 5]) {
    const result = insomniaImporter.import(
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

it("keeps script-free and empty-script imports warning-free", () => {
  const pm = postman()
  pm.event = []
  pm.item[0]!.event = []
  pm.item[0]!.item[0]!.event = [
    { listen: "test", script: { type: "text/javascript", exec: ["", " "] } },
  ]
  expect(postmanImporter.import(JSON.stringify(pm)).warnings).toBeUndefined()
  const input = insomnia()
  for (const resource of input.resources) {
    resource.preRequestScript = ""
    resource.afterResponseScript = " "
  }
  expect(
    insomniaImporter.import(JSON.stringify(input)).warnings,
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
  expect(formatImport(result)).toContain("runtime API was not converted")
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
