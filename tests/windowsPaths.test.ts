import { afterEach, describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getNoodleConfigDir, validateFilenameSegment } from "../src/userPath"
import { normalizeCollectionPaths } from "../src/config"
import { collectionAudit, validateCollectionName } from "../src/app/services"
import { saveFolder, saveRequest } from "../src/filestore"
import { validateId } from "../src/requestId"
import { env } from "../src/env"
import { runImport } from "../src/app/import"
import { runCollectionImport } from "../src/ui/collectionImport"

const dirs: string[] = []
async function temporaryDirectory() {
  const dir = await mkdtemp(join(tmpdir(), "noodle Windows 界 "))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe("Windows path portability", () => {
  it("uses the native home directory when HOME is absent", () => {
    const modulePath = fileURLToPath(
      new URL("../src/userPath.ts", import.meta.url),
    )
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        `import { getNoodleConfigDir } from ${JSON.stringify(modulePath)}; import { homedir } from 'node:os'; console.log(JSON.stringify([homedir(), getNoodleConfigDir()]))`,
      ],
      { env: { ...process.env, HOME: undefined } },
    )
    expect(result.exitCode).toBe(0)
    const [home, configDir] = JSON.parse(result.stdout.toString())
    expect(isAbsolute(configDir)).toBe(true)
    expect(configDir).toBe(join(home, ".config", "noodle"))
    expect(getNoodleConfigDir()).toBe(join(homedir(), ".config", "noodle"))
  })

  it("preserves registered collection-path casing", () => {
    const path = resolve(tmpdir(), "MiXeD 界 Collection")
    expect(normalizeCollectionPaths([path, path])).toEqual([path])
  })

  it("audits nested requests using logical IDs and discovers environments", async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, "Folder 界", "nested"), { recursive: true })
    await mkdir(join(root, ".environments"))
    await writeFile(join(root, "settings.yml"), "{}\n")
    await writeFile(
      join(root, "Folder 界", "nested", "request.yml"),
      "name: Nested\nmethod: GET\nurl: https://example.com\n",
    )
    await writeFile(join(root, ".environments", "dev.env"), "bad-key=value\n")
    const invalid = await collectionAudit(root, false)
    expect(invalid.valid).toBe(false)
    expect(invalid.issues).toMatchObject([
      { kind: "environment", path: ".environments/dev.env", fixed: false },
    ])
    await writeFile(
      join(root, ".environments", "dev.env"),
      "host=example.com\n",
    )
    const fixed = await collectionAudit(root, true)
    expect(fixed.valid).toBe(true)
    expect(fixed.issues).toContainEqual({
      kind: "request",
      path: "Folder 界/nested/request.yml",
      message: "canonicalized",
      fixed: true,
    })
    expect(
      await readFile(join(root, "Folder 界", "nested", "request.yml"), "utf8"),
    ).toContain("name: Nested")
  })

  it("rejects Windows device names, forbidden/control characters and suffixes", () => {
    const invalid = [
      "CON",
      "aux.txt",
      "Com9",
      "LPT¹.log",
      "conin$",
      "conout$",
      "CON .txt",
      "trailing.",
      "trailing ",
      ...Array.from('<>:"/\\|?*', (char) => `a${char}b`),
      ...Array.from(
        { length: 32 },
        (_, code) => `a${String.fromCharCode(code)}b`,
      ),
    ]
    for (const name of invalid) {
      expect(() => validateFilenameSegment(name, "win32")).toThrow(
        "invalid Windows filename",
      )
    }
    for (const name of [
      "console",
      "COM10",
      "auxiliary",
      "café 界 🍜",
      "safe.name",
    ])
      expect(() => validateFilenameSegment(name, "win32")).not.toThrow()
    for (const name of ["CON", "aux.txt", "trailing.", "a?b"])
      expect(() => validateFilenameSegment(name, "linux")).not.toThrow()
  })

  it("rejects import writes through an escaping directory alias before any writes", async () => {
    const base = await temporaryDirectory()
    const root = join(base, "collection")
    const outside = join(base, "outside")
    await mkdir(root)
    await mkdir(outside)
    await symlink(
      outside,
      join(root, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    )
    const source = join(base, "source.json")
    await writeFile(
      source,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Import" },
        paths: {
          "/safe": { get: {} },
          "/escaped": { get: { tags: ["linked"] } },
        },
      }),
    )
    await expect(
      runImport({
        source,
        silent: true,
        destination: { kind: "current", collectionDir: root },
      }),
    ).rejects.toThrow("invalid imported path")
    expect(existsSync(join(root, "get-safe.yml"))).toBe(false)
    expect(existsSync(join(outside, "folder.yml"))).toBe(false)
  })

  it.skipIf(process.platform !== "win32")(
    "rejects reserved names at every write boundary",
    async () => {
      const root = await temporaryDirectory()
      expect(() => validateId("folder/CON")).toThrow("invalid Windows filename")
      expect(() => validateCollectionName("AUX")).toThrow(
        "invalid Windows filename",
      )
      await expect(
        saveRequest(root, {
          id: "CON",
          name: "Bad",
          method: "GET",
          url: "https://example.com",
          headers: {},
          params: [],
          timeout: 30000,
        }),
      ).rejects.toThrow("invalid Windows filename")
      await expect(
        saveFolder(root, { id: "NUL", path: "NUL", name: "Bad", children: [] }),
      ).rejects.toThrow("invalid Windows filename")
      await expect(
        env.saveEnvironment(root, { name: "COM1", vars: {} }),
      ).rejects.toThrow("invalid Windows filename")
      expect(existsSync(join(root, "NUL"))).toBe(false)
      const source = join(root, "source.json")
      await writeFile(
        source,
        JSON.stringify({
          openapi: "3.0.0",
          info: { title: "CON" },
          paths: { "/ok": { get: {} } },
        }),
      )
      await expect(
        runImport({ source, outputDir: root, silent: true }),
      ).rejects.toThrow("invalid Windows filename")
      expect(existsSync(join(root, "con"))).toBe(false)
    },
  )

  it.skipIf(process.platform !== "win32")(
    "accepts a new import parent on a different Windows drive",
    async () => {
      let invoked = false
      await runCollectionImport({
        values: {
          source: "D:\\spec.json",
          destination: "new",
          parentDir: "D:\\Imports",
        },
        collectionDir: "C:\\Collections\\Main",
        hasUnsavedChanges: false,
        pending: { current: false },
        runImport: async () => {
          invoked = true
          return {
            path: "D:\\Imports\\new",
            name: "New",
            formattedJsonBodies: 0,
          }
        },
      })
      expect(invoked).toBe(true)
    },
  )
})
