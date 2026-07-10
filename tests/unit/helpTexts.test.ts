import { describe, it, expect } from "bun:test"
import { getHelpSections } from "../../src/ui/helpTexts"
import { bindingDefaults } from "../../src/ui/keybind"

const defaults = bindingDefaults()

describe("getHelpSections", () => {
  it("returns exactly 6 sections", () => {
    const sections = getHelpSections(defaults)
    expect(sections).toHaveLength(6)
  })

  it("section titles are NAVIGATION, REQUEST EDITING, CODE EDITOR, ACTIONS, SYSTEM, ENV EDITOR", () => {
    const sections = getHelpSections(defaults)
    expect(sections[0]!.title).toBe("Navigation")
    expect(sections[1]!.title).toBe("Request Editing")
    expect(sections[2]!.title).toBe("Code Editor")
    expect(sections[3]!.title).toBe("Actions")
    expect(sections[4]!.title).toBe("System")
    expect(sections[5]!.title).toBe("Env Editor")
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

  it("CODE EDITOR section shows ^g, f5, and f6", () => {
    const sections = getHelpSections(defaults)
    const editor = sections.find((s) => s.title === "Code Editor")!
    const keys = editor.keys.map((k) => k.key)
    expect(keys).toContain("^g")
    expect(keys).toContain("f5")
    expect(keys).toContain("f6")
  })

  it("ACTIONS section shows ^return / ^j, ^s, ^n, ^k, ^w, ^shift+p, ^l", () => {
    const sections = getHelpSections(defaults)
    const act = sections.find((s) => s.title === "Actions")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("^return / ^j")
    expect(keys).toContain("^s")
    expect(keys).toContain("^n")
    expect(keys).toContain("^k")
    expect(keys).toContain("^w")
    expect(keys).toContain("^u")
    expect(keys).toContain("^l")
  })

  it("SYSTEM section contains ^c, f1, command palette, and collection switcher bindings", () => {
    const sections = getHelpSections(defaults)
    const sys = sections.find((s) => s.title === "System")!
    const keys = sys.keys.map((k) => k.key)
    expect(keys).toContain("^c")
    expect(keys).toContain("f1")
    expect(keys).toContain("^p")
    expect(keys).toContain("^o")
  })

  it("reflects custom keybinds", () => {
    const custom = { ...defaults, request_save: "ctrl+x", help_toggle: "f1" }
    const sections = getHelpSections(custom)
    const act = sections.find((s) => s.title === "Actions")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("^x")

    const sys = sections.find((s) => s.title === "System")!
    const sysKeys = sys.keys.map((k) => k.key)
    expect(sysKeys).toContain("f1")
  })
})
