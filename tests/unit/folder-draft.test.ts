import { describe, it, expect, beforeEach } from "bun:test"
import {
  applyDraftOp,
  clearFolderAuthTypeCache,
  folderEqual,
} from "../../src/hooks/useFolderDraft"
import type { Folder } from "../../src/schema"

function makeFolder(overrides?: Partial<Folder>): Folder {
  return {
    id: "test",
    name: "Test",
    path: "test",
    children: [],
    ...overrides,
  }
}

describe("applyDraftOp", () => {
  beforeEach(() => {
    clearFolderAuthTypeCache()
  })

  it("setName changes folder name", () => {
    const f = makeFolder({ name: "Old" })
    const r = applyDraftOp(f, { kind: "setName", name: "New" })
    expect(r?.name).toBe("New")
  })

  it("setSeq changes seq", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, { kind: "setSeq", seq: 5 })
    expect(r?.seq).toBe(5)
  })

  it("addHeaderRow adds to empty overrides", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, {
      kind: "addHeaderRow",
      key: "Authorization",
      value: "Bearer x",
    })
    expect(r?.overrides?.headers?.["Authorization"]).toEqual({
      value: "Bearer x",
      enabled: true,
    })
  })

  it("addHeaderRow adds to existing headers", () => {
    const f = makeFolder({
      overrides: {
        headers: { "X-1": { value: "v1", enabled: true } },
      },
    })
    const r = applyDraftOp(f, {
      kind: "addHeaderRow",
      key: "X-2",
      value: "v2",
    })
    expect(Object.keys(r?.overrides?.headers ?? {})).toHaveLength(2)
  })

  it("removeHeaderRow deletes row by index", () => {
    const f = makeFolder({
      overrides: {
        headers: {
          "X-1": { value: "v1", enabled: true },
          "X-2": { value: "v2", enabled: true },
        },
      },
    })
    const r = applyDraftOp(f, { kind: "removeHeaderRow", index: 0 })
    expect(Object.keys(r?.overrides?.headers ?? {})).toEqual(["X-2"])
  })

  it("toggleHeaderRow toggles enabled", () => {
    const f = makeFolder({
      overrides: {
        headers: { "X-1": { value: "v1", enabled: true } },
      },
    })
    const r = applyDraftOp(f, { kind: "toggleHeaderRow", index: 0 })
    expect(r?.overrides?.headers?.["X-1"]?.enabled).toBe(false)
  })

  it("setAuthType sets auth to bearer", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, { kind: "setAuthType", authType: "bearer" })
    expect(r?.overrides?.auth).toEqual({ type: "bearer", token: "" })
  })

  it("setAuthType sets auth to none", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, { kind: "setAuthType", authType: "none" })
    expect(r?.overrides?.auth).toEqual({ type: "none" })
  })

  it("setAuthField updates token for bearer", () => {
    const f = makeFolder({
      overrides: { auth: { type: "bearer", token: "" } },
    })
    const r = applyDraftOp(f, {
      kind: "setAuthField",
      authType: "bearer",
      field: "token",
      value: "tok123",
    })
    expect(r?.overrides?.auth).toEqual({ type: "bearer", token: "tok123" })
  })

  it("setApiKeyPlacement changes placement", () => {
    const f = makeFolder({
      overrides: {
        auth: { type: "api_key", key: "k", value: "v", placement: "header" },
      },
    })
    const r = applyDraftOp(f, {
      kind: "setApiKeyPlacement",
      placement: "query",
    })
    expect(r?.overrides?.auth).toEqual({
      type: "api_key",
      key: "k",
      value: "v",
      placement: "query",
    })
  })

  it("setHeaderRow updates key and value preserving enabled", () => {
    const f = makeFolder({
      overrides: {
        headers: { "X-Old": { value: "old", enabled: false } },
      },
    })
    const r = applyDraftOp(f, {
      kind: "setHeaderRow",
      index: 0,
      key: "X-New",
      value: "new",
    })
    expect(Object.keys(r?.overrides?.headers ?? {})).toEqual(["X-New"])
    expect(r?.overrides?.headers?.["X-New"]).toEqual({
      value: "new",
      enabled: false,
    })
  })

  it("revert signals return to original (null)", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, { kind: "revert" })
    expect(r).toBeNull()
  })

  it("returns null for null folder input", () => {
    expect(applyDraftOp(null, { kind: "setName", name: "x" })).toBeNull()
  })

  it("setAuthField is no-op when auth type mismatch", () => {
    const f = makeFolder({
      overrides: { auth: { type: "bearer", token: "tok" } },
    })
    const r = applyDraftOp(f, {
      kind: "setAuthField",
      authType: "basic",
      field: "user",
      value: "u",
    })
    expect(r?.overrides?.auth).toEqual({ type: "bearer", token: "tok" })
  })

  it("setApiKeyPlacement is no-op when auth is not api_key", () => {
    const f = makeFolder({
      overrides: { auth: { type: "bearer", token: "tok" } },
    })
    const r = applyDraftOp(f, {
      kind: "setApiKeyPlacement",
      placement: "query",
    })
    expect(r?.overrides?.auth).toEqual({ type: "bearer", token: "tok" })
  })

  it("markSaved is identity", () => {
    const f = makeFolder()
    const r = applyDraftOp(f, { kind: "markSaved" })
    expect(r).toBe(f)
  })

  it("setAuthType saves current auth to cache and restores it on switch back", () => {
    const f = makeFolder({
      path: "cache-save-restore",
      overrides: { auth: { type: "basic", user: "admin", pass: "secret" } },
    })
    const bearer = applyDraftOp(f, { kind: "setAuthType", authType: "bearer" })
    expect(bearer?.overrides?.auth).toEqual({ type: "bearer", token: "" })

    const backToBasic = applyDraftOp(bearer, {
      kind: "setAuthType",
      authType: "basic",
    })
    expect(backToBasic?.overrides?.auth).toEqual({
      type: "basic",
      user: "admin",
      pass: "secret",
    })
  })

  it("setAuthType restores cached auth across multiple switches", () => {
    const f = makeFolder({
      path: "multi-switch",
      overrides: { auth: { type: "basic", user: "u", pass: "p" } },
    })
    const apiKey = applyDraftOp(f, { kind: "setAuthType", authType: "api_key" })
    expect(apiKey?.overrides?.auth).toEqual({
      type: "api_key",
      key: "",
      value: "",
      placement: "header",
    })

    const bearer = applyDraftOp(apiKey, {
      kind: "setAuthType",
      authType: "bearer",
    })
    expect(bearer?.overrides?.auth).toEqual({ type: "bearer", token: "" })

    const backToBasic = applyDraftOp(bearer, {
      kind: "setAuthType",
      authType: "basic",
    })
    expect(backToBasic?.overrides?.auth).toEqual({
      type: "basic",
      user: "u",
      pass: "p",
    })

    const backToApiKey = applyDraftOp(backToBasic, {
      kind: "setAuthType",
      authType: "api_key",
    })
    expect(backToApiKey?.overrides?.auth).toEqual({
      type: "api_key",
      key: "",
      value: "",
      placement: "header",
    })
  })

  it("setAuthType falls back to original auth when cache misses", () => {
    const original = makeFolder({
      path: "orig-fallback",
      overrides: {
        auth: { type: "basic", user: "saved-user", pass: "saved-pass" },
      },
    })
    const current = makeFolder({
      path: "orig-fallback",
      overrides: { auth: { type: "bearer", token: "unsaved" } },
    })
    const result = applyDraftOp(
      current,
      { kind: "setAuthType", authType: "basic" },
      original,
    )
    expect(result?.overrides?.auth).toEqual({
      type: "basic",
      user: "saved-user",
      pass: "saved-pass",
    })
  })

  it("setAuthType saves none-auth override does not cache", () => {
    const f = makeFolder({
      path: "none-no-cache",
      overrides: { auth: { type: "none" } },
    })
    const bearer = applyDraftOp(f, { kind: "setAuthType", authType: "bearer" })
    expect(bearer?.overrides?.auth).toEqual({ type: "bearer", token: "" })

    const backToNone = applyDraftOp(bearer, {
      kind: "setAuthType",
      authType: "none",
    })
    expect(backToNone?.overrides?.auth).toEqual({ type: "none" })
  })
})

