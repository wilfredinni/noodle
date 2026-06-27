import { describe, it, expect } from "bun:test"
import { buildDisplayUrl, parseUrlAndParams } from "../../src/ui/urlParams"
import type { KvEntry } from "../../src/schema"

describe("buildDisplayUrl", () => {
  it("returns url unchanged when params empty", () => {
    expect(buildDisplayUrl("https://example.com/posts", {})).toBe(
      "https://example.com/posts",
    )
  })

  it("appends enabled params as query string", () => {
    const params: Record<string, KvEntry> = {
      userId: { value: "1", enabled: true },
      limit: { value: "10", enabled: true },
    }
    expect(buildDisplayUrl("https://example.com/posts", params)).toBe(
      "https://example.com/posts?userId=1&limit=10",
    )
  })

  it("skips disabled params", () => {
    const params: Record<string, KvEntry> = {
      userId: { value: "1", enabled: true },
      secret: { value: "xyz", enabled: false },
    }
    expect(buildDisplayUrl("https://example.com/posts", params)).toBe(
      "https://example.com/posts?userId=1",
    )
  })

  it("merges params with existing URL query string (params override)", () => {
    const params: Record<string, KvEntry> = {
      page: { value: "2", enabled: true },
    }
    const result = buildDisplayUrl(
      "https://example.com/posts?page=1&sort=asc",
      params,
    )
    const u = new URL(result)
    expect(u.searchParams.get("page")).toBe("2")
    expect(u.searchParams.get("sort")).toBe("asc")
  })

  it("preserves existing query when no params override", () => {
    const params: Record<string, KvEntry> = {
      limit: { value: "10", enabled: true },
    }
    expect(
      buildDisplayUrl("https://example.com/posts?sort=asc", params),
    ).toBe("https://example.com/posts?sort=asc&limit=10")
  })

  it("strips query string when all params disabled and URL had query", () => {
    const params: Record<string, KvEntry> = {
      page: { value: "1", enabled: false },
    }
    expect(
      buildDisplayUrl("https://example.com/posts?page=1", params),
    ).toBe("https://example.com/posts")
  })

  it("handles URL with path but no origin (relative-like)", () => {
    const params: Record<string, KvEntry> = {
      filter: { value: "active", enabled: true },
    }
    expect(buildDisplayUrl("/api/users", params)).toBe("/api/users?filter=active")
  })

  it("returns empty string for empty url", () => {
    expect(buildDisplayUrl("", { userId: { value: "1", enabled: true } })).toBe(
      "",
    )
  })

  it("appends params to any string accepted as URL by runtime", () => {
    const params: Record<string, KvEntry> = {
      x: { value: "1", enabled: true },
    }
    const result = buildDisplayUrl("just-a-string", params)
    expect(result).toBe("just-a-string?x=1")
  })

  it("preserves {{var}} literals in params", () => {
    const params: Record<string, KvEntry> = {
      token: { value: "{{API_KEY}}", enabled: true },
    }
    expect(buildDisplayUrl("https://example.com/data", params)).toBe(
      "https://example.com/data?token=%7B%7BAPI_KEY%7D%7D",
    )
  })

  it("handles multiple params with same key (last wins)", () => {
    const params: Record<string, KvEntry> = {
      id: { value: "1", enabled: true },
    }
    const result = buildDisplayUrl("https://example.com?sort=asc", params)
    const u = new URL(result)
    expect(u.searchParams.getAll("id")).toEqual(["1"])
    expect(u.searchParams.get("sort")).toBe("asc")
  })
})

describe("parseUrlAndParams", () => {
  it("returns base URL and empty params for URL without query", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual({})
  })

  it("extracts query params from URL", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts?userId=1&limit=10",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual({
      userId: { value: "1", enabled: true },
      limit: { value: "10", enabled: true },
    })
  })

  it("handles single query param", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/search?q=hello",
    )
    expect(baseUrl).toBe("https://example.com/search")
    expect(params).toEqual({
      q: { value: "hello", enabled: true },
    })
  })

  it("returns empty params for malformed URL without query", () => {
    const { baseUrl, params } = parseUrlAndParams("https://example.com")
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual({})
  })

  it("parses query string from URL with port", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com:8080/api?key=val",
    )
    expect(baseUrl).toBe("https://example.com:8080/api")
    expect(params).toEqual({
      key: { value: "val", enabled: true },
    })
  })

  it("handles empty raw string", () => {
    const { baseUrl, params } = parseUrlAndParams("")
    expect(baseUrl).toBe("")
    expect(params).toEqual({})
  })

  it("handles URL with no protocol (fallback path)", () => {
    const { baseUrl, params } = parseUrlAndParams("/api/users?page=1")
    expect(baseUrl).toBe("/api/users")
    expect(params).toEqual({
      page: { value: "1", enabled: true },
    })
  })

  it("handles URL with empty query string (?)", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts?",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual({})
  })

  it("preserves URL-encoded characters in param values", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?name=John%20Doe",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual({
      name: { value: "John Doe", enabled: true },
    })
  })

  it("handles URL with fragment (fragment is stripped)", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?key=val#section",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual({
      key: { value: "val", enabled: true },
    })
  })

  it("handles URL with hash (no query)", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com/posts#section",
    )
    expect(baseUrl).toBe("https://example.com/posts")
    expect(params).toEqual({})
  })

  it("preserves {{var}} literals in query params", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?token=%7B%7BAPI_KEY%7D%7D",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual({
      token: { value: "{{API_KEY}}", enabled: true },
    })
  })

  it("preserves {{var}} literals in unencoded query", () => {
    const { baseUrl, params } = parseUrlAndParams(
      "https://example.com?token={{API_KEY}}",
    )
    expect(baseUrl).toBe("https://example.com")
    expect(params).toEqual({
      token: { value: "{{API_KEY}}", enabled: true },
    })
  })
})
