import { describe, it, expect } from "bun:test"
import { getHelpSections } from "../../src/ui/helpTexts"
import { bindingDefaults } from "../../src/ui/keybind"

const defaults = bindingDefaults()

describe("getHelpSections", () => {
  it("returns exactly 4 sections", () => {
    const sections = getHelpSections(defaults)
    expect(sections).toHaveLength(4)
  })

  it("section titles are NAVIGATION, EDITING, ACTIONS, SYSTEM", () => {
    const sections = getHelpSections(defaults)
    expect(sections[0]!.title).toBe("Navigation")
    expect(sections[1]!.title).toBe("Editing")
    expect(sections[2]!.title).toBe("Actions")
    expect(sections[3]!.title).toBe("System")
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

  it("EDITING section shows return, escape, ^d, ^x, ^r, ^e", () => {
    const sections = getHelpSections(defaults)
    const edit = sections.find((s) => s.title === "Editing")!
    const keys = edit.keys.map((k) => k.key)
    expect(keys).toContain("return")
    expect(keys).toContain("escape")
    expect(keys).toContain("^d")
    expect(keys).toContain("^x")
    expect(keys).toContain("^r")
    expect(keys).toContain("^e")
  })

  it("ACTIONS section shows ^return, ^s, ^[, ^l, ^.", () => {
    const sections = getHelpSections(defaults)
    const act = sections.find((s) => s.title === "Actions")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("^return")
    expect(keys).toContain("^s")
    expect(keys).toContain("^[")
    expect(keys).toContain("^l")
    expect(keys).toContain("^.")
  })

  it("SYSTEM section contains ^c and f1", () => {
    const sections = getHelpSections(defaults)
    const sys = sections.find((s) => s.title === "System")!
    const keys = sys.keys.map((k) => k.key)
    expect(keys).toContain("^c")
    expect(keys).toContain("f1")
  })

  it("NAVIGATION section contains return for edit-enter", () => {
    const sections = getHelpSections(defaults)
    const nav = sections.find((s) => s.title === "Navigation")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).toContain("return")
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
