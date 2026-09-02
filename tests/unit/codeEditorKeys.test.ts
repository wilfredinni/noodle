import { describe, expect, it } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import {
  getAutoCloseCharacter,
  getEditorCommand,
  isPotentialEditKey,
  normalizeEditorKey,
  shouldAutoSkipClosingCharacter,
} from "../../src/ui/editor/codeEditorKeys"

function key(name: string, modifiers: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name,
    sequence: name,
    raw: name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    hyper: false,
    ...modifiers,
  } as KeyEvent
}

describe("codeEditorKeys", () => {
  it("keeps only toggle-fold as a fixed editor shortcut", () => {
    expect(getEditorCommand(key("g", { ctrl: true }))).toBe("toggle-fold")
    expect(getEditorCommand(key("f5"))).toBeNull()
    expect(getEditorCommand(key("]", { ctrl: true, shift: true }))).toBeNull()
    expect(getEditorCommand(key("f5", { ctrl: true }))).toBeNull()
  })

  it("normalizes shift-return and preserves auto-pair policy", () => {
    expect(normalizeEditorKey(key("return", { shift: true })).shift).toBe(false)
    expect(getAutoCloseCharacter(key("{"))).toBe("}")
    expect(getAutoCloseCharacter(key("{", { ctrl: true }))).toBeUndefined()
    expect(shouldAutoSkipClosingCharacter(key("}"), "{}", 1)).toBe(true)
    expect(shouldAutoSkipClosingCharacter(key("}"), "{}", 0)).toBe(false)
    expect(isPotentialEditKey(key("backspace"))).toBe(true)
    expect(isPotentialEditKey(key("a", { meta: true }))).toBe(false)
  })
})
