import { describe, it, expect } from "bun:test"
import { cycleFocus } from "../../src/ui/focus"

describe("cycleFocus — forward (delta +1)", () => {
  it("sidebar → url", () => {
    expect(cycleFocus("sidebar", 1)).toBe("url")
  })

  it("url → request", () => {
    expect(cycleFocus("url", 1)).toBe("request")
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

  it("request → url", () => {
    expect(cycleFocus("request", -1)).toBe("url")
  })

  it("url → sidebar", () => {
    expect(cycleFocus("url", -1)).toBe("sidebar")
  })
})

describe("cycleFocus — round-trip", () => {
  it("forward wraps through all 4", () => {
    let f = cycleFocus("sidebar", 1)
    expect(f).toBe("url")
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
    expect(f).toBe("url")
    f = cycleFocus(f, -1)
    expect(f).toBe("sidebar")
  })
})
