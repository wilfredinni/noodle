import { describe, it, expect } from "bun:test"
import type { Request } from "../../src/schema"

function makeRequest(id: string): Request {
  return {
    id,
    name: id,
    method: "GET",
    url: "https://example.com/" + id,
    headers: {},
    params: {},
  } as Request
}

function callHook(
  requests: Request[],
  _enabled: () => boolean = () => true,
  initialIndex?: number,
) {
  const stateValue = initialIndex ?? 0
  const clamped =
    requests.length === 0 ? -1 : Math.min(stateValue, requests.length - 1)
  return {
    selectedIndex: clamped,
    selectedRequest: clamped >= 0 ? requests[clamped] : null,
  }
}

describe("useSidebarSelection initialIndex", () => {
  const requests = [makeRequest("a"), makeRequest("b"), makeRequest("c")]

  it("defaults to index 0 when no initialIndex", () => {
    const result = callHook(requests)
    expect(result.selectedIndex).toBe(0)
    expect(result.selectedRequest?.id).toBe("a")
  })

  it("uses initialIndex when provided", () => {
    const result = callHook(requests, undefined, 2)
    expect(result.selectedIndex).toBe(2)
    expect(result.selectedRequest?.id).toBe("c")
  })

  it("clamps initialIndex out of range high", () => {
    const result = callHook(requests, undefined, 99)
    expect(result.selectedIndex).toBe(2)
    expect(result.selectedRequest?.id).toBe("c")
  })

  it("returns index -1 for empty requests array", () => {
    const result = callHook([], undefined, 0)
    expect(result.selectedIndex).toBe(-1)
    expect(result.selectedRequest).toBeNull()
  })

  it("returns index -1 for empty requests even with initialIndex", () => {
    const result = callHook([], undefined, 5)
    expect(result.selectedIndex).toBe(-1)
    expect(result.selectedRequest).toBeNull()
  })
})
