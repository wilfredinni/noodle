import { describe, it, expect } from "bun:test"
import { getContextualSegments } from "../../src/ui/StatusBar"
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

describe("getContextualSegments", () => {
  it("returns empty when overlay is active", () => {
    const r = getContextualSegments({
      focus: "sidebar",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: true,
    })
    expect(r).toEqual([])
  })

  // ── sidebar ──────────────────────────────────────

  it("sidebar in collection mode", () => {
    const r = getContextualSegments({
      focus: "sidebar",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([
      seg("^s", "save"),
      seg("^n", "new"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("sidebar in read-only mode returns empty", () => {
    const r = getContextualSegments({
      focus: "sidebar",
      paneMode: "base",
      view: "main",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  // ── urlbar ──────────────────────────────────────

  it("urlbar in collection mode", () => {
    const r = getContextualSegments({
      focus: "urlbar",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^s", "save")])
  })

  it("urlbar in read-only mode returns empty", () => {
    const r = getContextualSegments({
      focus: "urlbar",
      paneMode: "base",
      view: "main",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  // ── request ─────────────────────────────────────

  it("request base in collection mode", () => {
    const r = getContextualSegments({
      focus: "request",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^s", "save")])
  })

  it("request base in read-only mode returns empty", () => {
    const r = getContextualSegments({
      focus: "request",
      paneMode: "base",
      view: "main",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  it("request browse in collection mode", () => {
    const r = getContextualSegments({
      focus: "request",
      paneMode: "browse",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse in read-only mode returns empty", () => {
    const r = getContextualSegments({
      focus: "request",
      paneMode: "browse",
      view: "main",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  it("request edit returns empty", () => {
    const r = getContextualSegments({
      focus: "request",
      paneMode: "edit",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  // ── response ────────────────────────────────────

  it("response when done shows copy and filter", () => {
    const r = getContextualSegments({
      focus: "response",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: done,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^b", "copy"), seg("/", "filter")])
  })

  it("response when idle returns empty", () => {
    const r = getContextualSegments({
      focus: "response",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  // ── folder ──────────────────────────────────────

  it("folder base in collection mode", () => {
    const r = getContextualSegments({
      focus: "folder",
      paneMode: "base",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^s", "save"), seg("^w", "delete")])
  })

  it("folder base in read-only returns empty", () => {
    const r = getContextualSegments({
      focus: "folder",
      paneMode: "base",
      view: "main",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  it("folder browse in collection mode", () => {
    const r = getContextualSegments({
      focus: "folder",
      paneMode: "browse",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder edit returns empty", () => {
    const r = getContextualSegments({
      focus: "folder",
      paneMode: "edit",
      view: "main",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })

  // ── env editor ──────────────────────────────────

  it("env-sidebar", () => {
    const r = getContextualSegments({
      focus: "env-sidebar",
      paneMode: "base",
      view: "env-editor",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([
      seg("^n", "new"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("env-header", () => {
    const r = getContextualSegments({
      focus: "env-header",
      paneMode: "base",
      view: "env-editor",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^s", "save"), seg("^n", "new")])
  })

  it("env-vars browse", () => {
    const r = getContextualSegments({
      focus: "env-vars",
      paneMode: "browse",
      view: "env-editor",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^s", "save"),
    ])
  })

  it("env-vars edit", () => {
    const r = getContextualSegments({
      focus: "env-vars",
      paneMode: "edit",
      view: "env-editor",
      collectionMode: "collection",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([seg("^s", "save")])
  })

  it("env-editor read-only returns empty", () => {
    const r = getContextualSegments({
      focus: "env-sidebar",
      paneMode: "base",
      view: "env-editor",
      collectionMode: "browse",
      sendState: idle,
      kb,
      overlayActive: false,
    })
    expect(r).toEqual([])
  })
})
