import { describe, expect, it } from "bun:test"
import {
  getVariableHighlights,
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
  bodyVariableNames,
  variableCompletionItem,
} from "../../src/ui/variable-completion/variableCompletion"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test", vars }
}

describe("variable completion", () => {
  it("preserves sentence punctuation when completing and highlighting body calls", () => {
    const source = "Created at $time.is."
    const token = getVariableToken(source, source.length - 1, "text")!
    expect(replaceVariableToken(source, token, "time.iso", "text").value).toBe(
      "Created at $time.iso.",
    )
    expect(getVariableHighlights("$time.iso.", null, "text")).toEqual([
      { start: 0, end: 9, exists: true },
    ])
  })
  it("offers body generators without an environment and preserves method arguments", () => {
    expect(bodyVariableNames(["host"], "")).toEqual([
      "host",
      "random.",
      "time.",
    ])
    const names = bodyVariableNames([], "random.")
    expect(names).toContain("random.uuid")
    expect(names).not.toContain("random.seed")
    expect(getVariableSuggestions(names, "random.nu")).toEqual([
      "random.number",
    ])
    expect(getVariableToken("$random.nu", 10)).toBeNull()
    const value = '$random.nu({"min":18})'
    const token = getVariableToken(value, 10, "text")!
    expect(
      replaceVariableToken(value, token, "random.number", "text").value,
    ).toBe('$random.number({"min":18})')
    expect(getVariableToken("$$random.nu", 11, "text")).toBeNull()
    expect(getVariableToken('$random.pick(["$host"])', 19, "text")).toBeNull()
    const pick = replaceVariableToken(
      "$random.pi",
      getVariableToken("$random.pi", 10, "text")!,
      "random.pick",
      "text",
    )
    expect(pick).toEqual({ value: "$random.pick([])", cursorOffset: 14 })
    expect(
      variableCompletionItem("random.number", "text").description,
    ).toContain("integer")
    expect(variableCompletionItem("host").description).toBeUndefined()
  })

  it("completes time methods, preserves arguments, and inserts required calls with the cursor inside", () => {
    const names = bodyVariableNames([], "time.")
    expect(names).toHaveLength(9)
    expect(getVariableSuggestions(names, "time.f")).toEqual([
      "time.format",
      "time.fromUnix",
    ])
    expect(getVariableToken("$time.is", 8)).toBeNull()
    expect(getVariableToken("$$time.is", 9, "text")).toBeNull()
    expect(
      getVariableToken('$time.format(0, "[$host]")', 21, "text"),
    ).toBeNull()
    const source = '$time.fo(0, "YYYY") suffix'
    expect(
      replaceVariableToken(
        source,
        getVariableToken(source, 8, "text")!,
        "time.format",
        "text",
      ).value,
    ).toBe('$time.format(0, "YYYY") suffix')
    const complete = (prefix: string, name: string) =>
      replaceVariableToken(
        prefix,
        getVariableToken(prefix, prefix.length, "text")!,
        name,
        "text",
      )
    expect(complete("$time.is", "time.iso")).toEqual({
      value: "$time.iso",
      cursorOffset: 9,
    })
    expect(complete("$time.fr", "time.fromUnix")).toEqual({
      value: "$time.fromUnix()",
      cursorOffset: 15,
    })
    const details = variableCompletionItem("time.format", "json")
    expect(details.description).toContain("timezone")
    expect(details.signature).toContain("pattern: string")
    expect(details.example).toBe('$time.format("2026-01-01", "YYYY-MM-DD")')
    expect(variableCompletionItem("time.format").description).toBeUndefined()
    expect(
      getVariableHighlights(
        "$time.now $time.parse $time.iso(0) $time.now(1) $time",
        null,
        "text",
      ).map((item) => item.exists),
    ).toEqual([true, false, true, false, false])
  })

  it("highlights valid and invalid random calls independently of environment variables", () => {
    const value = "$random.uuid $random.uuid(1) $host"
    expect(
      getVariableHighlights(value, null, "text").map((item) => item.exists),
    ).toEqual([true, false, false])
    expect(
      getVariableHighlights('"$random.pick([\\"$host\\"])"', null, "json"),
    ).toHaveLength(1)
  })
  it("matches any part of a variable name without changing its ordering", () => {
    expect(
      getVariableSuggestions(
        ["USER_TOKEN", "token", "api_token_value"],
        "ToKeN",
      ),
    ).toEqual(["api_token_value", "token", "USER_TOKEN"])
  })
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
