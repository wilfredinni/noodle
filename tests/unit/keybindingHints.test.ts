import { describe, it, expect } from "bun:test"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { KeybindingHintsContext } from "../../src/ui/keybindingHints"
import { bindingDefaults } from "../../src/ui/keybind"
import type { SendState } from "../../src/ui/sendState"

const kb = bindingDefaults()
const idle: SendState = { status: "idle" }

function seg(key: string, word: string, command?: string) {
  return command ? { key, word, command } : { key, word }
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
      seg("^p", "commands", "app.command-palette"),
      seg("f1", "help", "app.help"),
    ])
  })

  it("shows main view hints", () => {
    const r = ctx()
    expect(getKeybindingHints(r).header).toEqual([
      seg("g", "jump", "jump.enter"),
      seg("^p", "commands", "app.command-palette"),
      seg("f1", "help", "app.help"),
    ])
  })

  it("overlay active takes priority over jump mode", () => {
    const r = ctx({ overlayActive: true, jumpMode: true })
    expect(getKeybindingHints(r).header).toEqual([seg("Esc", "close")])
  })
})

describe("getKeybindingHints footer", () => {
  it("uses the active request browse commands", () => {
    expect(
      getKeybindingHints(
        ctx({
          focus: "request",
          paneMode: "browse",
          tab: "headers",
        }),
      ).footer,
    ).toEqual([
      seg("Space", "toggle", "browse.toggle"),
      seg("^d", "revert", "browse.delete"),
      seg("^r", "revert all", "browse.revert-all"),
      seg("f2", "expand", "request.expand-toggle"),
      seg("^s", "save", "browse.save"),
    ])
  })

  it("uses folder and environment command variants", () => {
    expect(
      getKeybindingHints(
        ctx({ focus: "folder", paneMode: "browse", tab: "headers" }),
      ).footer,
    ).toEqual([
      seg("Space", "toggle", "folder-browse.toggle"),
      seg("^d", "revert", "folder-browse.revert-field"),
      seg("^r", "revert all", "folder-browse.revert-all"),
      seg("^s", "save", "folder.save"),
    ])

    expect(
      getKeybindingHints(
        ctx({
          view: "env-editor",
          focus: "env-vars",
          paneMode: "browse",
        }),
      ).footer,
    ).toEqual([
      seg("Space", "toggle", "env-browse.toggle"),
      seg("^d", "revert", "env-browse.revert"),
      seg("^s", "save", "env.save"),
    ])
  })
})
