import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadTimeline,
  loadTimelineBody,
  saveTimelineEntry,
  pruneTimeline,
  clearTimelineForRequest,
  clearAllTimeline,
  redactTimelineSecrets,
} from "../src/filestore/timeline"
import type { TimelineEntry } from "../src/schema"

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "noodle-tl-"))
})

describe("redactTimelineSecrets", () => {
  it("redacts request history without rewriting compressed response bodies", async () => {
    const secret = "super-secret-value"
    await saveTimelineEntry(
      dir,
      "redact",
      makeEntry({
        request: {
          ...makeEntry().request,
          url: `https://example.com?token=${secret}`,
        },
        assertions: {
          evaluated: true,
          results: [
            {
              expression: "body.token",
              operator: "equals",
              expected: secret,
              actual: secret,
              passed: false,
              message: `Expected ${secret}`,
            },
          ],
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: { "x-result": secret },
          body: `${"x".repeat(10_100)}${secret}`,
          timeMs: 1,
          size: 10_100 + secret.length,
        },
      }),
    )

    await redactTimelineSecrets(dir, [secret])
    const [entry] = await loadTimeline(dir, "redact")
    expect(entry!.request.url).toContain("[REDACTED]")
    expect(entry!.assertions?.results[0]?.expected).toBe("[REDACTED]")
    expect(entry!.assertions?.results[0]?.actual).toBe("[REDACTED]")
    expect(entry!.assertions?.results[0]?.message).toBe("Expected [REDACTED]")
    expect(entry!.response!.headers["x-result"]).toBe(secret)
    const body = await loadTimelineBody(
      dir,
      "redact",
      entry!.response!.bodyRef!,
    )
    expect(body).toContain(secret)
    expect(body).not.toContain("[REDACTED]")
  })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function makeEntry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    timestamp: Date.now(),
    request: {
      id: "req-1",
      name: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: [],
    },
    ...over,
  }
}

describe("loadTimeline", () => {
  it("returns empty array when no timeline file exists", async () => {
    const result = await loadTimeline(dir, "req-1")
    expect(result).toEqual([])
  })

  it("returns entries from existing timeline file", async () => {
    const entry = makeEntry({ timestamp: 1000 })
    await saveTimelineEntry(dir, "req-id", entry)
    const result = await loadTimeline(dir, "req-id")
    expect(result).toHaveLength(1)
    expect(result[0].timestamp).toBe(1000)
    expect(result[0].request.method).toBe("GET")
  })

  it("returns multiple entries in newest-first order", async () => {
    await saveTimelineEntry(dir, "req-id", makeEntry({ timestamp: 100 }))
    await saveTimelineEntry(dir, "req-id", makeEntry({ timestamp: 200 }))
    await saveTimelineEntry(dir, "req-id", makeEntry({ timestamp: 300 }))
    const result = await loadTimeline(dir, "req-id")
    expect(result.map((e) => e.timestamp)).toEqual([300, 200, 100])
  })

  it("returns empty array for unparseable YAML", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    await mkdir(join(dir, ".timeline"), { recursive: true })
    await writeFile(join(dir, ".timeline", "bad.yml"), "{: invalid", "utf8")
    expect(loadTimeline(dir, "bad")).rejects.toThrow(
      "filestore.loadTimeline: failed to load timeline",
    )
  })

  it("migrates legacy object-form params", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(join(dir, ".timeline"), { recursive: true })
    await writeFile(
      join(dir, ".timeline", "legacy.yml"),
      `- timestamp: 1\n  request:\n    id: legacy\n    name: Legacy\n    method: GET\n    url: https://example.com\n    headers: {}\n    params:\n      q: hello\n      disabled:\n        value: no\n        enabled: false\n      count: 42\n`,
      "utf8",
    )

    const result = await loadTimeline(dir, "legacy")
    expect(result[0]?.request.params).toEqual([
      { name: "q", value: "hello", enabled: true },
      { name: "disabled", value: "no", enabled: false },
    ])
  })

  it("preserves array-form params during migration", async () => {
    const entry = makeEntry({
      request: {
        ...makeEntry().request,
        params: [{ name: "q", value: "hello", enabled: true }],
      },
    })
    await saveTimelineEntry(dir, "array", entry)

    const result = await loadTimeline(dir, "array")
    expect(result[0]?.request.params).toEqual(entry.request.params)
  })

  it("keeps an exact 10KB legacy request body available", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const body = "x".repeat(10_000)
    await mkdir(join(dir, ".timeline"), { recursive: true })
    await writeFile(
      join(dir, ".timeline", "legacy-full.yml"),
      `- timestamp: 1\n  request:\n    id: legacy\n    name: Legacy\n    method: GET\n    url: https://example.com\n    headers: {}\n    params: []\n    body: ${body}\n`,
      "utf8",
    )

    const result = await loadTimeline(dir, "legacy-full")
    expect(result[0]?.request.body).toBe(body)
    expect(result[0]?.request.bodyTruncated).toBeUndefined()
  })
})

