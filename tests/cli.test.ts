import { describe, it, expect } from "bun:test"
import defaultCommand from "../src/app/commands/default"
import importCommand from "../src/app/commands/import"

const defaultMeta = defaultCommand.meta as {
  name?: string
  description?: string
}
const defaultArgs = defaultCommand.args as Record<
  string,
  { type?: string; default?: string; alias?: string }
>
const importMeta = importCommand.meta as { name?: string }
const importArgs = importCommand.args as Record<
  string,
  { type?: string; required?: boolean; alias?: string }
>

describe("default command (noodle)", () => {
  it("has correct meta name", () => {
    expect(defaultMeta.name).toBe("noodle")
  })

  it("has meta description", () => {
    expect(defaultMeta.description).toBeTruthy()
  })

  it("has --collection arg with default ./collections", () => {
    const arg = defaultArgs.collection
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.default).toBe("./collections")
    expect(arg?.alias).toBe("c")
  })

  it("has --env arg with alias e", () => {
    const arg = defaultArgs.env
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.alias).toBe("e")
  })

  it("has run handler", () => {
    expect(typeof defaultCommand.run).toBe("function")
  })
})

describe("import command", () => {
  it("has correct meta name", () => {
    expect(importMeta.name).toBe("import")
  })

  it("has source as required positional arg", () => {
    const arg = importArgs.source
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("positional")
    expect(arg?.required).toBe(true)
  })

  it("has optional --format arg with alias i", () => {
    const arg = importArgs.format
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.alias).toBe("i")
  })

  it("has optional --output arg with alias o", () => {
    const arg = importArgs.output
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.alias).toBe("o")
  })

  it("has run handler", () => {
    expect(typeof importCommand.run).toBe("function")
  })
})
