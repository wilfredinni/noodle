import { describe, it, expect } from "bun:test"
import { splitEnvVars } from "../../src/ui/envHighlight"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test-env", vars }
}

describe("splitEnvVars", () => {
  it("returns single plain segment for text without variables", () => {
    const result = splitEnvVars("plain text", env({}))
    expect(result).toEqual([
      { text: "plain text", isVar: false, exists: false },
    ])
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
    expect(result[1]!).toEqual({
      text: " $ stuff",
      isVar: false,
      exists: false,
    })
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

