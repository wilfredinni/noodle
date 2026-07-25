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

function base(input: {
  focus: Parameters<typeof getContextualSegments>[0]["focus"]
  paneMode?: "base" | "browse" | "edit"
  view?: "main" | "env-editor"
  collectionMode?: "collection" | "browse" | "empty" | "invalid"
  sendState?: SendState
  overlayActive?: boolean
  tab?: string
}) {
  return getContextualSegments({
    focus: input.focus,
    paneMode: input.paneMode ?? "base",
    view: input.view ?? "main",
    collectionMode: input.collectionMode ?? "collection",
    sendState: input.sendState ?? idle,
    kb,
    overlayActive: input.overlayActive ?? false,
    tab: input.tab,
  })
}

describe("getContextualSegments", () => {
  it("returns empty when overlay is active", () => {
    const r = base({ focus: "sidebar", overlayActive: true })
    expect(r).toEqual([])
  })

  // ── sidebar ──────────────────────────────────────

  it("sidebar in collection mode", () => {
    const r = base({ focus: "sidebar" })
    expect(r).toEqual([
      seg("^s", "save"),
      seg("^n", "new"),
      seg("^alt+n", "new folder"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("sidebar in read-only mode returns empty", () => {
    const r = base({ focus: "sidebar", collectionMode: "browse" })
    expect(r).toEqual([])
  })

  // ── urlbar ──────────────────────────────────────

  it("urlbar in collection mode", () => {
    const r = base({ focus: "urlbar" })
    expect(r).toEqual([seg("^s", "save")])
  })

  it("urlbar in read-only mode returns empty", () => {
    const r = base({ focus: "urlbar", collectionMode: "browse" })
    expect(r).toEqual([])
  })

  // ── request ─────────────────────────────────────

  it("request base in collection mode", () => {
    const r = base({ focus: "request" })
    expect(r).toEqual([seg("^s", "save")])
  })

  it("request base in read-only mode returns empty", () => {
    const r = base({ focus: "request", collectionMode: "browse" })
    expect(r).toEqual([])
  })

  it("request browse in collection mode with no tab", () => {
    const r = base({ focus: "request", paneMode: "browse" })
    expect(r).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse with headers tab shows Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "headers" })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse with params tab shows Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "params" })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse with body tab shows Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "body" })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse with auth tab hides Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "auth" })
    expect(r).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse with settings tab hides Space toggle", () => {
    const r = base({ focus: "request", paneMode: "browse", tab: "settings" })
    expect(r).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("request browse in read-only mode returns empty", () => {
    const r = base({
      focus: "request",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(r).toEqual([])
  })

  it("request edit returns empty", () => {
    const r = base({ focus: "request", paneMode: "edit" })
    expect(r).toEqual([])
  })

  // ── response ────────────────────────────────────

  it("response when done shows copy and filter on body tab", () => {
    const r = base({ focus: "response", sendState: done, tab: "body" })
    expect(r).toEqual([seg("^b", "copy"), seg("/", "filter")])
  })

  it("response when done on headers tab returns empty", () => {
    const r = base({ focus: "response", sendState: done, tab: "headers" })
    expect(r).toEqual([])
  })

  it("response when done on timeline tab returns empty", () => {
    const r = base({ focus: "response", sendState: done, tab: "timeline" })
    expect(r).toEqual([])
  })

  it("response when done without tab returns empty", () => {
    const r = base({ focus: "response", sendState: done })
    expect(r).toEqual([])
  })

  it("response when idle returns empty", () => {
    const r = base({ focus: "response" })
    expect(r).toEqual([])
  })

  // ── folder ──────────────────────────────────────

  it("folder base in collection mode", () => {
    const r = base({ focus: "folder" })
    expect(r).toEqual([seg("^s", "save"), seg("^w", "delete")])
  })

  it("folder base in read-only returns empty", () => {
    const r = base({ focus: "folder", collectionMode: "browse" })
    expect(r).toEqual([])
  })

  it("folder browse with headers tab shows Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "headers" })
    expect(r).toEqual([
      seg("Space", "toggle"),
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with meta tab hides Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "meta" })
    expect(r).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with auth tab hides Space toggle", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "auth" })
    expect(r).toEqual([
      seg("^d", "revert"),
      seg("^r", "revert all"),
      seg("^s", "save"),
    ])
  })

  it("folder browse with activity tab returns empty", () => {
    const r = base({ focus: "folder", paneMode: "browse", tab: "activity" })
    expect(r).toEqual([])
  })

  it("folder browse in read-only returns empty", () => {
    const r = base({
      focus: "folder",
      paneMode: "browse",
      collectionMode: "browse",
    })
    expect(r).toEqual([])
  })

  it("folder edit returns empty", () => {
    const r = base({ focus: "folder", paneMode: "edit" })
    expect(r).toEqual([])
  })

  // ── env editor ──────────────────────────────────

  it("env-sidebar", () => {
    const r = base({ focus: "env-sidebar", view: "env-editor" })
    expect(r).toEqual([
      seg("^n", "new"),
      seg("^w", "delete"),
      seg("^k", "clone"),
    ])
  })

  it("env-header", () => {
    const r = base({ focus: "env-header", view: "env-editor" })
    expect(r).toEqual([seg("^s", "save"), seg("^n", "new")])
  })

  it("env-vars browse", () => {
    const r = base({
      focus: "env-vars",
      paneMode: "browse",
      view: "env-editor",
    })
    expect(r).toEqual([
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
    expect(r).toEqual([seg("^s", "save")])
  })

  it("env-editor read-only returns empty", () => {
    const r = base({
      focus: "env-sidebar",
      view: "env-editor",
      collectionMode: "browse",
    })
    expect(r).toEqual([])
  })
})
