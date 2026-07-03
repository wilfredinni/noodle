import { describe, it, expect } from "bun:test"
import defaultCommand from "../src/app/commands/default"
import importCommand from "../src/app/commands/import"

describe("default command (noodle)", () => {
  it("has correct meta name", () => {
    expect(defaultCommand.meta?.name).toBe("noodle")
  })

  it("has meta description", () => {
    expect(defaultCommand.meta?.description).toBeTruthy()
  })

  it("has --collection arg with default ./collections", () => {
    const arg = defaultCommand.args?.collection
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.default).toBe("./collections")
    expect(arg?.alias).toBe("c")
  })

  it("has --env arg with alias e", () => {
    const arg = defaultCommand.args?.env
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
    expect(importCommand.meta?.name).toBe("import")
  })

  it("has source as required positional arg", () => {
    const arg = importCommand.args?.source
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("positional")
    expect(arg?.required).toBe(true)
  })

  it("has optional --format arg with alias i", () => {
    const arg = importCommand.args?.format
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.alias).toBe("i")
  })

  it("has optional --output arg with alias o", () => {
    const arg = importCommand.args?.output
    expect(arg).toBeDefined()
    expect(arg?.type).toBe("string")
    expect(arg?.alias).toBe("o")
  })

  it("has run handler", () => {
    expect(typeof importCommand.run).toBe("function")
  })
})
