import { describe, it, expect } from "bun:test"
import {
  buildDisplayUrl,
  parseUrlAndParams,
  syncParamsWithUrl,
  parseUrlPathTokens,
  syncPathParamsWithUrl,
} from "../../src/ui/urlParams"
import type { ParamEntry } from "../../src/schema"

describe("buildDisplayUrl", () => {
  it("returns url unchanged when params empty", () => {
    expect(buildDisplayUrl("https://example.com/posts", [])).toBe(
      "https://example.com/posts",
    )
  })

  it("appends enabled params as query string", () => {
    const params: ParamEntry[] = [
      { name: "userId", value: "1", enabled: true },
      { name: "limit", value: "10", enabled: true },
    ]
    expect(buildDisplayUrl("https://example.com/posts", params)).toBe(
      "https://example.com/posts?userId=1&limit=10",
    )
  })

  it("skips disabled params", () => {
    const params: ParamEntry[] = [
      { name: "userId", value: "1", enabled: true },
      { name: "secret", value: "xyz", enabled: false },
    ]
    expect(buildDisplayUrl("https://example.com/posts", params)).toBe(
      "https://example.com/posts?userId=1",
    )
  })

  it("merges params with existing URL query string (params override)", () => {
    const params: ParamEntry[] = [{ name: "page", value: "2", enabled: true }]
    const result = buildDisplayUrl(
      "https://example.com/posts?page=1&sort=asc",
      params,
    )
    const u = new URL(result)
    expect(u.searchParams.get("page")).toBe("2")
    expect(u.searchParams.get("sort")).toBe("asc")
  })

  it("preserves existing query when no params override", () => {
    const params: ParamEntry[] = [{ name: "limit", value: "10", enabled: true }]
    expect(buildDisplayUrl("https://example.com/posts?sort=asc", params)).toBe(
      "https://example.com/posts?sort=asc&limit=10",
    )
  })

  it("strips query string when all params disabled and URL had query", () => {
    const params: ParamEntry[] = [{ name: "page", value: "1", enabled: false }]
    expect(buildDisplayUrl("https://example.com/posts?page=1", params)).toBe(
      "https://example.com/posts",
    )
  })

  it("handles URL with path but no origin (relative-like)", () => {
    const params: ParamEntry[] = [
      { name: "filter", value: "active", enabled: true },
    ]
    expect(buildDisplayUrl("/api/users", params)).toBe(
      "/api/users?filter=active",
    )
  })

  it("returns empty string for empty url", () => {
    expect(
      buildDisplayUrl("", [{ name: "userId", value: "1", enabled: true }]),
    ).toBe("")
  })

  it("appends params to any string accepted as URL by runtime", () => {
    const params: ParamEntry[] = [{ name: "x", value: "1", enabled: true }]
    const result = buildDisplayUrl("just-a-string", params)
    expect(result).toBe("just-a-string?x=1")
  })

  it("preserves $var literals in params", () => {
    const params: ParamEntry[] = [
      { name: "token", value: "$API_KEY", enabled: true },
    ]
    expect(buildDisplayUrl("https://example.com/data", params)).toBe(
      "https://example.com/data?token=$API_KEY",
    )
  })

  it("handles multiple params with same key (last wins)", () => {
    const params: ParamEntry[] = [{ name: "id", value: "1", enabled: true }]
    const result = buildDisplayUrl("https://example.com?sort=asc", params)
    const u = new URL(result)
    expect(u.searchParams.getAll("id")).toEqual(["1"])
  })

  it("preserves multiple params with same key in output", () => {
    const params: ParamEntry[] = [
      { name: "filter", value: "active", enabled: true },
      { name: "filter", value: "pending", enabled: true },
    ]
    const result = buildDisplayUrl("https://example.com/data", params)
    const u = new URL(result)
    expect(u.searchParams.getAll("filter")).toEqual(["active", "pending"])
  })
})

