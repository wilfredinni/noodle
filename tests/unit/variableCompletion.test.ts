import { describe, expect, it } from "bun:test"
import {
  getVariableHighlights,
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
} from "../../src/ui/variableCompletion"
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
})
