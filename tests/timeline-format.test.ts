import { describe, it, expect } from "bun:test"
import {
  truncateUrl,
  relativeTime,
  entryMethod,
  entryStatus,
  entryTiming,
  entryIsError,
  buildTimelineEntry,
} from "../src/ui/timeline/formatTimeline"
import type { TimelineEntry } from "../src/schema"

describe("truncateUrl", () => {
  it("returns full URL when shorter than max", () => {
    expect(truncateUrl("https://example.com", 60)).toBe("https://example.com")
  })

  it("returns full URL when exactly max", () => {
    const url = "a".repeat(60)
    expect(truncateUrl(url, 60)).toBe(url)
  })

  it("truncates with ... when longer than max", () => {
    const url = "https://jsonplaceholder.typicode.com/posts/1/comments"
    const result = truncateUrl(url, 30)
    expect(result.endsWith("...")).toBe(true)
    expect(result.length).toBe(30)
  })

  it("uses default max of 60", () => {
    const short = "https://short.url"
    const long = "https://" + "a".repeat(60) + ".com"
    expect(truncateUrl(short)).toBe(short)
    expect(truncateUrl(long).endsWith("...")).toBe(true)
    expect(truncateUrl(long).length).toBe(60)
  })

  it("preserves URL scheme and beginning", () => {
    const url = "https://jsonplaceholder.typicode.com/posts/1"
    const result = truncateUrl(url, 30)
    expect(result).toBe("https://jsonplaceholder.typ...")
  })

  it("handles small max gracefully", () => {
    expect(truncateUrl("hello", 3)).toBe("...")
    expect(truncateUrl("hello", 4)).toBe("h...")
    expect(truncateUrl("hello", 5)).toBe("hello")
    expect(truncateUrl("hello", 6)).toBe("hello")
    expect(truncateUrl("hello", 10)).toBe("hello")
  })

  it("returns full URL when max equals 3 and URL is short", () => {
    expect(truncateUrl("ab", 3)).toBe("ab")
    expect(truncateUrl("abc", 3)).toBe("abc")
  })

  it("returns full URL when URL is empty", () => {
    expect(truncateUrl("", 10)).toBe("")
  })
})

describe("relativeTime", () => {
  it('returns "now" for very recent timestamps', () => {
    expect(relativeTime(Date.now())).toBe("now")
    expect(relativeTime(Date.now() - 4000)).toBe("now")
  })

  it("returns seconds for under a minute", () => {
    expect(relativeTime(Date.now() - 5000)).toBe("5s")
    expect(relativeTime(Date.now() - 30000)).toBe("30s")
  })

  it("returns minutes for under an hour", () => {
    expect(relativeTime(Date.now() - 90000)).toBe("1m")
    expect(relativeTime(Date.now() - 1800000)).toBe("30m")
  })

  it("returns hours for under a day", () => {
    expect(relativeTime(Date.now() - 3600000)).toBe("1h")
    expect(relativeTime(Date.now() - 72000000)).toBe("20h")
  })

  it("returns days for longer periods", () => {
    expect(relativeTime(Date.now() - 90000000)).toBe("1d")
    expect(relativeTime(Date.now() - 259200000)).toBe("3d")
  })
})

function makeEntry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    timestamp: Date.now(),
    request: {
      id: "test-1",
      name: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: {},
    },
    ...over,
  }
}

describe("entryMethod", () => {
  it("returns method from entry", () => {
    expect(entryMethod(makeEntry())).toBe("GET")
    expect(entryMethod(makeEntry({ request: { ...makeEntry().request, method: "POST" } }))).toBe("POST")
  })
})

describe("entryStatus", () => {
  it("returns null when no response and no error", () => {
    expect(entryStatus(makeEntry())).toBeNull()
  })

  it("returns status code from response", () => {
    expect(
      entryStatus(makeEntry({ response: { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 10 } }))
    ).toBe(200)
    expect(
      entryStatus(makeEntry({ response: { status: 404, statusText: "Not Found", headers: {}, body: "", timeMs: 10 } }))
    ).toBe(404)
  })

  it("returns 0 for error entries", () => {
    expect(entryStatus(makeEntry({ error: { message: "timeout" } }))).toBe(0)
  })
})

