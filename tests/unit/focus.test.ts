import { describe, expect, it } from "bun:test"
import { cycleFocus, settingsReturnFocus } from "../../src/ui/focus"

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

  it("cycles between settings panes", () => {
    expect(cycleFocus("settings-sidebar", 1, "settings")).toBe(
      "settings-content",
    )
    expect(cycleFocus("settings-content", 1, "settings")).toBe(
      "settings-sidebar",
    )
  })
})

describe("settingsReturnFocus", () => {
  it("restores the pane that opened settings from the main view", () => {
    for (const focus of [
      "sidebar",
      "urlbar",
      "request",
      "response",
      "folder",
    ] as const) {
      expect(settingsReturnFocus("main", focus)).toBe(focus)
    }
  })

  it("falls back to the main sidebar outside the main view", () => {
    expect(settingsReturnFocus("env-editor", "env-vars")).toBe("sidebar")
    expect(settingsReturnFocus("settings", "settings-content")).toBe("sidebar")
  })
})
