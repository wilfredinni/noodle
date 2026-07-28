import { describe, it, expect } from "bun:test"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { KeybindingHintsContext } from "../../src/ui/keybindingHints"
import { bindingDefaults } from "../../src/ui/keybind"
import type { SendState } from "../../src/ui/sendState"

const kb = bindingDefaults()
const idle: SendState = { status: "idle" }
const done: SendState = {
  status: "done",
  response: {
    status: 200,
    statusText: "OK",
    headers: {},
    body: "ok",
    timeMs: 10,
  },
}

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

// ── Header ──────────────────────────────────────────

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

// ── Footer ──────────────────────────────────────────

describe("getKeybindingHints footer", () => {
  it("returns empty when overlay is active", () => {
    const r = ctx({ focus: "sidebar", overlayActive: true })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  // ── sidebar ──

  it("sidebar in collection mode", () => {
    const r = ctx({ focus: "sidebar" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^n", "new"),
      seg("^alt+n", "new folder"),
      seg("^w", "delete"),
      seg("^k", "clone"),
      seg("^s", "save"),
    ])
  })

  it("sidebar in read-only mode returns empty", () => {
    const r = ctx({ focus: "sidebar", collectionMode: "browse" })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  // ── urlbar ──

  it("urlbar in collection mode", () => {
    const r = ctx({ focus: "urlbar" })
    expect(getKeybindingHints(r).footer).toEqual([seg("^s", "save")])
  })

  it("urlbar in read-only mode returns empty", () => {
    const r = ctx({ focus: "urlbar", collectionMode: "browse" })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  // ── request ──

  it("request base in collection mode", () => {
    const r = ctx({ focus: "request" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request base in read-only mode returns empty", () => {
    const r = ctx({ focus: "request", collectionMode: "browse" })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("request browse in collection mode with no tab", () => {
    const r = ctx({ focus: "request", paneMode: "browse" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with headers tab shows Space toggle", () => {
    const r = ctx({ focus: "request", paneMode: "browse", tab: "headers" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with params tab shows Space toggle", () => {
    const r = ctx({ focus: "request", paneMode: "browse", tab: "params" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body tab and no bodyType hides Space toggle", () => {
    const r = ctx({ focus: "request", paneMode: "browse", tab: "body" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body urlencoded shows Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "urlencoded",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body multipart shows Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "multipart",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body json hides Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "json",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body none hides Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "none",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body binary hides Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "binary",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with auth tab hides Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "auth",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with settings tab hides Space toggle", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      tab: "settings",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse in read-only mode returns empty", () => {
    const r = ctx({
      focus: "request",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("request edit returns expand", () => {
    const r = ctx({ focus: "request", paneMode: "edit" })
    expect(getKeybindingHints(r).footer).toEqual([seg("f2", "expand")])
  })

  // ── response ──

  it("response when done shows copy and filter on body tab", () => {
    const r = ctx({ focus: "response", sendState: done, tab: "body" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when done on headers tab shows expand", () => {
    const r = ctx({ focus: "response", sendState: done, tab: "headers" })
    expect(getKeybindingHints(r).footer).toEqual([seg("f2", "expand")])
  })

  it("response when done on timeline tab shows expand", () => {
    const r = ctx({ focus: "response", sendState: done, tab: "timeline" })
    expect(getKeybindingHints(r).footer).toEqual([seg("f2", "expand")])
  })

  it("response when done without tab shows expand", () => {
    const r = ctx({ focus: "response", sendState: done })
    expect(getKeybindingHints(r).footer).toEqual([seg("f2", "expand")])
  })

  it("response when done with open query hides hints", () => {
    const r = ctx({
      focus: "response",
      sendState: done,
      tab: "body",
      queryVisible: true,
    })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("response when done with closed query shows filter", () => {
    const r = ctx({
      focus: "response",
      sendState: done,
      tab: "body",
      queryVisible: false,
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when done without queryVisible prop shows filter", () => {
    const r = ctx({
      focus: "response",
      sendState: done,
      tab: "body",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when idle shows expand", () => {
    const r = ctx({ focus: "response" })
    expect(getKeybindingHints(r).footer).toEqual([seg("f2", "expand")])
  })

  // ── folder ──

  it("folder base in collection mode", () => {
    const r = ctx({ focus: "folder" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^w", "delete"),
      seg("^s", "save"),
    ])
  })

  it("folder base in read-only returns empty", () => {
    const r = ctx({ focus: "folder", collectionMode: "browse" })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("folder browse with headers tab shows Space toggle", () => {
    const r = ctx({
      focus: "folder",
      paneMode: "browse",
      tab: "headers",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with meta tab hides Space toggle", () => {
    const r = ctx({ focus: "folder", paneMode: "browse", tab: "meta" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with auth tab hides Space toggle", () => {
    const r = ctx({ focus: "folder", paneMode: "browse", tab: "auth" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with activity tab returns empty", () => {
    const r = ctx({
      focus: "folder",
      paneMode: "browse",
      tab: "activity",
    })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("folder browse in read-only returns empty", () => {
    const r = ctx({
      focus: "folder",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  it("folder edit returns empty", () => {
    const r = ctx({ focus: "folder", paneMode: "edit" })
    expect(getKeybindingHints(r).footer).toEqual([])
  })

  // ── env editor ──

  it("env-sidebar", () => {
    const r = ctx({ focus: "env-sidebar", view: "env-editor" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^n", "new"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("env-header", () => {
    const r = ctx({ focus: "env-header", view: "env-editor" })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("^n", "new"),
      seg("^s", "save"),
    ])
  })

  it("env-vars browse", () => {
    const r = ctx({
      focus: "env-vars",
      paneMode: "browse",
      view: "env-editor",
    })
    expect(getKeybindingHints(r).footer).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^s", "save"),
    ])
  })

  it("env-vars edit", () => {
    const r = ctx({
      focus: "env-vars",
      paneMode: "edit",
      view: "env-editor",
    })
    expect(getKeybindingHints(r).footer).toEqual([seg("^s", "save")])
  })

  it("env-editor read-only returns empty", () => {
    const r = ctx({
      focus: "env-sidebar",
      view: "env-editor",
      collectionMode: "browse",
    })
    expect(getKeybindingHints(r).footer).toEqual([])
  })
})
