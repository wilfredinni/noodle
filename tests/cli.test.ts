import { describe, it, expect } from "bun:test"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type { CommandMeta, ArgsDef, StringArgDef } from "citty"
import defaultCommand from "../src/app/commands/default"
import exportCommand from "../src/app/commands/export"
import importCommand from "../src/app/commands/import"
import updateCommand from "../src/app/commands/update"
import { classifyPath, resolveStartupCollectionDir } from "../src/app/main"
import { getUserArgsStart } from "../src/app/argv"

const CLI = join(import.meta.dir, "../src/app/cli.ts")
const defaultMeta = defaultCommand.meta as CommandMeta | undefined
const defaultArgs = defaultCommand.args as ArgsDef | undefined
const importMeta = importCommand.meta as CommandMeta | undefined
const importArgs = importCommand.args as ArgsDef | undefined
const exportMeta = exportCommand.meta as CommandMeta | undefined
const exportArgs = exportCommand.args as ArgsDef | undefined
const updateMeta = updateCommand.meta as CommandMeta | undefined

describe("default command (noodle)", () => {
  it("has correct meta name", () => {
    expect(defaultMeta?.name).toBe("noodle")
  })

  it("has meta description", () => {
    expect(defaultMeta?.description).toBeTruthy()
  })

  it("has --collection arg with alias c and no default", () => {
    const arg = defaultArgs?.collection
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.default).toBeUndefined()
    expect((arg as StringArgDef)?.alias).toBe("c")
  })

  it("has --env arg with alias e", () => {
    const arg = defaultArgs?.env
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect((arg as StringArgDef)?.alias).toBe("e")
  })

  it("has run handler", () => {
    expect(typeof defaultCommand.run).toBe("function")
  })
})

describe("update command", () => {
  it("has correct meta name", () => {
    expect(updateMeta?.name).toBe("update")
  })

  it("has meta description", () => {
    expect(updateMeta?.description).toBeTruthy()
  })

  it("has optional JSON output", () => {
    const args = updateCommand.args as ArgsDef | undefined
    const json = args?.json as StringArgDef | undefined
    expect(json?.required).not.toBe(true)
  })

  it("has an optional force flag", () => {
    const args = updateCommand.args as ArgsDef | undefined
    const force = args?.force as StringArgDef | undefined
    expect(force?.required).not.toBe(true)
  })

  it("has run handler", () => {
    expect(typeof updateCommand.run).toBe("function")
  })
})

describe("import command", () => {
  it("has correct meta name", () => {
    expect(importMeta?.name).toBe("import")
  })

  it("has source as required positional arg", () => {
    const arg = importArgs?.source
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("positional")
    expect(arg?.required).toBe(true)
  })

  it("has optional --format arg with alias i", () => {
    const arg = importArgs?.format
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect((arg as StringArgDef)?.alias).toBe("i")
  })

  it("has optional --output arg with alias o", () => {
    const arg = importArgs?.output
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect((arg as StringArgDef)?.alias).toBe("o")
  })

  it("has run handler", () => {
    expect(typeof importCommand.run).toBe("function")
  })
})

describe("export command", () => {
  it("has the required collection, format, and output arguments", () => {
    expect(exportMeta?.name).toBe("export")
    expect(exportArgs?.collection).toMatchObject({
      type: "positional",
      required: true,
    })
    expect(exportArgs?.format).toMatchObject({ type: "string", required: true })
    expect(exportArgs?.output).toMatchObject({ type: "string", required: true })
    expect((exportArgs?.output as StringArgDef)?.alias).toBe("o")
  })
})

