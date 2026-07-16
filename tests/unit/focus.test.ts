import { describe, expect, it } from "bun:test"
import { cycleFocus } from "../../src/ui/focus"

describe("cycleFocus", () => {
  it("moves forward from UrlBar to request pane", () => {
    expect(cycleFocus("urlbar", 1)).toBe("request")
  })

  it("moves backward from UrlBar to sidebar", () => {
    expect(cycleFocus("urlbar", -1)).toBe("sidebar")
  })

  it("skips hidden request pane when response is expanded", () => {
    expect(cycleFocus("urlbar", 1, "main", "response")).toBe("response")
  })

  it("skips hidden response pane when request is expanded", () => {
    expect(cycleFocus("request", 1, "main", "request")).toBe("sidebar")
  })
})
