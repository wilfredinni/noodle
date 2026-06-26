import { describe, it, expect } from "bun:test"
import { getHelpSections } from "../../src/ui/helpTexts"

describe("getHelpSections", () => {
  it("returns exactly 4 sections", () => {
    const sections = getHelpSections()
    expect(sections).toHaveLength(4)
  })

  it("section titles are NAVIGATION, EDITING, ACTIONS, SYSTEM", () => {
    const sections = getHelpSections()
    expect(sections[0]!.title).toBe("NAVIGATION")
    expect(sections[1]!.title).toBe("EDITING")
    expect(sections[2]!.title).toBe("ACTIONS")
    expect(sections[3]!.title).toBe("SYSTEM")
  })

  it("each section has at least 1 key entry", () => {
    const sections = getHelpSections()
    for (const s of sections) {
      expect(s.keys.length).toBeGreaterThan(0)
    }
  })

  it("every key entry has non-empty key and description", () => {
    const sections = getHelpSections()
    for (const s of sections) {
      for (const k of s.keys) {
        expect(k.key.length).toBeGreaterThan(0)
        expect(k.description.length).toBeGreaterThan(0)
      }
    }
  })

  it("NAVIGATION section contains Tab and Shift+Tab", () => {
    const sections = getHelpSections()
    const nav = sections.find((s) => s.title === "NAVIGATION")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).toContain("[Tab]")
    expect(keys).toContain("[Shift+Tab]")
  })

  it("EDITING section contains Enter, Esc, d, R", () => {
    const sections = getHelpSections()
    const edit = sections.find((s) => s.title === "EDITING")!
    const keys = edit.keys.map((k) => k.key)
    expect(keys).toContain("[Enter]")
    expect(keys).toContain("[Esc]")
    expect(keys).toContain("[d]")
    expect(keys).toContain("[R]")
  })

  it("ACTIONS section contains s, w, [, ]", () => {
    const sections = getHelpSections()
    const act = sections.find((s) => s.title === "ACTIONS")!
    const keys = act.keys.map((k) => k.key)
    expect(keys).toContain("[s]")
    expect(keys).toContain("[w]")
    expect(keys).toContain("[[ ]")
    expect(keys).toContain("[] ]")
  })

  it("SYSTEM section contains Ctrl+C and ?", () => {
    const sections = getHelpSections()
    const sys = sections.find((s) => s.title === "SYSTEM")!
    const keys = sys.keys.map((k) => k.key)
    expect(keys).toContain("[Ctrl+C]")
    expect(keys).toContain("[?]")
  })

  it("NAVIGATION section does not contain [e] (removed)", () => {
    const sections = getHelpSections()
    const nav = sections.find((s) => s.title === "NAVIGATION")!
    const keys = nav.keys.map((k) => k.key)
    expect(keys).not.toContain("[e]")
    expect(keys).toContain("[Enter]")
  })
})
