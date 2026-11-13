import { afterEach, beforeEach, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  collectionAudit,
  collectionInspect,
  collectionList,
  collectionRun,
  collectionFormat,
  collectionInit,
  requestCreate,
} from "../../src/app/services"
import { filestore, ensureCollectionBootstrapped } from "../../src/filestore"
import { runImport } from "../../src/app/import"
import { registerImporter } from "../../src/converters"
import { lang } from "../../src/lang"

let dir: string
const legacy =
  "# operational note\nname: B\nurl: https://example.com\nmethod: GET\n"
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-integrity-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

it("reads original request bytes, including on partial load failures", async () => {
  const path = join(dir, "a.yml")
  await writeFile(path, legacy)
  await writeFile(join(dir, "b.yml"), legacy.replace("name: B", "name: A"))
  for (const load of [
    collectionList,
    collectionInspect,
    filestore.loadCollection,
  ]) {
    await load(dir)
    expect(await readFile(path, "utf8")).toBe(legacy)
  }
  expect((await collectionList(dir)).tree.map((item) => item.name)).toEqual([
    "B",
    "A",
  ])
  expect((await filestore.loadCollection(dir)).items[0]?.data).toMatchObject({
    timeout: 0,
  })
  await writeFile(join(dir, "broken.yml"), "[")
  await expect(filestore.loadCollection(dir)).rejects.toThrow("broken.yml")
  expect(await readFile(path, "utf8")).toBe(legacy)
  await rm(join(dir, "broken.yml"))
  await collectionFormat(dir)
  expect(await readFile(path, "utf8")).toContain("timeout: 0")
})

it("rejects reserved request basenames before collection or import writes", async () => {
  await writeFile(join(dir, "settings.yml"), "{}\n")
  for (const id of ["folder", "users/settings", "users/FoLdEr", "Settings"]) {
    await expect(
      requestCreate(id, "https://example.com", "GET", dir),
    ).rejects.toThrow(/reserved/i)
    await expect(
      filestore.saveRequest(dir, lang.parseRequest(id, legacy)),
    ).rejects.toThrow(/reserved/i)
  }
  await requestCreate("settings/list", "https://example.com", "GET", dir)
  expect(await Bun.file(join(dir, "settings/list.yml")).exists()).toBe(true)
  registerImporter({
    type: "integrity-fixture",
    detect: () => false,
    import: () => ({
      collection: {
        id: "imported",
        name: "Imported",
        items: ["first", "bad/folder"].map((id) => ({
          type: "request",
          data: lang.parseRequest(id, legacy),
        })),
      },
      environments: [],
    }),
  })
  await expect(
    runImport({
      source: join(dir, "settings.yml"),
      format: "integrity-fixture",
      outputDir: dir,
    }),
  ).rejects.toThrow(/reserved/i)
  expect(await Bun.file(join(dir, "imported/first.yml")).exists()).toBe(false)
})

it("runs requests in filename order even when their display names sort in reverse", async () => {
  await writeFile(join(dir, "settings.yml"), "cookies:\n  enabled: false\n")
  const pre = "scripts:\n  pre: throw new Error('stop before HTTP')\n"
  await writeFile(
    join(dir, "02-fetch.yml"),
    legacy.replace("name: B", "name: A") + pre,
  )
  await writeFile(join(dir, "01-create.yml"), legacy + pre)
  const run = await collectionRun(dir)
  expect(run.results.map((result) => result.id)).toEqual([
    "01-create",
    "02-fetch",
  ])
})

it("protects local files from git add and preserves existing ignore rules", async () => {
  const ignore = join(dir, ".gitignore")
  await writeFile(ignore, "# custom\r\n/.timeline/\r\nnotes")
  await collectionInit(dir, join(dir, ".config"))
  const content = await readFile(ignore, "utf8")
  expect(content).toBe("# custom\r\n/.timeline/\r\nnotes\r\n/.noodle/\r\n")
  await ensureCollectionBootstrapped(dir)
  expect(await readFile(ignore, "utf8")).toBe(content)
  expect(Bun.spawnSync(["git", "init", "-q"], { cwd: dir }).exitCode).toBe(0)
  for (const prefix of [".noodle", ".timeline"]) {
    await mkdir(join(dir, prefix))
    await writeFile(join(dir, prefix, "record.yml"), "private")
  }
  await writeFile(join(dir, "health.yml"), legacy)
  const result = Bun.spawnSync(["git", "add", "-n", "."], { cwd: dir })
  expect(result.exitCode).toBe(0)
  const staged = result.stdout.toString()
  expect(staged).toContain("health.yml")
  expect(staged).toContain("settings.yml")
  expect(staged).not.toContain("record.yml")
})

it("puts local ignore rules after negations and serializes concurrent initialization", async () => {
  const original = "/.timeline/\n!/.*/\n"
  const path = join(dir, ".gitignore")
  await writeFile(path, original)
  await Promise.all(
    Array.from({ length: 4 }, () => ensureCollectionBootstrapped(dir)),
  )
  expect(await readFile(path, "utf8")).toBe(
    original + "/.timeline/\n/.noodle/\n",
  )
})

it("audits inline and external script syntax in each applicable scope without executing", async () => {
  await mkdir(join(dir, "users"))
  await writeFile(join(dir, "bad.js"), "const = ;")
  const files = {
    "settings.yml": "scripts:\n  post: ./bad.js\n",
    "users/folder.yml": "scripts:\n  pre: 'const = ;'\n",
    "users/get.yml": legacy + "tests: ./bad.js\n",
    "valid.yml":
      legacy + "scripts:\n  pre: \"throw new Error('never execute')\"\n",
  }
  for (const [name, content] of Object.entries(files))
    await writeFile(join(dir, name), content)
  for (const fix of [false, true]) {
    const result = await collectionAudit(dir, fix)
    expect(result.valid).toBe(false)
    const issues = result.issues.filter((issue) => !issue.fixed)
    expect(issues.map((issue) => issue.path).sort()).toEqual([
      "settings.yml",
      "users/folder.yml",
      "users/get.yml",
    ])
    for (const issue of issues) {
      expect(issue.message).toMatch(
        /(Pre Script|Post Script|Tests).*\nSyntaxError at script line 1, column \d+/,
      )
      if (issue.kind !== "folder") expect(issue.message).toContain("./bad.js")
      expect(await readFile(join(dir, issue.path), "utf8")).toBe(
        files[issue.path as keyof typeof files],
      )
    }
  }
})
