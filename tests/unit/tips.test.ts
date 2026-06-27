import { describe, it, expect } from "bun:test"
import { parseTip } from "../../src/ui/Tips"

describe("parseTip", () => {
  it("returns single plain part for text without braces", () => {
    const parts = parseTip("just a plain tip")
    expect(parts).toEqual([{ text: "just a plain tip", isKey: false }])
  })

  it("parses single keybinding", () => {
    const parts = parseTip("send with {^↩}")
    expect(parts).toEqual([
      { text: "send with ", isKey: false },
      { text: "^↩", isKey: true },
    ])
  })

  it("parses multiple keybindings", () => {
    const parts = parseTip("cycle with {^[} and {^]}")
    expect(parts).toEqual([
      { text: "cycle with ", isKey: false },
      { text: "^[", isKey: true },
      { text: " and ", isKey: false },
      { text: "^]", isKey: true },
    ])
  })

  it("treats double braces {{}} as literal, not keybinding", () => {
    const parts = parseTip("use {{var}} syntax")
    expect(parts).toEqual([
      { text: "use ", isKey: false },
      { text: "{{var}}", isKey: false },
      { text: " syntax", isKey: false },
    ])
  })

  it("handles leading keybinding", () => {
    const parts = parseTip("{F1} opens help")
    expect(parts).toEqual([
      { text: "F1", isKey: true },
      { text: " opens help", isKey: false },
    ])
  })

  it("handles trailing keybinding", () => {
    const parts = parseTip("press {Enter}")
    expect(parts).toEqual([
      { text: "press ", isKey: false },
      { text: "Enter", isKey: true },
    ])
  })

  it("handles empty tip", () => {
    const parts = parseTip("")
    expect(parts).toEqual([])
  })

  it("handles tip that is only a keybinding", () => {
    const parts = parseTip("{^S}")
    expect(parts).toEqual([{ text: "^S", isKey: true }])
  })

  it("handles adjacent keybindings", () => {
    const parts = parseTip("{↑}{↓}")
    expect(parts).toEqual([
      { text: "↑", isKey: true },
      { text: "↓", isKey: true },
    ])
  })
})