describe("CLI integration", () => {
  it("finds user args after source and compiled Bun entrypoints", () => {
    expect(getUserArgsStart(["bun", "src/app/cli.ts", "--help"])).toBe(2)
    expect(
      getUserArgsStart(["./noodle", "/$bunfs/root/noodle", "--help"]),
    ).toBe(2)
    expect(getUserArgsStart(["./noodle", "--help"])).toBe(2)
  })

  it("works from a compiled Bun binary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-cli-compiled-"))
    const binary = join(dir, "noodle")
    try {
      const build = Bun.spawnSync(
        ["bun", "build", "--compile", CLI, "--outfile", binary],
        { cwd: dir },
      )
      expect(build.exitCode).toBe(0)

      const proc = Bun.spawnSync([binary, "--help"])
      expect(proc.exitCode).toBe(0)
      expect(proc.stdout.toString()).toContain("Terminal REST client")
      expect(proc.stderr.toString()).not.toContain("Unknown command")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("shows available subcommands with --help", () => {
    const proc = Bun.spawnSync(["bun", CLI, "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("noodle")
    expect(out).toContain("import")
    expect(out).toContain("export")
    expect(out).toContain("update")
  })

  it("shows default command flags with noodle --help", () => {
    const proc = Bun.spawnSync(["bun", CLI, "noodle", "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("collection")
    expect(out).toContain("env")
  })

  it("shows help for import subcommand with import --help", () => {
    const proc = Bun.spawnSync(["bun", CLI, "import", "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("SOURCE")
    expect(out).toContain("swagger")
    expect(out).toContain("insomnia")
    expect(out).toContain("format")
    expect(out).toContain("output")
  })

  it("exports a collection and preserves the JSON result envelope", async () => {
    const root = await mkdtemp(join(tmpdir(), "noodle-cli-export-"))
    const dir = join(root, "collection")
    const output = join(root, "out", "openapi.yml")
    try {
      await mkdir(dir)
      await writeFile(
        join(dir, "ping.yml"),
        "name: Ping\nmethod: GET\nurl: https://example.com/ping\n",
      )
      const proc = Bun.spawnSync([
        "bun",
        CLI,
        "export",
        dir,
        "--format",
        "openapi",
        "--output",
        output,
        "--json",
      ])
      expect(proc.exitCode).toBe(0)
      expect(JSON.parse(proc.stdout.toString())).toEqual({
        status: "success",
        data: {
          path: output,
          name: basename(dir),
          format: "openapi",
          operationCount: 1,
        },
        errors: [],
      })
      expect(await readFile(output, "utf8")).toContain("openapi: 3.0.3")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("shows help for update subcommand with update --help", () => {
    const proc = Bun.spawnSync(["bun", CLI, "update", "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("Update")
  })

  it("fails when import is called without source argument", () => {
    const proc = Bun.spawnSync(["bun", CLI, "import"], {})
    expect(proc.exitCode).not.toBe(0)
    const err = proc.stderr.toString()
    expect(err).toContain("SOURCE")
  })

  it("uses readable text by default and preserves the JSON envelope", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-cli-output-"))
    try {
      await writeFile(join(dir, "settings.yml"), "{}\n")
      await writeFile(
        join(dir, "ping.yml"),
        "name: Ping\nmethod: GET\nurl: https://example.com/ping\n",
      )
      const human = Bun.spawnSync(["bun", CLI, "collection", "list", dir])
      expect(human.exitCode).toBe(0)
      expect(human.stdout.toString()).toBe(
        `Collection: ${dir}\n└─ GET Ping https://example.com/ping\n`,
      )

      const json = Bun.spawnSync([
        "bun",
        CLI,
        "collection",
        "list",
        dir,
        "--json",
      ])
      expect(json.exitCode).toBe(0)
      expect(JSON.parse(json.stdout.toString())).toEqual({
        status: "success",
        data: {
          path: dir,
          tree: [
            {
              type: "request",
              id: "ping",
              name: "Ping",
              method: "GET",
              url: "https://example.com/ping",
            },
          ],
        },
        errors: [],
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("adds noodle subcommand when positional path is given", () => {
    const proc = Bun.spawnSync(["bun", CLI, "./collections", "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("TARGETPATH")
  })

  it("rejects both positional path and --collection flag", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-cli-conflict-"))
    try {
      // Create settings.yml so the run handler doesn't try to init an
      // empty directory (we just want the argument conflict error).
      await writeFile(join(dir, "settings.yml"), "environment: development\n")
      const proc = Bun.spawnSync(["bun", CLI, dir, "--collection", dir])
      const err = proc.stderr.toString()
      expect(err).toContain("cannot supply both")
      expect(proc.exitCode).not.toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("accepts --collection with -c alias", () => {
    const proc = Bun.spawnSync(["bun", CLI, "-c", "./collections", "--help"])
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("collection")
  })

  it("accepts --collection with --collection= form", () => {
    const proc = Bun.spawnSync([
      "bun",
      CLI,
      "--collection=./collections",
      "--help",
    ])
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("collection")
  })

  it("accepts --env with -e alias", () => {
    const proc = Bun.spawnSync([
      "bun",
      CLI,
      "-e",
      "development",
      "--collection",
      "./collections",
      "--help",
    ])
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("env")
  })

  it("handles regular file path without crashing", () => {
    const proc = Bun.spawnSync(["bun", CLI, __filename, "--help"])
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    // Should still show help for the default command even with a file path
    expect(out).toContain("Terminal REST client")
  })

  it("does not inject noodle subcommand for known subcommands", () => {
    const proc = Bun.spawnSync(["bun", CLI, "import", "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("SOURCE")
    expect(out).toContain("format")
  })
})

describe("classifyPath", () => {
  it("returns invalid for missing path", () => {
    expect(classifyPath("/tmp/noodle-nonexistent-xyz")).toBe("invalid")
  })

  it("returns invalid for a regular file path", () => {
    expect(classifyPath(__filename)).toBe("invalid")
  })

  it("returns collection for path with settings.yml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await writeFile(join(dir, "settings.yml"), "environment: dev\n")
      expect(classifyPath(dir)).toBe("collection")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns collection for path with .environments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await mkdir(join(dir, ".environments"))
      expect(classifyPath(dir)).toBe("collection")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns collection for path with root request .yml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await writeFile(
        join(dir, "ping.yml"),
        "name: Ping\nmethod: GET\nurl: https://example.com\n",
      )
      expect(classifyPath(dir)).toBe("collection")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns browse for path with nested request only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await mkdir(join(dir, "api"))
      await writeFile(
        join(dir, "api", "ping.yml"),
        "name: Ping\nmethod: GET\nurl: https://example.com\n",
      )
      expect(classifyPath(dir)).toBe("browse")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns empty for truly empty directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      expect(classifyPath(dir)).toBe("empty")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("returns browse for directory with non-dot subdirs containing requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await mkdir(join(dir, "src"))
      await mkdir(join(dir, "src", "lib"))
      await mkdir(join(dir, "collections"))
      await writeFile(
        join(dir, "collections", "ping.yml"),
        "name: Ping\nmethod: GET\nurl: https://example.com\n",
      )
      expect(classifyPath(dir)).toBe("browse")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("skips dot-prefixed dirs when checking for nested content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-classify-"))
    try {
      await mkdir(join(dir, ".noodle"))
      await writeFile(
        join(dir, ".noodle", "data.yml"),
        "name: Nope\nmethod: GET\nurl: https://example.com\n",
      )
      expect(classifyPath(dir)).toBe("empty")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("resolveStartupCollectionDir", () => {
  it("uses the current directory when no registered collection exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-startup-"))
    try {
      expect(resolveStartupCollectionDir({}, [], dir)).toBe(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("uses the first existing registered collection before the current directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-startup-"))
    const collection = join(dir, "collection")
    await mkdir(collection)
    try {
      expect(
        resolveStartupCollectionDir(
          {},
          [join(dir, "missing"), collection],
          dir,
        ),
      ).toBe(collection)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("keeps an explicit collection path even when it does not exist", () => {
    expect(
      resolveStartupCollectionDir(
        { collectionDir: "/tmp/noodle-explicit-missing" },
        [],
      ),
    ).toBe("/tmp/noodle-explicit-missing")
  })
})
