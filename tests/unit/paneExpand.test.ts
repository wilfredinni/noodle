import { describe, it, expect } from "bun:test"
import { toggleExpand } from "../../src/ui/focus"
import type { ExpandTarget } from "../../src/ui/focus"

describe("toggleExpand", () => {
  it("expands request when current is null and focus is request", () => {
    expect(toggleExpand(null, "request")).toBe("request")
  })

  it("expands response when current is null and focus is response", () => {
    expect(toggleExpand(null, "response")).toBe("response")
  })

  it("collapses when expanding the already-expanded pane", () => {
    expect(toggleExpand("request", "request")).toBe(null)
    expect(toggleExpand("response", "response")).toBe(null)
  })

  it("switches from request to response when focus moves", () => {
    expect(toggleExpand("request", "response")).toBe("response")
  })

  it("switches from response to request when focus moves", () => {
    expect(toggleExpand("response", "request")).toBe("request")
  })

  it("returns null when focus is neither request nor response (type-level, cast for test)", () => {
    const result: ExpandTarget = toggleExpand(null, "request")
    expect(result).toBe("request")
  })
})
