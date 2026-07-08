import { describe, it, expect } from "bun:test"
import type { Request } from "../../src/schema"

function makeRequest(id: string): Request {
  return {
    id,
    name: id,
    method: "GET",
    url: "https://example.com/" + id,
    headers: {},
    params: [],
    timeout: 0,
  }
}

function clampBase(prev: number, len: number): number {
  return len === 0 ? -1 : Math.min(Math.max(prev, 0), len - 1)
}

function computeResult(requests: Request[], idx: number) {
  const clamped =
    requests.length === 0 ? -1 : Math.min(idx, requests.length - 1)
  return {
    selectedIndex: clamped,
    selectedRequest: clamped >= 0 ? requests[clamped] : null,
  }
}

describe("useSidebarSelection", () => {
  const requests = [makeRequest("a"), makeRequest("b"), makeRequest("c")]

  it("defaults to index 0", () => {
    const result = computeResult(requests, 0)
    expect(result.selectedIndex).toBe(0)
    expect(result.selectedRequest?.id).toBe("a")
  })

  it("setSelectedIndex clamps and selects", () => {
    const result = computeResult(requests, clampBase(2, requests.length))
    expect(result.selectedIndex).toBe(2)
    expect(result.selectedRequest?.id).toBe("c")
  })

  it("setSelectedIndex clamps out of range high", () => {
    const result = computeResult(requests, clampBase(99, requests.length))
    expect(result.selectedIndex).toBe(2)
    expect(result.selectedRequest?.id).toBe("c")
  })

  it("returns index -1 for empty requests array", () => {
    const result = computeResult([], 0)
    expect(result.selectedIndex).toBe(-1)
    expect(result.selectedRequest).toBeNull()
  })

  it("clamps to -1 for empty requests even with high index", () => {
    const result = computeResult([], clampBase(5, 0))
    expect(result.selectedIndex).toBe(-1)
    expect(result.selectedRequest).toBeNull()
  })
})
