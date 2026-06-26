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
    expect(sections[0]!.title).toBe("NAVIGATION")
    expect(sections[1]!.title).toBe("EDITING")
    expect(sections[2]!.title).toBe("ACTIONS")
    expect(sections[3]!.title).toBe("SYSTEM")
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

  it("NAVIGATION section shows Tab and Shift+Tab", () => {
    const sections = getHelpSections(defaults)
    const nav = sections.find((s) => s.title === "NAVIGATION")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).toContain("[tab]")
    expect(keys).toContain("[shift+tab]")
  })

  it("EDITING section shows enter, escape, d, R", () => {
    const sections = getHelpSections(defaults)
    const edit = sections.find((s) => s.title === "EDITING")!
    const keys = edit.keys.map((k) => k.key)
    expect(keys).toContain("[return]")
    expect(keys).toContain("[escape]")
    expect(keys).toContain("[d]")
    expect(keys).toContain("[R]")
  })

  it("ACTIONS section shows s, w, [, ], layout", () => {
    const sections = getHelpSections(defaults)
    const act = sections.find((s) => s.title === "ACTIONS")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("[s]")
    expect(keys).toContain("[w]")
    expect(keys).toContain("[[ ]")
    expect(keys).toContain("[] ]")
    expect(keys).toContain("[l]")
  })

  it("SYSTEM section contains Ctrl+C and ?", () => {
    const sections = getHelpSections(defaults)
    const sys = sections.find((s) => s.title === "SYSTEM")!
    const keys = sys.keys.map((k) => k.key)
    expect(keys).toContain("[Ctrl+C]")
    expect(keys).toContain("[?]")
  })

  it("NAVIGATION section does not contain [e]", () => {
    const sections = getHelpSections(defaults)
    const nav = sections.find((s) => s.title === "NAVIGATION")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).not.toContain("[e]")
    expect(keys).toContain("[return]")
  })

  it("reflects custom keybinds", () => {
    const custom = { ...defaults, request_send: "ctrl+s", help_toggle: "f1" }
    const sections = getHelpSections(custom)
    const act = sections.find((s) => s.title === "ACTIONS")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("[ctrl+s]")

    const sys = sections.find((s) => s.title === "SYSTEM")!
    const sysKeys = sys.keys.map((k) => k.key)
    expect(sysKeys).toContain("[f1]")
  })
})
