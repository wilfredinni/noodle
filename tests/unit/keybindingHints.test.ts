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

  it("hides persistent global hints by default", () => {
    const r = ctx()
    expect(getKeybindingHints(r).header).toEqual([])
  })

  it("overlay active takes priority over jump mode", () => {
    const r = ctx({ overlayActive: true, jumpMode: true })
    expect(getKeybindingHints(r).header).toEqual([seg("Esc", "close")])
  })
})

describe("getKeybindingHints footer", () => {
  it("uses contextual settings hints", () => {
    expect(
      getKeybindingHints(ctx({ view: "settings", focus: "settings-sidebar" }))
        .footer,
    ).toEqual([
      seg("↑/↓", "categories"),
      seg("←/→", "scope"),
      seg("Esc", "close settings"),
    ])

    expect(
      getKeybindingHints(
        ctx({
          view: "settings",
          focus: "settings-content",
          settingsCategory: "keyboard",
        }),
      ).footer,
    ).toEqual([
      seg("Enter", "rebind"),
      seg("^d", "reset"),
      seg("Esc", "close settings"),
    ])

    expect(
      getKeybindingHints(
        ctx({
          view: "settings",
          focus: "settings-content",
          settingsCategory: "collections",
        }),
      ).footer,
    ).toEqual([
      seg("↑/↓", "select"),
      seg("Ctrl+↑/↓", "reorder"),
      seg("^w", "unregister"),
    ])

    expect(
      getKeybindingHints(
        ctx({
          view: "settings",
          focus: "settings-content",
          settingsCategory: "general",
        }),
      ).footer,
    ).toEqual([seg("Tab", "next"), seg("Esc", "close settings")])
  })

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
      seg("^s", "save", "browse.save"),
      seg("^r", "revert all", "browse.revert-all"),
      seg("f2", "expand", "request.expand-toggle"),
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
      seg("^s", "save", "folder.save"),
      seg("^r", "revert all", "folder-browse.revert-all"),
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
      seg("s", "secret", "env-browse.secret"),
      seg("r", "reveal", "env-browse.reveal"),
      seg("^d", "revert", "env-browse.revert"),
      seg("^s", "save", "env.save"),
    ])
  })
})
