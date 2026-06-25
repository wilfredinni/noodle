import { describe, it, expect } from "bun:test"
import { hintForFocus } from "../../src/ui/focus"

describe("hintForFocus — sidebar", () => {
  it("when sidebar focused (any mode)", () => {
    const hint = hintForFocus("sidebar", "inactive")
    expect(hint).toContain("select")
    expect(hint).toContain("edit")
    expect(hint).toContain("send")
    expect(hint).toContain("save")
    expect(hint).toContain("Tab")
    expect(hint).toContain("URL Bar")
  })
})

describe("hintForFocus — urlbar", () => {
  it("shows Tab to Request", () => {
    const hint = hintForFocus("urlbar", "inactive")
    expect(hint).toContain("Tab")
    expect(hint).toContain("Request")
  })
})

describe("hintForFocus — request inactive", () => {
  it("shows enter edit, send, save, Tab", () => {
    const hint = hintForFocus("request", "inactive")
    expect(hint).toContain("enter edit")
    expect(hint).toContain("send")
    expect(hint).toContain("save")
    expect(hint).toContain("Response")
  })
})

describe("hintForFocus — request browsing", () => {
  it("shows edit, revert, Esc, Tab", () => {
    const hint = hintForFocus("request", "browsing")
    expect(hint).toContain("edit")
    expect(hint).toContain("revert")
    expect(hint).toContain("Esc")
    expect(hint).toContain("Response")
  })
})

describe("hintForFocus — request editing", () => {
  it("shows commit and cancel", () => {
    const hint = hintForFocus("request", "editing")
    expect(hint).toContain("commit")
    expect(hint).toContain("cancel")
  })
})

describe("hintForFocus — response", () => {
  it("shows Tab → Sidebar and scroll keys (↑/↓/PgUp/PgDn)", () => {
    const hint = hintForFocus("response", "inactive")
    expect(hint).toContain("↑")
    expect(hint).toContain("↓")
    expect(hint).toContain("PgUp")
    expect(hint).toContain("PgDn")
    expect(hint).toContain("Tab")
    expect(hint).toContain("Sidebar")
  })
})

describe("hintForFocus — theme picker hint", () => {
  it("sidebar hint includes [t] pick theme", () => {
    expect(hintForFocus("sidebar", "inactive")).toContain("[t] pick theme")
  })

  it("urlbar hint includes [t] pick theme", () => {
    expect(hintForFocus("urlbar", "inactive")).toContain("[t] pick theme")
  })

  it("request hint includes [t] pick theme", () => {
    expect(hintForFocus("request", "inactive")).toContain("[t] pick theme")
  })

  it("response hint includes [t] pick theme", () => {
    expect(hintForFocus("response", "inactive")).toContain("[t] pick theme")
  })
})

describe("hintForFocus — sidebar is mode-independent", () => {
  it("same hint for all modes when sidebar focused", () => {
    const a = hintForFocus("sidebar", "inactive")
    const b = hintForFocus("sidebar", "browsing")
    const c = hintForFocus("sidebar", "editing")
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

describe("hintForFocus — response is mode-independent", () => {
  it("same hint for all modes when response focused", () => {
    const a = hintForFocus("response", "inactive")
    const b = hintForFocus("response", "browsing")
    const c = hintForFocus("response", "editing")
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})