describe("parseUrlAndParams", () => {
  it("returns base URL and empty params for URL without query", () => {
    const { baseUrl, params } = parseUrlAndParams("https://example.com/posts")
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual([])
  })

  it("extracts query params from URL", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts?userId=1&limit=10",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual([
      { name: "userId", value: "1", enabled: true },
      { name: "limit", value: "10", enabled: true },
    ])
  })

  it("handles single query param", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/search?q=hello",
    )
    expect(baseUrl).toBe("https://example.com/search")
    expect(params).toEqual([{ name: "q", value: "hello", enabled: true }])
  })

  it("returns empty params for malformed URL without query", () => {
    const { baseUrl, params } = parseUrlAndParams("https://example.com")
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([])
  })

  it("parses query string from URL with port", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com:8080/api?key=val",
    )
    expect(baseUrl).toBe("https://example.com:8080/api")
    expect(params).toEqual([{ name: "key", value: "val", enabled: true }])
  })

  it("handles empty raw string", () => {
    const { baseUrl, params } = parseUrlAndParams("")
    expect(baseUrl).toBe("")
    expect(params).toEqual([])
  })

  it("handles URL with no protocol (fallback path)", () => {
    const { baseUrl, params } = parseUrlAndParams("/api/users?page=1")
    expect(baseUrl).toBe("/api/users")
    expect(params).toEqual([{ name: "page", value: "1", enabled: true }])
  })

  it("handles URL with empty query string (?)", () => {
    const { baseUrl, params } = parseUrlAndParams("https://example.com/posts?")
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual([])
  })

  it("preserves URL-encoded characters in param values", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?name=John%20Doe",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([{ name: "name", value: "John Doe", enabled: true }])
  })

  it("handles URL with fragment (fragment is stripped)", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?key=val#section",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([{ name: "key", value: "val", enabled: true }])
  })

  it("handles URL with hash (no query)", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts#section",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual([])
  })

  it("preserves $var literals in query params", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?token=%24API_KEY",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([
      { name: "token", value: "$API_KEY", enabled: true },
    ])
  })

  it("preserves $var literals in unencoded query", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?token=$API_KEY",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([
      { name: "token", value: "$API_KEY", enabled: true },
    ])
  })
})

