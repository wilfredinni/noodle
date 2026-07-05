import { describe, it, expect } from "bun:test"
import { join } from "node:path"
import type { CommandMeta, ArgsDef, StringArgDef } from "citty"
import defaultCommand from "../src/app/commands/default"
import importCommand from "../src/app/commands/import"
import updateCommand from "../src/app/commands/update"

const CLI = join(import.meta.dir, "../src/app/cli.ts")
const defaultMeta = defaultCommand.meta as CommandMeta | undefined
const defaultArgs = defaultCommand.args as ArgsDef | undefined
const importMeta = importCommand.meta as CommandMeta | undefined
const importArgs = importCommand.args as ArgsDef | undefined
const updateMeta = updateCommand.meta as CommandMeta | undefined

describe("default command (noodle)", () => {
  it("has correct meta name", () => {
    expect(defaultMeta?.name).toBe("noodle")
  })

  it("has meta description", () => {
    expect(defaultMeta?.description).toBeTruthy()
  })

  it("has --collection arg with default ./collections", () => {
    const arg = defaultArgs?.collection
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.default).toBe("./collections")
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

  it("has no required args", () => {
    expect(updateCommand.args).toBeUndefined()
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

describe("CLI integration", () => {
  it("shows available subcommands with --help", () => {
    const proc = Bun.spawnSync(["bun", CLI, "--help"], {})
    expect(proc.exitCode).toBe(0)
    const out = proc.stdout.toString()
    expect(out).toContain("noodle")
    expect(out).toContain("import")
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
    expect(out).toContain("format")
    expect(out).toContain("output")
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
})
