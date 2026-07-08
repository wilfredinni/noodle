import { describe, it, expect, mock } from "bun:test"
import type { Request } from "../../src/schema"
import { send } from "../../src/requests/send"

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
  it("deduplicates param in both inline URL and params block", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42",
        params: [{ name: "userId", value: "42", enabled: true }],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.getAll("userId")).toEqual(["42"])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("params block value overrides inline URL value when both differ", async () => {
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

  it("handles multiple params with no duplication", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42&status=active",
        params: [
          { name: "userId", value: "99", enabled: true },
          { name: "format", value: "json", enabled: true },
        ],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("99")
      expect(parsed.searchParams.get("status")).toBe("active")
      expect(parsed.searchParams.get("format")).toBe("json")
      expect(parsed.searchParams.getAll("userId")).toEqual(["99"])
    } finally {
      globalThis.fetch = orig
    }
  })
})