describe("saveTimelineEntry", () => {
  it("stores bodies larger than 10KB in compressed sidecars", async () => {
    const requestBody = "request-".repeat(2_000)
    const responseBody = JSON.stringify({ data: "response-".repeat(2_000) })
    const entry = makeEntry({
      request: { ...makeEntry().request, body: requestBody },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: responseBody,
        timeMs: 1,
        size: new TextEncoder().encode(responseBody).length,
      },
    })

    const persisted = await saveTimelineEntry(dir, "large", entry)
    expect(persisted.request.body).toBeUndefined()
    expect(persisted.request.bodyRef).toBeDefined()
    expect(persisted.response?.body).toBeUndefined()
    expect(persisted.response?.bodyRef).toBeDefined()

    const loaded = await loadTimeline(dir, "large")
    expect(
      await loadTimelineBody(dir, "large", loaded[0]!.request.bodyRef!),
    ).toBe(requestBody)
    expect(
      await loadTimelineBody(dir, "large", loaded[0]!.response!.bodyRef!),
    ).toBe(responseBody)
  })

  it("truncates assertion values larger than 10KB", async () => {
    const value = { payload: "x".repeat(10_001) }
    const entry = makeEntry({
      assertions: {
        evaluated: true,
        results: [
          {
            expression: "body",
            operator: "equals",
            expected: value,
            actual: value,
            passed: true,
            message: "Assertion passed",
          },
        ],
      },
    })

    const persisted = await saveTimelineEntry(dir, "large-assertion", entry)

    expect(persisted.assertions?.results[0]?.expected).toBe("[TRUNCATED]")
    expect(persisted.assertions?.results[0]?.actual).toBe("[TRUNCATED]")
    expect(entry.assertions?.results[0]?.actual).toEqual(value)
    expect(
      await readFile(join(dir, ".timeline", "large-assertion.yml"), "utf8"),
    ).not.toContain(value.payload)
  })

  it("creates .timeline dir and writes YAML file", async () => {
    const entry = makeEntry({ timestamp: 42 })
    await saveTimelineEntry(dir, "req-a", entry)
    const filePath = join(dir, ".timeline", "req-a.yml")
    const content = await readFile(filePath, "utf8")
    expect(content).toContain("timestamp: 42")
    expect(content).toContain("method: GET")
  })

  it("self-heals a corrupt timeline file on save", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises")
    await mkdir(join(dir, ".timeline"), { recursive: true })
    await writeFile(join(dir, ".timeline", "corrupt.yml"), "{: invalid", "utf8")

    await saveTimelineEntry(dir, "corrupt", makeEntry({ timestamp: 42 }))

    const result = await loadTimeline(dir, "corrupt")
    expect(result).toHaveLength(1)
    expect(result[0]?.timestamp).toBe(42)
  })

  it("appends new entry as first in list (newest first)", async () => {
    await saveTimelineEntry(dir, "req-1", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "req-1", makeEntry({ timestamp: 2 }))
    const result = await loadTimeline(dir, "req-1")
    expect(result).toHaveLength(2)
    expect(result[0].timestamp).toBe(2)
    expect(result[1].timestamp).toBe(1)
  })

  it("caps entries at maxEntries", async () => {
    for (let i = 0; i < 10; i++) {
      await saveTimelineEntry(dir, "req-cap", makeEntry({ timestamp: i }), 3)
    }
    const result = await loadTimeline(dir, "req-cap")
    expect(result).toHaveLength(3)
    expect(result[0].timestamp).toBe(9)
    expect(result[1].timestamp).toBe(8)
    expect(result[2].timestamp).toBe(7)
  })

  it("removes sidecars for entries evicted by retention", async () => {
    const body = "x".repeat(12_000)
    const first = await saveTimelineEntry(
      dir,
      "evict",
      makeEntry({ request: { ...makeEntry().request, body } }),
      1,
    )
    await saveTimelineEntry(dir, "evict", makeEntry({ timestamp: 2 }), 1)
    expect(
      loadTimelineBody(dir, "evict", first.request.bodyRef!),
    ).rejects.toThrow()
  })

  it("uses default max of 50 when not specified", async () => {
    for (let i = 0; i < 60; i++) {
      await saveTimelineEntry(dir, "req-cap50", makeEntry({ timestamp: i }))
    }
    const result = await loadTimeline(dir, "req-cap50")
    expect(result).toHaveLength(50)
    expect(result[0].timestamp).toBe(59)
    expect(result[49].timestamp).toBe(10)
  })

  it("serializes saves with retention pruning", async () => {
    await saveTimelineEntry(dir, "racing", makeEntry({ timestamp: 1 }), 10)
    await saveTimelineEntry(dir, "racing", makeEntry({ timestamp: 2 }), 10)
    const completedBody = "completed-".repeat(2_000)

    await Promise.all([
      saveTimelineEntry(
        dir,
        "racing",
        makeEntry({
          timestamp: 3,
          request: { ...makeEntry().request, body: completedBody },
        }),
        10,
      ),
      pruneTimeline(dir, 1),
    ])

    const result = await loadTimeline(dir, "racing")
    expect(result.map((entry) => entry.timestamp)).toEqual([3])
    expect(result[0]?.request.bodyRef).toBeDefined()
    await expect(
      loadTimelineBody(dir, "racing", result[0]!.request.bodyRef!),
    ).resolves.toBe(completedBody)
  })

  it("persists full entry data including response and error", async () => {
    const entry = makeEntry({
      timestamp: 500,
      envName: "dev",
      request: {
        id: "full",
        name: "Full test",
        method: "POST",
        url: "https://api.example.com/data",
        headers: {
          "content-type": { value: "application/json", enabled: true },
        },
        params: [{ name: "q", value: "test", enabled: true }],
        body: '{"key":"val"}',
        auth: { type: "bearer", token: "tok" },
      },
      response: {
        status: 201,
        statusText: "Created",
        headers: { "x-request-id": "abc" },
        body: '{"id":1}',
        timeMs: 42,
        size: 11,
      },
    })
    await saveTimelineEntry(dir, "full", entry)
    const result = await loadTimeline(dir, "full")
    expect(result).toHaveLength(1)
    expect(result[0].envName).toBe("dev")
    expect(result[0].response?.status).toBe(201)
    expect(result[0].response?.timeMs).toBe(42)
    expect(result[0].response?.body).toBe('{"id":1}')
    expect(result[0].request.auth).toEqual({ type: "bearer", token: "tok" })
  })

  it("persists error entry", async () => {
    const entry = makeEntry({
      timestamp: 999,
      error: { message: "Connection refused" },
    })
    await saveTimelineEntry(dir, "err", entry)
    const result = await loadTimeline(dir, "err")
    expect(result).toHaveLength(1)
    expect(result[0].error?.message).toBe("Connection refused")
    expect(result[0].response).toBeUndefined()
  })

  it("persists network activity", async () => {
    const network = [
      {
        timeMs: 0,
        type: "request" as const,
        message: "GET https://example.com",
      },
      { timeMs: 5, type: "complete" as const, message: "Completed in 5ms" },
    ]
    await saveTimelineEntry(
      dir,
      "network",
      makeEntry({
        network,
      }),
    )
    const result = await loadTimeline(dir, "network")
    expect(result[0]?.network).toEqual(network)
  })

  it("isolates entries per request id", async () => {
    await saveTimelineEntry(dir, "req-a", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "req-b", makeEntry({ timestamp: 2 }))
    const a = await loadTimeline(dir, "req-a")
    const b = await loadTimeline(dir, "req-b")
    expect(a).toHaveLength(1)
    expect(a[0].timestamp).toBe(1)
    expect(b).toHaveLength(1)
    expect(b[0].timestamp).toBe(2)
  })
})

