import { describe, it, expect } from "bun:test"
import { getHelpSections } from "../../src/ui/helpTexts"
import { bindingDefaults } from "../../src/ui/keybind"

const defaults = bindingDefaults()

describe("getHelpSections", () => {
  it("returns exactly 5 sections", () => {
    const sections = getHelpSections(defaults)
    expect(sections).toHaveLength(5)
  })

  it("section titles are NAVIGATION, REQUEST EDITING, ACTIONS, SYSTEM, ENV EDITOR", () => {
    const sections = getHelpSections(defaults)
    expect(sections[0]!.title).toBe("Navigation")
    expect(sections[1]!.title).toBe("Request Editing")
    expect(sections[2]!.title).toBe("Actions")
    expect(sections[3]!.title).toBe("System")
    expect(sections[4]!.title).toBe("Env Editor")
  })

  it("each section has at least 1 key entry", () => {
    const sections = getHelpSections(defaults)
    for (const s of sections) {
      expect(s.keys.length).toBeGreaterThan(0)
    }
  })

  it("every key entry has non-empty key and description", () => {
    const sections = getHelpSections(defaults)
    for (const s of sections) {
      for (const k of s.keys) {
        expect(k.key.length).toBeGreaterThan(0)
        expect(k.description.length).toBeGreaterThan(0)
      }
    }
  })

  it("NAVIGATION section shows tab and shift+tab", () => {
    const sections = getHelpSections(defaults)
    const nav = sections.find((s) => s.title === "Navigation")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).toContain("tab")
    expect(keys).toContain("shift+tab")
  })

  it("REQUEST EDITING section shows escape, ^d, space, ^r, ^e, ^t", () => {
    const sections = getHelpSections(defaults)
    const edit = sections.find((s) => s.title === "Request Editing")!
    const keys = edit.keys.map((k) => k.key)
    expect(keys).toContain("escape")
    expect(keys).toContain("^d")
    expect(keys).toContain("space")
    expect(keys).toContain("^r")
    expect(keys).toContain("^e")
    expect(keys).toContain("^t")
  })

  it("ACTIONS section shows ^return, ^s, ^n, ^k, ^w, ^alt+p, ^l", () => {
    const sections = getHelpSections(defaults)
    const act = sections.find((s) => s.title === "Actions")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("^return")
    expect(keys).toContain("^s")
    expect(keys).toContain("^n")
    expect(keys).toContain("^k")
    expect(keys).toContain("^w")
    expect(keys).toContain("^alt+p")
    expect(keys).toContain("^l")
  })

  it("SYSTEM section contains ^c and f1", () => {
    const sections = getHelpSections(defaults)
    const sys = sections.find((s) => s.title === "System")!
    const keys = sys.keys.map((k) => k.key)
    expect(keys).toContain("^c")
    expect(keys).toContain("f1")
  })

  it("reflects custom keybinds", () => {
    const custom = { ...defaults, request_send: "ctrl+s", help_toggle: "f1" }
    const sections = getHelpSections(custom)
    const act = sections.find((s) => s.title === "Actions")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("^s")

    const sys = sections.find((s) => s.title === "System")!
    const sysKeys = sys.keys.map((k) => k.key)
    expect(sysKeys).toContain("f1")
  })
})
