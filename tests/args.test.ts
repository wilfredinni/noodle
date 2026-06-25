import { describe, it, expect } from "bun:test"
import { parseArgs } from "../src/app/args"

describe("parseArgs", () => {
  it("defaults collectionDir to ./collections when no flags", () => {
    expect(parseArgs([])).toEqual({
      collectionDir: "./collections",
      help: false,
    })
  })
  it("parses --collection <dir> (space form)", () => {
    expect(parseArgs(["--collection", "./my-api"]).collectionDir).toBe(
      "./my-api",
    )
  })
  it("parses --collection=<dir> (equals form)", () => {
    expect(parseArgs(["--collection=./my-api"]).collectionDir).toBe("./my-api")
  })
  it("sets help=true for --help", () => {
    expect(parseArgs(["--help"]).help).toBe(true)
  })
  it("sets help=true for -h", () => {
    expect(parseArgs(["-h"]).help).toBe(true)
  })
  it("throws when --collection has no value (last arg)", () => {
    expect(() => parseArgs(["--collection"])).toThrow("args:")
  })
  it("throws when --collection is followed by another flag", () => {
    expect(() => parseArgs(["--collection", "--help"])).toThrow("args:")
  })
  it("throws on unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("args:")
  })
  it("last --collection wins when repeated", () => {
    expect(
      parseArgs(["--collection", "./a", "--collection", "./b"]).collectionDir,
    ).toBe("./b")
  })
  it("throws when --collection= has empty value", () => {
    expect(() => parseArgs(["--collection="])).toThrow("args:")
  })
  it("throws on unexpected positional argument", () => {
    expect(() => parseArgs(["foo.txt"])).toThrow("args:")
  })
  it("combines --help with --collection", () => {
    const result = parseArgs(["-h", "--collection", "./foo"])
    expect(result.help).toBe(true)
    expect(result.collectionDir).toBe("./foo")
  })
})
