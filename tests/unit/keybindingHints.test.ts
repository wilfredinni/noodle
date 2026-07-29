import { describe, it, expect } from "bun:test"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { KeybindingHintsContext } from "../../src/ui/keybindingHints"
import { bindingDefaults } from "../../src/ui/keybind"
import type { SendState } from "../../src/ui/sendState"

const kb = bindingDefaults()
const idle: SendState = { status: "idle" }

function seg(key: string, word: string) {
  return { key, word }
}

function ctx(
  overrides: Partial<KeybindingHintsContext> = {},
): KeybindingHintsContext {
  return {
    view: "main",
    focus: "sidebar",
    paneMode: "base",
    collectionMode: "collection",
    overlayActive: false,
    jumpMode: false,
    sendState: idle,
    keybinds: kb,
    ...overrides,
  }
}

describe("getKeybindingHints header", () => {
  it("shows Esc close when overlay is active", () => {
    const r = ctx({ overlayActive: true })
    expect(getKeybindingHints(r).header).toEqual([seg("Esc", "close")])
  })

  it("shows jump hints in jump mode", () => {
    const r = ctx({ jumpMode: true })
    expect(getKeybindingHints(r).header).toEqual([
      seg("Type key", "to jump"),
      seg("Esc", "dismiss"),
    ])
  })

  it("shows env-editor hints", () => {
    const r = ctx({ view: "env-editor" })
    expect(getKeybindingHints(r).header).toEqual([
      seg("^p", "commands"),
      seg("f1", "help"),
    ])
  })

  it("shows main view hints", () => {
    const r = ctx()
    expect(getKeybindingHints(r).header).toEqual([
      seg("g", "jump"),
      seg("^p", "commands"),
      seg("f1", "help"),
    ])
  })

  it("overlay active takes priority over jump mode", () => {
    const r = ctx({ overlayActive: true, jumpMode: true })
    expect(getKeybindingHints(r).header).toEqual([seg("Esc", "close")])
  })
})