describe("pruneTimeline", () => {
  it("prunes nested request histories and removes evicted sidecars", async () => {
    const body = "x".repeat(12_000)
    const evicted = await saveTimelineEntry(
      dir,
      "folder/request",
      makeEntry({
        timestamp: 1,
        request: { ...makeEntry().request, body },
      }),
      10,
    )
    await saveTimelineEntry(
      dir,
      "folder/request",
      makeEntry({ timestamp: 2 }),
      10,
    )

    await pruneTimeline(dir, 1)

    expect(
      (await loadTimeline(dir, "folder/request")).map(
        (entry) => entry.timestamp,
      ),
    ).toEqual([2])
    await expect(
      loadTimelineBody(dir, "folder/request", evicted.request.bodyRef!),
    ).rejects.toThrow()
  })

  it("clears all history when retention is zero", async () => {
    await saveTimelineEntry(dir, "one", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "folder/two", makeEntry({ timestamp: 2 }))

    await pruneTimeline(dir, 0)

    expect(await loadTimeline(dir, "one")).toEqual([])
    expect(await loadTimeline(dir, "folder/two")).toEqual([])
  })

  it("does nothing when the timeline directory does not exist", async () => {
    await pruneTimeline(dir, 5)
    expect(await loadTimeline(dir, "missing")).toEqual([])
  })

  it("rejects invalid retention limits", async () => {
    await expect(pruneTimeline(dir, -1)).rejects.toThrow(
      "max entries must be a non-negative integer",
    )
  })
})

