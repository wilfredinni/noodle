import { describe, it, expect } from "bun:test"
import {
  splitEnvVars,
  splitUrlPathVars,
} from "../../src/ui/variable-completion/envHighlight"
import type { Environment, ParamEntry } from "../../src/schema"

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

describe("splitUrlPathVars", () => {
  it("marks resolved path token with exists=true", () => {
    const pathParams: ParamEntry[] = [
      { name: "id", value: "42", enabled: true },
    ]
    const result = splitUrlPathVars(
      "https://api.example.com/users/:id",
      null,
      pathParams,
    )
    expect(result).toEqual([
      {
        text: "https://api.example.com/users/",
        isVar: false,
        exists: false,
        isPath: false,
      },
      { text: ":id", isVar: false, exists: true, isPath: true },
    ])
  })

  it("marks missing path token with exists=false", () => {
    const result = splitUrlPathVars(
      "https://api.example.com/users/:id",
      null,
      [],
    )
    expect(result).toEqual([
      {
        text: "https://api.example.com/users/",
        isVar: false,
        exists: false,
        isPath: false,
      },
      { text: ":id", isVar: false, exists: false, isPath: true },
    ])
  })

  it("marks a missing token after a resolved URL variable as unresolved", () => {
    const result = splitUrlPathVars(
      "$base_url/posts/:post_id",
      env({ base_url: "https://api.example.com" }),
      [],
    )
    expect(result.find((segment) => segment.isPath)).toEqual({
      text: ":post_id",
      isVar: false,
      exists: false,
      isPath: true,
    })
  })

  it("marks path token with empty value as unresolved", () => {
    const pathParams: ParamEntry[] = [{ name: "id", value: "", enabled: true }]
    const result = splitUrlPathVars("/:id", null, pathParams)
    expect(result[1]!).toEqual({
      text: ":id",
      isVar: false,
      exists: false,
      isPath: true,
    })
  })

  it("ignores unsupported disabled state on path tokens", () => {
    const pathParams: ParamEntry[] = [
      { name: "id", value: "42", enabled: false },
    ]
    const result = splitUrlPathVars("/:id", null, pathParams)
    expect(result[1]!).toEqual({
      text: ":id",
      isVar: false,
      exists: true,
      isPath: true,
    })
  })

  it("handles :name.json suffix", () => {
    const pathParams: ParamEntry[] = [
      { name: "id", value: "42", enabled: true },
    ]
    const result = splitUrlPathVars(
      "https://api.example.com/users/:id.json",
      env({}),
      pathParams,
    )
    const pathSeg = result.find((s) => s.isPath)
    expect(pathSeg).toBeDefined()
    expect(pathSeg!.text).toBe(":id")
    expect(pathSeg!.exists).toBe(true)
  })

  it("combines $var and :path tokens correctly", () => {
    const pathParams: ParamEntry[] = [
      { name: "id", value: "42", enabled: true },
    ]
    const result = splitUrlPathVars(
      "$base/users/:id",
      env({ base: "https://api.example.com" }),
      pathParams,
    )
    expect(result).toEqual([
      { text: "$base", isVar: true, exists: true, isPath: false },
      { text: "/users/", isVar: false, exists: false, isPath: false },
      { text: ":id", isVar: false, exists: true, isPath: true },
    ])
  })

  it("does not highlight port numbers as path tokens", () => {
    const result = splitUrlPathVars("https://localhost:3000/users/:id", null, [
      { name: "id", value: "42", enabled: true },
    ])
    const pathSegs = result.filter((s) => s.isPath)
    expect(pathSegs).toHaveLength(1)
    expect(pathSegs[0]!.text).toBe(":id")
  })

  it("does not highlight query-string colons as path tokens", () => {
    const result = splitUrlPathVars(
      "https://api.example.com/posts?filter=:active",
      null,
      [],
    )
    const pathSegs = result.filter((s) => s.isPath)
    expect(pathSegs).toHaveLength(0)
  })

  it("does not highlight tokens followed by unsupported characters", () => {
    const result = splitUrlPathVars(
      "https://api.example.com/users/:id~suffix",
      null,
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result.filter((segment) => segment.isPath)).toHaveLength(0)
  })

  it("does not highlight basic-auth separator as path token", () => {
    const result = splitUrlPathVars(
      "https://user:pass@api.example.com/v1",
      null,
      [],
    )
    const pathSegs = result.filter((s) => s.isPath)
    expect(pathSegs).toHaveLength(0)
  })
})
