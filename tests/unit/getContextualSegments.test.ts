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

function base(overrides: Partial<KeybindingHintsContext> = {}) {
  return getKeybindingHints({
    view: "main",
    focus: "sidebar",
    paneMode: "base",
    collectionMode: "collection",
    overlayActive: false,
    jumpMode: false,
    sendState: idle,
    keybinds: kb,
    ...overrides,
  })
}

describe("getContextualSegments", () => {
  it("returns empty when overlay is active", () => {
    const r = base({ focus: "sidebar", overlayActive: true })
    expect(r.footer).toMatchObject([])
  })

  // ── sidebar ──────────────────────────────────────

  it("sidebar in collection mode", () => {
    const r = base({ focus: "sidebar" })
    expect(r.footer).toMatchObject([
      seg("^n", "new"),
      seg("^alt+n", "new folder"),
      seg("^w", "delete"),
      seg("^k", "clone"),
      seg("^s", "save"),
    ])
  })

  it("sidebar in read-only mode returns empty", () => {
    const r = base({ focus: "sidebar", collectionMode: "browse" })
    expect(r.footer).toMatchObject([])
  })

  // ── urlbar ──────────────────────────────────────

  it("urlbar in collection mode", () => {
    const r = base({ focus: "urlbar" })
    expect(r.footer).toMatchObject([seg("^s", "save")])
  })

  it("urlbar in read-only mode returns empty", () => {
    const r = base({ focus: "urlbar", collectionMode: "browse" })
    expect(r.footer).toMatchObject([])
  })

  // ── request ─────────────────────────────────────

  it("request base in collection mode", () => {
    const r = base({ focus: "request" })
    expect(r.footer).toMatchObject([seg("f2", "expand"), seg("^s", "save")])
  })

  it("request JSON body shows fold", () => {
    const r = base({
      focus: "request",
      paneMode: "edit",
      tab: "body",
      bodyType: "json",
    })
    expect(r.footer).toMatchObject([seg("^g", "fold"), seg("f2", "expand")])
  })

  it("request base in read-only mode returns empty", () => {
    const r = base({ focus: "request", collectionMode: "browse" })
    expect(r.footer).toMatchObject([])
  })

  it("request browse in collection mode with no tab", () => {
    const r = base({ focus: "request", paneMode: "browse" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with headers tab shows Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "headers" })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with params tab shows Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "params" })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body tab and no bodyType hides Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "body" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body urlencoded shows Space toggle", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "urlencoded",
    })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body multipart shows Space toggle", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "multipart",
    })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body json hides Space toggle", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "json",
    })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body none hides Space toggle", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "none",
    })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body binary hides Space toggle", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      tab: "body",
      bodyType: "binary",
    })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with auth tab hides Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "auth" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse with settings tab hides Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "settings" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("f2", "expand"),
      seg("^s", "save"),
    ])
  })

  it("request browse in read-only mode returns empty", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(r.footer).toMatchObject([])
  })

  it("request edit returns expand", () => {
    const r = base({ focus: "request", paneMode: "edit" })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  // ── response ────────────────────────────────────

  it("response when done shows copy and filter on body tab", () => {
    const r = base({ focus: "response", sendState: done, tab: "body" })
    expect(r.footer).toMatchObject([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when done on headers tab shows expand", () => {
    const r = base({ focus: "response", sendState: done, tab: "headers" })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  it("response when done on timeline tab shows expand", () => {
    const r = base({ focus: "response", sendState: done, tab: "timeline" })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  it("response when done on network tab shows expand", () => {
    const r = base({ focus: "response", sendState: done, tab: "network" })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  it("response when done without tab shows expand", () => {
    const r = base({ focus: "response", sendState: done })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  it("response when done with open query hides hints", () => {
    const r = base({
      focus: "response",
      sendState: done,
      tab: "body",
      queryVisible: true,
    })
    expect(r.footer).toMatchObject([])
  })

  it("response when done with closed query shows filter", () => {
    const r = base({
      focus: "response",
      sendState: done,
      tab: "body",
      queryVisible: false,
    })
    expect(r.footer).toMatchObject([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when done without queryVisible prop shows filter", () => {
    const r = base({
      focus: "response",
      sendState: done,
      tab: "body",
    })
    expect(r.footer).toMatchObject([
      seg("^b", "copy"),
      seg("/", "filter"),
      seg("f2", "expand"),
    ])
  })

  it("response when idle shows expand", () => {
    const r = base({ focus: "response" })
    expect(r.footer).toMatchObject([seg("f2", "expand")])
  })

  // ── folder ──────────────────────────────────────

  it("folder base in collection mode", () => {
    const r = base({ focus: "folder" })
    expect(r.footer).toMatchObject([seg("^w", "delete"), seg("^s", "save")])
  })

  it("folder base in read-only returns empty", () => {
    const r = base({ focus: "folder", collectionMode: "browse" })
    expect(r.footer).toMatchObject([])
  })

  it("folder browse with headers tab shows Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "headers" })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with meta tab hides Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "meta" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with auth tab hides Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "auth" })
    expect(r.footer).toMatchObject([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with activity tab returns empty", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "activity" })
    expect(r.footer).toMatchObject([])
  })

  it("folder browse in read-only returns empty", () => {
    const r = base({
      focus: "folder",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(r.footer).toMatchObject([])
  })

  it("folder edit returns empty", () => {
    const r = base({ focus: "folder", paneMode: "edit" })
    expect(r.footer).toMatchObject([])
  })

  // ── env editor ──────────────────────────────────

  it("env-sidebar", () => {
    const r = base({ focus: "env-sidebar", view: "env-editor" })
    expect(r.footer).toMatchObject([
      seg("^n", "new"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("env-header", () => {
    const r = base({ focus: "env-header", view: "env-editor" })
    expect(r.footer).toMatchObject([seg("^n", "new"), seg("^s", "save")])
  })

  it("env-vars browse", () => {
    const r = base({
      focus: "env-vars",
      paneMode: "browse",
      view: "env-editor",
    })
    expect(r.footer).toMatchObject([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^s", "save"),
    ])
  })

  it("env-vars edit", () => {
    const r = base({
      focus: "env-vars",
      paneMode: "edit",
      view: "env-editor",
    })
    expect(r.footer).toMatchObject([seg("^s", "save")])
  })

  it("env-editor read-only returns empty", () => {
    const r = base({
      focus: "env-sidebar",
      view: "env-editor",
      collectionMode: "browse",
    })
    expect(r.footer).toMatchObject([])
  })
})
