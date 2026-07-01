import { describe, it, expect } from "bun:test"
import { cycleFocus } from "../../src/ui/focus"

describe("cycleFocus — forward (delta +1)", () => {
  it("sidebar → urlbar", () => {
    expect(cycleFocus("sidebar", 1)).toBe("urlbar")
  })

  it("urlbar → request", () => {
    expect(cycleFocus("urlbar", 1)).toBe("request")
  })

  it("request → response", () => {
    expect(cycleFocus("request", 1)).toBe("response")
  })

  it("response → sidebar (wrap)", () => {
    expect(cycleFocus("response", 1)).toBe("sidebar")
  })
})

describe("cycleFocus — reverse (delta -1)", () => {
  it("sidebar → response (reverse wrap)", () => {
    expect(cycleFocus("sidebar", -1)).toBe("response")
  })

  it("response → request", () => {
    expect(cycleFocus("response", -1)).toBe("request")
  })

  it("request → urlbar", () => {
    expect(cycleFocus("request", -1)).toBe("urlbar")
  })

  it("urlbar → sidebar (reverse wrap)", () => {
    expect(cycleFocus("urlbar", -1)).toBe("sidebar")
  })
})

describe("cycleFocus — round-trip", () => {
  it("forward wraps through all 4", () => {
    let f = cycleFocus("sidebar", 1)
    expect(f).toBe("urlbar")
    f = cycleFocus(f, 1)
    expect(f).toBe("request")
    f = cycleFocus(f, 1)
    expect(f).toBe("response")
    f = cycleFocus(f, 1)
    expect(f).toBe("sidebar")
  })

  it("reverse wraps through all 4", () => {
    let f = cycleFocus("sidebar", -1)
    expect(f).toBe("response")
    f = cycleFocus(f, -1)
    expect(f).toBe("request")
    f = cycleFocus(f, -1)
    expect(f).toBe("urlbar")
    f = cycleFocus(f, -1)
    expect(f).toBe("sidebar")
  })
})

describe("cycleFocus — expanded pane (skip hidden)", () => {
  describe("expanded = request (response hidden)", () => {
    it("forward from request skips response → sidebar", () => {
      expect(cycleFocus("request", 1, "main", "request")).toBe("sidebar")
    })

    it("backward from sidebar skips response → request", () => {
      expect(cycleFocus("sidebar", -1, "main", "request")).toBe("request")
    })

    it("forward from urlbar goes to request (not hidden)", () => {
      expect(cycleFocus("urlbar", 1, "main", "request")).toBe("request")
    })

    it("backward from request goes to urlbar (not hidden)", () => {
      expect(cycleFocus("request", -1, "main", "request")).toBe("urlbar")
    })
  })

  describe("expanded = response (request hidden)", () => {
    it("forward from urlbar skips request → response", () => {
      expect(cycleFocus("urlbar", 1, "main", "response")).toBe("response")
    })

    it("backward from response skips request → urlbar", () => {
      expect(cycleFocus("response", -1, "main", "response")).toBe("urlbar")
    })

    it("forward from response goes to sidebar (not hidden)", () => {
      expect(cycleFocus("response", 1, "main", "response")).toBe("sidebar")
    })

    it("backward from sidebar goes to response (not hidden)", () => {
      expect(cycleFocus("sidebar", -1, "main", "response")).toBe("response")
    })
  })

  describe("expanded = null (normal cycling, no skip)", () => {
    it("forward from request → response", () => {
      expect(cycleFocus("request", 1, "main", null)).toBe("response")
    })

    it("backward from response → request", () => {
      expect(cycleFocus("response", -1, "main", null)).toBe("request")
    })
  })

  describe("expanded ignored in env-editor view", () => {
    it("forward in env-editor ignores expanded", () => {
      expect(cycleFocus("env-sidebar", 1, "env-editor", "request")).toBe(
        "env-header",
      )
    })
  })
})
