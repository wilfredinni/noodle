import { describe, it, expect } from "bun:test"
import {
  splitEnvVars,
  envVarStatus,
  varSummaryColor,
} from "../../src/ui/envHighlight"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test-env", vars }
}

function theme() {
  return { primary: "#fab283", error: "#e06c75" }
}

describe("splitEnvVars", () => {
  it("returns single plain segment for text without variables", () => {
    const result = splitEnvVars("plain text", env({}))
    expect(result).toEqual([{ text: "plain text", isVar: false, exists: false }])
  })

  it("returns empty array for empty string", () => {
    expect(splitEnvVars("", env({}))).toEqual([])
  })

  it("splits a resolved variable correctly", () => {
    const result = splitEnvVars("$host/api/users", env({ host: "localhost" }))
    expect(result).toEqual([
      { text: "$host", isVar: true, exists: true },
      { text: "/api/users", isVar: false, exists: false },
    ])
  })

  it("splits an unresolved variable correctly", () => {
    const result = splitEnvVars("$token", env({}))
    expect(result).toEqual([{ text: "$token", isVar: true, exists: false }])
  })

  it("marks all vars as unresolved when env is null", () => {
    const result = splitEnvVars("$host/$path", null)
    expect(result).toEqual([
      { text: "$host", isVar: true, exists: false },
      { text: "/", isVar: false, exists: false },
      { text: "$path", isVar: true, exists: false },
    ])
  })

  it("handles multiple variables mixed with plain text", () => {
    const result = splitEnvVars(
      "prefix $a middle $b suffix",
      env({ a: "1", b: "2" }),
    )
    expect(result).toEqual([
      { text: "prefix ", isVar: false, exists: false },
      { text: "$a", isVar: true, exists: true },
      { text: " middle ", isVar: false, exists: false },
      { text: "$b", isVar: true, exists: true },
      { text: " suffix", isVar: false, exists: false },
    ])
  })

  it("handles adjacent variables", () => {
    const result = splitEnvVars("$a$b", env({ a: "x", b: "y" }))
    expect(result).toEqual([
      { text: "$a", isVar: true, exists: true },
      { text: "$b", isVar: true, exists: true },
    ])
  })

  it("resolves some variables and not others", () => {
    const result = splitEnvVars("$good $bad", env({ good: "ok" }))
    expect(result).toEqual([
      { text: "$good", isVar: true, exists: true },
      { text: " ", isVar: false, exists: false },
      { text: "$bad", isVar: true, exists: false },
    ])
  })

  it("does not match $ followed by non-word char", () => {
    const result = splitEnvVars("$var $ stuff", env({ var: "x" }))
    expect(result[0]!).toEqual({ text: "$var", isVar: true, exists: true })
    expect(result[1]!).toEqual({ text: " $ stuff", isVar: false, exists: false })
  })

  it("does not match lone $ at end of string", () => {
    const result = splitEnvVars("test $", env({}))
    expect(result).toEqual([{ text: "test $", isVar: false, exists: false }])
  })

  it("matches $var in URL-like strings", () => {
    const result = splitEnvVars(
      "$baseUrl/api/$resource",
      env({ baseUrl: "https://api.example.com", resource: "users" }),
    )
    expect(result).toEqual([
      { text: "$baseUrl", isVar: true, exists: true },
      { text: "/api/", isVar: false, exists: false },
      { text: "$resource", isVar: true, exists: true },
    ])
  })

  it("handles $ with underscores", () => {
    const result = splitEnvVars("$api_key", env({ api_key: "abc" }))
    expect(result).toEqual([{ text: "$api_key", isVar: true, exists: true }])
  })

  it("handles $ with digits", () => {
    const result = splitEnvVars("$port8080", env({ port8080: "8080" }))
    expect(result).toEqual([{ text: "$port8080", isVar: true, exists: true }])
  })
})

describe("envVarStatus", () => {
  it('returns "none" when text has no variables', () => {
    expect(envVarStatus("plain text", env({}))).toBe("none")
  })

  it('returns "missing" when env is null', () => {
    expect(envVarStatus("$var", null)).toBe("missing")
  })

  it('returns "missing" when variable not in env', () => {
    expect(envVarStatus("$missing", env({}))).toBe("missing")
  })

  it('returns "resolved" when all variables exist', () => {
    expect(envVarStatus("$x $y", env({ x: "1", y: "2" }))).toBe("resolved")
  })

  it('returns "missing" when any variable is missing', () => {
    expect(envVarStatus("$x $missing", env({ x: "1" }))).toBe("missing")
  })

  it("handles empty string", () => {
    expect(envVarStatus("", env({}))).toBe("none")
  })
})

describe("varSummaryColor", () => {
  const t = theme()
  const base = "#cccccc"

  it("returns baseColor when no variables present", () => {
    expect(varSummaryColor("plain", env({}), t, base)).toBe(base)
  })

  it("returns error when env is null", () => {
    expect(varSummaryColor("$var", null, t, base)).toBe(t.error)
  })

  it("returns error when variable is missing", () => {
    expect(varSummaryColor("$missing", env({}), t, base)).toBe(t.error)
  })

  it("returns primary when all variables exist", () => {
    expect(varSummaryColor("$x", env({ x: "1" }), t, base)).toBe(t.primary)
  })

  it("returns error when any variable is missing", () => {
    expect(varSummaryColor("$good $bad", env({ good: "ok" }), t, base)).toBe(
      t.error,
    )
  })

  it("returns baseColor for empty string", () => {
    expect(varSummaryColor("", env({}), t, base)).toBe(base)
  })

  it("returns primary for multiple resolved variables", () => {
    expect(
      varSummaryColor("$a $b $c", env({ a: "1", b: "2", c: "3" }), t, base),
    ).toBe(t.primary)
  })
})
