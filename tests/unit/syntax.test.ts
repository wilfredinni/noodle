import { describe, it, expect } from "bun:test"
import { highlightJsonTokens } from "../../src/ui/syntax"
import { opencodeTheme } from "../../src/ui/theme-data"

describe("highlightJsonTokens", () => {
  it("returns empty array for empty body", () => {
    const tokens = highlightJsonTokens("", opencodeTheme)
    expect(tokens).toEqual([])
  })

  it("returns empty array for whitespace-only body", () => {
    const tokens = highlightJsonTokens("  \n  ", opencodeTheme)
    expect(tokens).toEqual([])
  })

  it("highlights bracket-only lines as textMuted", () => {
    const tokens = highlightJsonTokens("{\n}", opencodeTheme)
    expect(tokens.length).toBe(2)
    expect(tokens[0]!.fg).toBe(opencodeTheme.textMuted)
    expect(tokens[0]!.text).toBe("{")
    expect(tokens[0]!.offset).toBe(0)
    expect(tokens[1]!.fg).toBe(opencodeTheme.textMuted)
    expect(tokens[1]!.text).toBe("}")
    expect(tokens[1]!.offset).toBe(1)
  })

  it("highlights key:value lines with secondary for key and success for string value", () => {
    const tokens = highlightJsonTokens('{\n  "name": "hello"\n}', opencodeTheme)
    const nameToken = tokens.find((t) => t.text.includes('"name"'))
    const valueToken = tokens.find((t) => t.text.includes("hello"))
    expect(nameToken).toBeDefined()
    expect(nameToken!.fg).toBe(opencodeTheme.secondary)
    expect(valueToken).toBeDefined()
    expect(valueToken!.fg).toBe(opencodeTheme.success)
  })

  it("highlights numbers with warning color", () => {
    const tokens = highlightJsonTokens('{\n  "count": 42\n}', opencodeTheme)
    const numToken = tokens.find((t) => t.text.includes("42"))
    expect(numToken).toBeDefined()
    expect(numToken!.fg).toBe(opencodeTheme.warning)
  })

  it("highlights booleans with info color", () => {
    const tokens = highlightJsonTokens('{\n  "active": true\n}', opencodeTheme)
    const boolToken = tokens.find((t) => t.text.includes("true"))
    expect(boolToken).toBeDefined()
    expect(boolToken!.fg).toBe(opencodeTheme.info)
  })

  it("highlights null with info color", () => {
    const tokens = highlightJsonTokens('{\n  "data": null\n}', opencodeTheme)
    const nullToken = tokens.find((t) => t.text === "null")
    expect(nullToken).toBeDefined()
    expect(nullToken!.fg).toBe(opencodeTheme.info)
  })

  it("tokens have correct sequential offsets", () => {
    const body = '{\n  "a": 1\n}'
    const tokens = highlightJsonTokens(body, opencodeTheme)
    expect(tokens[0]!.offset).toBe(0)
    expect(tokens[0]!.text).toBe("{")
    expect(tokens[1]!.offset).toBe(1)
    expect(tokens[1]!.text).toBe("  ")
    expect(tokens[2]!.offset).toBe(3)
    expect(tokens[3]!.offset).toBe(8)
    expect(tokens[3]!.text).toBe("1")
    expect(tokens[4]!.offset).toBe(9)
    expect(tokens[4]!.text).toBe("}")
  })

  it("highlights comma as textMuted", () => {
    const tokens = highlightJsonTokens('[\n  "x",\n  "y"\n]', opencodeTheme)
    const commaToken = tokens.find((t) => t.text === ",")
    expect(commaToken).toBeDefined()
    expect(commaToken!.fg).toBe(opencodeTheme.textMuted)
  })

  it("handles non-JSON text gracefully", () => {
    const tokens = highlightJsonTokens("just some text", opencodeTheme)
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]!.fg).toBe(opencodeTheme.text)
  })

  it("highlights negative numbers and floats", () => {
    const tokens = highlightJsonTokens(
      '{\n  "a": -3.14,\n  "b": 1e10\n}',
      opencodeTheme,
    )
    const negToken = tokens.find((t) => t.text === "-3.14")
    const expToken = tokens.find((t) => t.text === "1e10")
    expect(negToken).toBeDefined()
    expect(negToken!.fg).toBe(opencodeTheme.warning)
    expect(expToken).toBeDefined()
    expect(expToken!.fg).toBe(opencodeTheme.warning)
  })

  it("handles array values on their own lines", () => {
    const tokens = highlightJsonTokens(
      '[\n  "a",\n  42,\n  true\n]',
      opencodeTheme,
    )
    const strToken = tokens.find((t) => t.text === '"a"')
    const numToken = tokens.find((t) => t.text.includes("42"))
    const boolToken = tokens.find((t) => t.text.includes("true"))
    expect(strToken!.fg).toBe(opencodeTheme.success)
    expect(numToken!.fg).toBe(opencodeTheme.warning)
    expect(boolToken!.fg).toBe(opencodeTheme.info)
  })
})
