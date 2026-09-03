import { describe, expect, it } from "bun:test"
import {
  getVariableHighlights,
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
} from "../../src/ui/variable-completion/variableCompletion"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test", vars }
}

describe("variable completion", () => {
  it("finds an empty token immediately after a dollar sign", () => {
    expect(getVariableToken("https://$", 9)).toEqual({
      start: 8,
      end: 9,
      prefix: "",
    })
  })

  it("finds the token containing the cursor and its typed prefix", () => {
    expect(getVariableToken("$baseUrl/api", 5)).toEqual({
      start: 0,
      end: 8,
      prefix: "base",
    })
  })

  it("does not complete outside a variable token", () => {
    expect(getVariableToken("https://example.com", 8)).toBeNull()
  })

  it("filters, deduplicates, and sorts variable names", () => {
    expect(
      getVariableSuggestions(["team", "baseUrl", "team", "tenant"], "te"),
    ).toEqual(["team", "tenant"])
  })

  it("replaces the full token and moves the cursor after the selection", () => {
    expect(
      replaceVariableToken(
        "$baseUrl/api",
        { start: 0, end: 8, prefix: "base" },
        "host",
      ),
    ).toEqual({
      value: "$host/api",
      cursorOffset: 5,
    })
  })

  it("returns resolved and missing highlight ranges", () => {
    expect(
      getVariableHighlights("$host/$missing", env({ host: "example.com" })),
    ).toEqual([
      { start: 0, end: 5, exists: true },
      { start: 6, end: 14, exists: false },
    ])
  })

  it("ignores escaped literals but finds the reference after $$$", () => {
    expect(getVariableToken("$$host", 6)).toBeNull()
    expect(getVariableToken("$$$host", 7)).toEqual({
      start: 2,
      end: 7,
      prefix: "host",
    })
    expect(
      getVariableHighlights("$$host $$$real", env({ real: "yes" })),
    ).toEqual([{ start: 9, end: 14, exists: true }])
  })

  it("returns null for empty string", () => {
    expect(getVariableToken("", 0)).toBeNull()
  })

  it("returns null when cursor is before the $ sign", () => {
    expect(getVariableToken("$host", 0)).toBeNull()
  })

  it("finds token with cursor in the middle of the variable name", () => {
    expect(getVariableToken("$host", 3)).toEqual({
      start: 0,
      end: 5,
      prefix: "ho",
    })
  })

  it("returns null when no dollar sign precedes the cursor", () => {
    expect(getVariableToken("hello world", 5)).toBeNull()
  })

  it("returns null when cursor is before a non-variable dollar sign", () => {
    expect(getVariableToken("$10", 0)).toBeNull()
  })

  it("returns all names sorted when prefix is empty", () => {
    expect(getVariableSuggestions(["host", "port", "path"], "")).toEqual([
      "host",
      "path",
      "port",
    ])
  })

  it("filters case-insensitively matching all variations", () => {
    const result = getVariableSuggestions(["Host", "host"], "hOs")
    expect(result).toHaveLength(2)
    expect(result).toContain("Host")
    expect(result).toContain("host")
  })

  it("returns empty array when no names match", () => {
    expect(getVariableSuggestions(["host", "port"], "xyz")).toEqual([])
  })

  it("handles empty names list", () => {
    expect(getVariableSuggestions([], "h")).toEqual([])
  })

  it("replaces token at value start", () => {
    expect(
      replaceVariableToken(
        "$host/api",
        { start: 0, end: 5, prefix: "host" },
        "newHost",
      ),
    ).toEqual({
      value: "$newHost/api",
      cursorOffset: 8,
    })
  })

  it("replaces token at value end", () => {
    const result = replaceVariableToken(
      "prefix/$host",
      { start: 7, end: 12, prefix: "host" },
      "newHost",
    )
    expect(result.value).toBe("prefix/$newHost")
    expect(result.cursorOffset).toBe(15)
  })

  it("returns empty highlights for empty value", () => {
    expect(getVariableHighlights("", env({ host: "x" }))).toEqual([])
  })

  it("returns empty highlights when no variables present", () => {
    expect(getVariableHighlights("plain text", env({ host: "x" }))).toEqual([])
  })

  it("returns missing highlights when env is null", () => {
    expect(getVariableHighlights("$host", null)).toEqual([
      { start: 0, end: 5, exists: false },
    ])
  })
})
