import { describe, it, expect, mock } from "bun:test"
import type { Request } from "../../src/schema"
import { send, interpolatePathParams } from "../../src/requests/send"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "test",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("send — param deduplication", () => {
  it("params block replaces inline URL value for same key", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42",
        params: [{ name: "userId", value: "99", enabled: true }],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("99")
      expect(parsed.searchParams.getAll("userId")).toEqual(["99"])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("replaces same-key inline param with multiple params block entries", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?id=1&sort=asc",
        params: [
          { name: "id", value: "a", enabled: true },
          { name: "id", value: "b", enabled: true },
        ],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("sort")).toBe("asc")
      expect(parsed.searchParams.getAll("id")).toEqual(["a", "b"])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("preserves param only in URL when not in params block", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42",
        params: [],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("42")
    } finally {
      globalThis.fetch = orig
    }
  })

  it("appends param only in params block when not in URL", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts",
        params: [{ name: "userId", value: "42", enabled: true }],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("42")
    } finally {
      globalThis.fetch = orig
    }
  })

  it("supports multiple params with same key via array format", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts",
        params: [
          { name: "filter", value: "active", enabled: true },
          { name: "filter", value: "pending", enabled: true },
        ],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.getAll("filter")).toEqual([
        "active",
        "pending",
      ])
    } finally {
      globalThis.fetch = orig
    }
  })
})

describe("interpolatePathParams", () => {
  it("replaces :token with value in absolute URL", () => {
    const result = interpolatePathParams("https://api.example.com/users/:id", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("https://api.example.com/users/42")
  })

  it("replaces multiple tokens", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:userId/posts/:postId",
      [
        { name: "userId", value: "alice", enabled: true },
        { name: "postId", value: "99", enabled: true },
      ],
    )
    expect(result).toBe("https://api.example.com/users/alice/posts/99")
  })

  it("encodes special characters in value", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:name",
      [{ name: "name", value: "alice/bob", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/alice%2Fbob")
  })

  it("preserves suffix like .json after token", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:id.json",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/42.json")
  })

  it("does not partially replace unsupported token names", () => {
    const result = interpolatePathParams(
      "https://api.example.com/orders/:order~id",
      [{ name: "order", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/orders/:order~id")
  })

  it("handles relative URL", () => {
    const result = interpolatePathParams("/users/:id/posts", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("/users/42/posts")
  })

  it("throws on empty value", () => {
    expect(() =>
      interpolatePathParams("https://api.example.com/users/:id", [
        { name: "id", value: "", enabled: true },
      ]),
    ).toThrow('path parameter ":id" has no value')
  })

  it("throws on disabled entry", () => {
    expect(() =>
      interpolatePathParams("https://api.example.com/users/:id", [
        { name: "id", value: "42", enabled: false },
      ]),
    ).toThrow('path parameter ":id" has no value')
  })

  it("preserves token when entry is missing", () => {
    expect(interpolatePathParams("https://api.example.com/users/:id", [])).toBe(
      "https://api.example.com/users/:id",
    )
  })

  it("returns url unchanged when no path tokens exist", () => {
    const result = interpolatePathParams("https://api.example.com/users", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("https://api.example.com/users")
  })

  it("returns url unchanged on malformed URL", () => {
    const result = interpolatePathParams("not a valid url", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("not a valid url")
  })

  it("preserves query string after token interpolation", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:id?verbose=true",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/42?verbose=true")
  })

  it("preserves port in URL", () => {
    const result = interpolatePathParams(
      "https://api.example.com:8443/users/:id",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com:8443/users/42")
  })
})
