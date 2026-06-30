import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { loadUIState, saveUIState, type TabPrefs } from "../../src/ui/tabs/uiState"

describe("uiState I/O", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "uistate-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns empty map for missing/directory", async () => {
    const map = await loadUIState("/nonexistent/path")
    expect(map.size).toBe(0)
  })

  it("returns empty map for missing file inside existing dir", async () => {
    mkdirSync(join(tmpDir, ".noodle"))
    const map = await loadUIState(tmpDir)
    expect(map.size).toBe(0)
  })

  it("loads saved prefs", async () => {
    const prefs: TabPrefs = { requestTab: "body", responseTab: "headers" }
    await saveUIState(tmpDir, new Map([["get_users", prefs]]))
    const map = await loadUIState(tmpDir)
    expect(map.size).toBe(1)
    expect(map.get("get_users")).toEqual(prefs)
  })

  it("loads multiple requests", async () => {
    const a: TabPrefs = { requestTab: "auth", responseTab: "body" }
    const b: TabPrefs = { requestTab: "body", responseTab: "timeline" }
    await saveUIState(tmpDir, new Map([["req_a", a], ["req_b", b]]))
    const map = await loadUIState(tmpDir)
    expect(map.size).toBe(2)
    expect(map.get("req_a")).toEqual(a)
    expect(map.get("req_b")).toEqual(b)
  })

  it("overwrites existing data on save", async () => {
    await saveUIState(tmpDir, new Map([["x", { requestTab: "auth", responseTab: "body" }]]))
    await saveUIState(tmpDir, new Map([["x", { requestTab: "body", responseTab: "timeline" }]]))
    const map = await loadUIState(tmpDir)
    expect(map.get("x")?.requestTab).toBe("body")
    expect(map.get("x")?.responseTab).toBe("timeline")
  })

  it("handles corrupted yaml gracefully", async () => {
    mkdirSync(join(tmpDir, ".noodle"))
    writeFileSync(join(tmpDir, ".noodle", "ui-state.yml"), "{{ broken yaml\n", "utf8")
    const map = await loadUIState(tmpDir)
    expect(map.size).toBe(0)
  })

  it("skips entries with both defaults on save", async () => {
    const map = new Map<string, TabPrefs>([
      ["req_a", { requestTab: "headers", responseTab: "body" }], // defaults
      ["req_b", { requestTab: "auth", responseTab: "timeline" }], // non-defaults
    ])
    await saveUIState(tmpDir, map)
    const raw = await Bun.file(join(tmpDir, ".noodle", "ui-state.yml")).text()
    expect(raw).not.toContain("req_a")
    expect(raw).toContain("req_b")
  })
})