describe("entryTiming", () => {
  it("returns ms from response", () => {
    expect(
      entryTiming(makeEntry({ response: { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 150 } }))
    ).toBe("150ms")
  })

  it("returns ERR for error entries", () => {
    expect(entryTiming(makeEntry({ error: { message: "timeout" } }))).toBe("ERR")
  })

  it('returns "-" when no response', () => {
    expect(entryTiming(makeEntry())).toBe("-")
  })
})

describe("entryIsError", () => {
  it("returns true when error exists", () => {
    expect(entryIsError(makeEntry({ error: { message: "fail" } }))).toBe(true)
  })

  it("returns false when no error", () => {
    expect(entryIsError(makeEntry())).toBe(false)
    expect(
      entryIsError(makeEntry({ response: { status: 200, statusText: "OK", headers: {}, body: "", timeMs: 10 } }))
    ).toBe(false)
  })
})

describe("buildTimelineEntry", () => {
  it("builds entry from request and done result", () => {
    const req = {
      id: "req-1",
      name: "Test",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: { "content-type": { value: "application/json", enabled: true } },
      params: {},
      body: '{"key":"val"}',
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 201,
        statusText: "Created",
        headers: {},
        body: "",
        timeMs: 42,
      },
      request: req,
      envName: "dev",
    }
    const entry = buildTimelineEntry(req, result, "dev")
    expect(entry.request.method).toBe("POST")
    expect(entry.request.url).toBe("https://api.example.com")
    expect(entry.response?.status).toBe(201)
    expect(entry.response?.timeMs).toBe(42)
    expect(entry.envName).toBe("dev")
  })

  it("uses resolvedUrl when provided", () => {
    const req = {
      id: "req-3",
      name: "Env",
      method: "GET" as const,
      url: "https://api.example.com/$base/path",
      headers: {},
      params: {},
      body: undefined,
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 5,
      },
      request: req,
      envName: "dev",
    }
    const entry = buildTimelineEntry(req, result, "dev", "https://api.example.com/v1/path")
    expect(entry.request.url).toBe("https://api.example.com/v1/path")
  })

  it("builds error entry", () => {
    const req = {
      id: "req-2",
      name: "Fail",
      method: "GET" as const,
      url: "https://down.example.com",
      headers: {},
      params: {},
      body: undefined,
      auth: undefined,
    }
    const result = {
      status: "error" as const,
      error: new Error("Network error"),
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.error).toBeDefined()
    expect(entry.error!.message).toBe("Network error")
    expect(entry.response).toBeUndefined()
  })

  it("truncates request body longer than 10_000 chars", () => {
    const longBody = "x".repeat(15_000)
    const req = {
      id: "req-trunc",
      name: "Trunc",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: {},
      params: {},
      body: longBody,
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 10,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body?.length).toBe(10_000)
    expect(entry.request.body).toBe("x".repeat(10_000))
  })

  it("truncates response body longer than 10_000 chars", () => {
    const longBody = "y".repeat(20_000)
    const req = {
      id: "req-resp-trunc",
      name: "RespTrunc",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: {},
      body: undefined,
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: longBody,
        timeMs: 10,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.response?.body.length).toBe(10_000)
    expect(entry.response?.body).toBe("y".repeat(10_000))
  })

  it("keeps short body unchanged", () => {
    const body = '{"key":"val"}'
    const req = {
      id: "req-short",
      name: "Short",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: {},
      params: {},
      body,
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 201,
        statusText: "Created",
        headers: {},
        body: "",
        timeMs: 5,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBe(body)
  })

  it("keeps empty body as empty string", () => {
    const req = {
      id: "req-empty",
      name: "Empty",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: {},
      body: "",
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 204,
        statusText: "No Content",
        headers: {},
        body: "",
        timeMs: 3,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBe("")
    expect(entry.response?.body).toBe("")
  })

  it("keeps undefined body as undefined", () => {
    const req = {
      id: "req-no-body",
      name: "NoBody",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: {},
      body: undefined,
      auth: undefined,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBeUndefined()
  })
})