describe("syncParamsWithUrl", () => {
  it("preserves disabled parameters when URL is synced", () => {
    const current: ParamEntry[] = [
      { name: "active", value: "1", enabled: true },
      { name: "debug", value: "off", enabled: false },
    ]
    const { baseUrl, params } = syncParamsWithUrl(
      current,
      "https://example.com?active=1",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([
      { name: "active", value: "1", enabled: true },
      { name: "debug", value: "off", enabled: false },
    ])
  })

  it("overrides disabled parameter if explicitly enabled in URL", () => {
    const current: ParamEntry[] = [
      { name: "debug", value: "off", enabled: false },
    ]
    const { baseUrl, params } = syncParamsWithUrl(
      current,
      "https://example.com?debug=on",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([{ name: "debug", value: "on", enabled: true }])
  })

  it("preserves disabled parameter when an enabled parameter with the same name exists", () => {
    const current: ParamEntry[] = [
      { name: "filter", value: "active", enabled: true },
      { name: "filter", value: "pending", enabled: false },
    ]
    const { baseUrl, params } = syncParamsWithUrl(
      current,
      "https://example.com?filter=active",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual([
      { name: "filter", value: "active", enabled: true },
      { name: "filter", value: "pending", enabled: false },
    ])
  })
})

describe("parseUrlPathTokens", () => {
  it("extracts :name tokens from pathname", () => {
    expect(
      parseUrlPathTokens("https://api.example.com/users/:id/posts/:postId"),
    ).toEqual(["id", "postId"])
  })

  it("ignores query params with colon", () => {
    expect(
      parseUrlPathTokens("https://api.example.com/posts?filter=:active"),
    ).toEqual([])
  })

  it("handles relative URLs", () => {
    expect(parseUrlPathTokens("/users/:id")).toEqual(["id"])
  })

  it("extracts token from :name.json segment", () => {
    expect(
      parseUrlPathTokens("https://api.example.com/users/:id.json"),
    ).toEqual(["id"])
  })

  it("does not truncate unsupported token names", () => {
    expect(
      parseUrlPathTokens("https://api.example.com/orders/:order~id"),
    ).toEqual([])
  })

  it("returns empty array for URL without tokens", () => {
    expect(parseUrlPathTokens("https://api.example.com/posts")).toEqual([])
  })

  it("handles port in URL", () => {
    expect(
      parseUrlPathTokens("https://api.example.com:8443/users/:id"),
    ).toEqual(["id"])
  })

  it("returns unique names in URL order", () => {
    expect(parseUrlPathTokens("/:b/:a/:b")).toEqual(["b", "a"])
  })
})

describe("syncPathParamsWithUrl", () => {
  it("adds new path params from URL tokens", () => {
    const result = syncPathParamsWithUrl(
      [],
      "https://api.example.com/users/:id",
    )
    expect(result).toEqual([{ name: "id", value: "", enabled: true }])
  })

  it("renames row when token name changes at same position", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:userId",
    )
    expect(result).toEqual([{ name: "userId", value: "42", enabled: true }])
  })

  it("handles partial type mid-rename preserving value", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:i",
    )
    expect(result).toEqual([{ name: "i", value: "42", enabled: true }])
  })

  it("appends new empty row for extra URL token", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:id/:sort",
    )
    expect(result).toEqual([
      { name: "id", value: "42", enabled: true },
      { name: "sort", value: "", enabled: true },
    ])
  })

  it("removes extra rows when URL tokens shrink", () => {
    const current: ParamEntry[] = [
      { name: "id", value: "42", enabled: true },
      { name: "sort", value: "asc", enabled: false },
    ]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:id",
    )
    expect(result).toEqual([{ name: "id", value: "42", enabled: true }])
  })

  it("clears all when URL has no path tokens", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/posts",
    )
    expect(result).toEqual([])
  })

  it("handles empty URL", () => {
    const current: ParamEntry[] = [{ name: "id", value: "1", enabled: true }]
    const result = syncPathParamsWithUrl(current, "")
    expect(result).toEqual([])
  })

  it("preserves value when name unchanged, sets enabled true", () => {
    const current: ParamEntry[] = [{ name: "id", value: "99", enabled: false }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:id",
    )
    expect(result).toEqual([{ name: "id", value: "99", enabled: true }])
  })

  it("sets enabled true when renaming a path token", () => {
    const current: ParamEntry[] = [{ name: "id", value: "99", enabled: false }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:userId",
    )
    expect(result).toEqual([{ name: "userId", value: "99", enabled: true }])
  })

  it("preserves values when new token inserted before existing one", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/:org/users/:id",
    )
    expect(result).toEqual([
      { name: "org", value: "", enabled: true },
      { name: "id", value: "42", enabled: true },
    ])
  })

  it("preserves values when new token inserted after existing one", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:id/:version",
    )
    expect(result).toEqual([
      { name: "id", value: "42", enabled: true },
      { name: "version", value: "", enabled: true },
    ])
  })

  it("matches by name when order changes", () => {
    const current: ParamEntry[] = [
      { name: "postId", value: "10", enabled: true },
      { name: "userId", value: "alice", enabled: true },
    ]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:userId/posts/:postId",
    )
    expect(result).toEqual([
      { name: "userId", value: "alice", enabled: true },
      { name: "postId", value: "10", enabled: true },
    ])
  })

  it("detects rename when old name disappears and no positional match remains", () => {
    const current: ParamEntry[] = [{ name: "id", value: "42", enabled: true }]
    const result = syncPathParamsWithUrl(
      current,
      "https://api.example.com/users/:userId",
    )
    expect(result).toEqual([{ name: "userId", value: "42", enabled: true }])
  })
})
