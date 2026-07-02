import { describe, it, expect } from "bun:test"
import { computeFolderActivity } from "../../src/ui/useFolderActivity"
import type { TimelineEntry, Method } from "../../src/schema"

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    timestamp: Date.now() - 60_000,
    request: {
      id: "user/list",
      name: "List Users",
      method: "GET" as Method,
      url: "https://api.example.com/users",
      headers: {},
      params: {},
    },
    response: {
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 120,
      size: 100,
    },
    ...overrides,
  } as TimelineEntry
}

function makeTimeline(
  requestId: string,
  entries: Partial<TimelineEntry>[],
): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>()
  map.set(
    requestId,
    entries.map((e) =>
      makeEntry({
        ...e,
        request: { ...makeEntry().request, id: requestId },
      }),
    ),
  )
  return map
}

describe("computeFolderActivity", () => {
  it("returns zeroed per-request stats for empty timeline map", () => {
    const result = computeFolderActivity(
      [{ id: "user/list", name: "List Users", method: "GET" }],
      new Map(),
    )
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]!.callCount).toBe(0)
    expect(result.requests[0]!.successRate).toBeNull()
    expect(result.requests[0]!.avgTimeMs).toBeNull()
    expect(result.requests[0]!.lastSent).toBeNull()
  })

  it("computes per-request stats from timeline entries", () => {
    const timeline = makeTimeline("user/list", [
      { response: { ...makeEntry().response!, timeMs: 100, status: 200 } },
      { response: { ...makeEntry().response!, timeMs: 200, status: 200 } },
    ])
    const result = computeFolderActivity(
      [{ id: "user/list", name: "List Users", method: "GET" }],
      timeline,
    )
    const req = result.requests[0]!
    expect(req.callCount).toBe(2)
    expect(req.successRate).toBe(1)
    expect(req.avgTimeMs).toBe(150)
    expect(req.lastSent).toBe(timeline.get("user/list")![0]!.timestamp)
  })

  it("handles error entries (0% success)", () => {
    const timeline = makeTimeline("user/create", [
      { error: { message: "timeout" }, response: undefined },
    ])
    const result = computeFolderActivity(
      [{ id: "user/create", name: "Create User", method: "POST" }],
      timeline,
    )
    expect(result.requests[0]!.successRate).toBe(0)
    expect(result.requests[0]!.callCount).toBe(1)
    expect(result.requests[0]!.avgTimeMs).toBeNull()
  })

  it("handles partial data (some requests have no timeline)", () => {
    const timeline = makeTimeline("user/list", [
      { response: { ...makeEntry().response!, timeMs: 100, status: 200 } },
    ])
    const result = computeFolderActivity(
      [
        { id: "user/list", name: "List Users", method: "GET" },
        { id: "user/delete", name: "Delete User", method: "DELETE" },
      ],
      timeline,
    )
    expect(result.requests[1]!.callCount).toBe(0)
    expect(result.requests[1]!.successRate).toBeNull()
  })

  it("returns empty when no requests in folder", () => {
    const result = computeFolderActivity([], new Map())
    expect(result.requests).toHaveLength(0)
  })
})