describe("folderEqual", () => {
  it("returns true for identical folders", () => {
    expect(folderEqual(makeFolder(), makeFolder())).toBe(true)
  })

  it("returns false for different names", () => {
    expect(
      folderEqual(makeFolder({ name: "A" }), makeFolder({ name: "B" })),
    ).toBe(false)
  })

  it("returns false for different seq", () => {
    expect(folderEqual(makeFolder({ seq: 1 }), makeFolder({ seq: 2 }))).toBe(
      false,
    )
  })

  it("returns false for different headers", () => {
    const a = makeFolder({
      overrides: { headers: { "X-1": { value: "v1", enabled: true } } },
    })
    const b = makeFolder()
    expect(folderEqual(a, b)).toBe(false)
  })

  it("returns false for different auth", () => {
    const a = makeFolder({
      overrides: { auth: { type: "bearer", token: "tok" } },
    })
    const b = makeFolder()
    expect(folderEqual(a, b)).toBe(false)
  })

  it("returns true for both undefined auth", () => {
    expect(folderEqual(makeFolder(), makeFolder())).toBe(true)
  })

  it("returns true when one folder has none auth and other has no overrides", () => {
    const a = makeFolder({
      overrides: { auth: { type: "none" } },
    })
    const b = makeFolder()
    expect(folderEqual(a, b)).toBe(true)
  })
})
