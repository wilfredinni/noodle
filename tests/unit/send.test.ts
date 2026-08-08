import { describe, it, expect, mock } from "bun:test"
import type { NetworkError, Request } from "../../src/schema"
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

describe("send — network trace", () => {
  it("passes the resolved proxy to fetch and reports the selected route", async () => {
    const originalFetch = globalThis.fetch
    let proxy: string | undefined
    globalThis.fetch = mock(async (_url, init) => {
      const selected = (init as BunFetchRequestInit).proxy
      proxy = typeof selected === "string" ? selected : selected?.url
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          kind: "custom",
          source: "global",
          url: "http://proxy.test:8080",
          bypass: [],
        },
      )
      expect(proxy).toBe("http://proxy.test:8080")
      expect(response.network?.map((event) => event.type)).toEqual([
        "proxy",
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[0]?.message).toBe("Proxy: global")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("re-evaluates bypass rules for every redirect hop", async () => {
    const originalFetch = globalThis.fetch
    const proxies: Array<string | undefined> = []
    let calls = 0
    globalThis.fetch = mock(async (_url, init) => {
      const selected = (init as BunFetchRequestInit).proxy
      proxies.push(typeof selected === "string" ? selected : selected?.url)
      calls++
      return calls === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://internal.test/next" },
          })
        : new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://public.test/start" }),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          kind: "custom",
          source: "global",
          url: "http://proxy.test:8080",
          bypass: ["internal.test"],
        },
      )
      expect(proxies).toEqual(["http://proxy.test:8080", undefined])
      expect(
        response.network
          ?.filter((event) => event.type === "proxy")
          .map((event) => event.message),
      ).toEqual(["Proxy: global", "Proxy: bypassed"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("records request, response, body, and completion", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () => new Response("ok", { status: 200 }),
    ) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://api.example.com/users?token=secret" }),
      )
      expect(response.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[0]?.message).toBe(
        "GET https://api.example.com/users?...",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("reports each network event before the request settles", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () => new Response("ok", { status: 200 }),
    ) as unknown as typeof globalThis.fetch

    try {
      const snapshots: string[][] = []
      await send(
        makeReq(),
        undefined,
        undefined,
        undefined,
        undefined,
        (network) => snapshots.push(network.map((event) => event.type)),
      )
      expect(snapshots).toEqual([
        ["request"],
        ["request", "response"],
        ["request", "response", "body"],
        ["request", "response", "body", "complete"],
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("records redirect hops", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls++
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "/v2/users" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://api.example.com/users" }),
      )
      expect(response.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "redirect",
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[2]?.message).toBe(
        "302 -> https://api.example.com/v2/users",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to fetch errors", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      throw new Error("offline")
    }) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.message).toBe("requests.send: fetch failed: offline")
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to invalid redirect locations", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://[invalid" },
        }),
    ) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.message).toContain("invalid redirect location")
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity when redirects exceed the limit", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "/again" },
        }),
    ) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq({ maxRedirects: 0 }))
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to response body read errors", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      const response = new Response("ok", { status: 200 })
      await response.text()
      return response
    }) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
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

  it("ignores unsupported disabled state", () => {
    expect(
      interpolatePathParams("https://api.example.com/users/:id", [
        { name: "id", value: "42", enabled: false },
      ]),
    ).toBe("https://api.example.com/users/42")
  })

  it("throws when entry is missing", () => {
    expect(() =>
      interpolatePathParams("https://api.example.com/users/:id", []),
    ).toThrow('path parameter ":id" has no value')
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

describe("send — URL scheme", () => {
  it("defaults remote URLs to HTTPS and local URLs to HTTP", async () => {
    const captured: string[] = []
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured.push(url.toString())
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          url: "www.example.com/users/:id",
          pathParams: [{ name: "id", value: "42", enabled: true }],
        }),
      )
      await send(makeReq({ url: "http://localhost:3000/health" }))
      await send(makeReq({ url: "localhost:3000/health" }))
      await send(makeReq({ url: "api.localhost:8080/health" }))
      await send(makeReq({ url: "api.example.com:8443/health" }))
      await send(makeReq({ url: "192.168.1.10:8080/health" }))
      await send(makeReq({ url: "127.0.0.1:8080/health" }))
      await send(makeReq({ url: "[::1]:8080/health" }))
      await send(makeReq({ url: "api:3000/health" }))
      await send(makeReq({ url: "ftp:21" }))

      expect(captured).toEqual([
        "https://www.example.com/users/42",
        "http://localhost:3000/health",
        "http://localhost:3000/health",
        "http://api.localhost:8080/health",
        "https://api.example.com:8443/health",
        "https://192.168.1.10:8080/health",
        "http://127.0.0.1:8080/health",
        "http://[::1]:8080/health",
        "https://api:3000/health",
        "https://ftp:21/",
      ])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("rejects unsupported URL schemes", async () => {
    for (const [url, scheme] of [
      ["ftp://example.com/file", "ftp"],
      ["ws://example.com/socket", "ws"],
    ]) {
      await expect(send(makeReq({ url }))).rejects.toThrow(
        `unsupported URL scheme "${scheme}:"`,
      )
    }
  })
})

describe("send — required path parameters", () => {
  it("does not fetch for an empty value, with or without an environment", async () => {
    let calls = 0
    const orig = globalThis.fetch
    globalThis.fetch = mock(async () => {
      calls++
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const req = makeReq({
      url: "https://api.example.com/users/:id",
      pathParams: [{ name: "id", value: "", enabled: true }],
    })

    try {
      await expect(send(req)).rejects.toThrow(
        'path parameter ":id" has no value',
      )
      await expect(send(req, { name: "test", vars: {} })).rejects.toThrow(
        'path parameter ":id" has no value',
      )
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = orig
    }
  })

  it("does not fetch for a missing path parameter row", async () => {
    let calls = 0
    const orig = globalThis.fetch
    globalThis.fetch = mock(async () => {
      calls++
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(
        send(makeReq({ url: "https://api.example.com/users/:id" })),
      ).rejects.toThrow('path parameter ":id" has no value')
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = orig
    }
  })
})