describe("clearTimelineForRequest", () => {
  it("clears entries leaving empty array in YAML", async () => {
    await saveTimelineEntry(dir, "req-clr", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "req-clr", makeEntry({ timestamp: 2 }))
    await clearTimelineForRequest(dir, "req-clr")
    const result = await loadTimeline(dir, "req-clr")
    expect(result).toEqual([])
  })

  it("does not affect other request timelines", async () => {
    await saveTimelineEntry(dir, "keep", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "clear", makeEntry({ timestamp: 2 }))
    await clearTimelineForRequest(dir, "clear")
    const keep = await loadTimeline(dir, "keep")
    expect(keep).toHaveLength(1)
  })

  it("no-op when no timeline file exists", async () => {
    await clearTimelineForRequest(dir, "nonexistent")
    const result = await loadTimeline(dir, "nonexistent")
    expect(result).toEqual([])
  })
})

describe("clearAllTimeline", () => {
  it("clears all per-request timeline files", async () => {
    await saveTimelineEntry(dir, "req-a", makeEntry({ timestamp: 1 }))
    await saveTimelineEntry(dir, "req-b", makeEntry({ timestamp: 2 }))
    await clearAllTimeline(dir)
    const a = await loadTimeline(dir, "req-a")
    const b = await loadTimeline(dir, "req-b")
    expect(a).toEqual([])
    expect(b).toEqual([])
  })

  it("no-op when .timeline directory does not exist", async () => {
    await clearAllTimeline(dir)
    // should not throw
  })
})
