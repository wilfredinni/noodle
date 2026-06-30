import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  loadUIState,
  saveUIState,
  loadLastRequest,
  saveLastRequest,
  type TabPrefs,
} from "../../src/ui/tabs/uiState"

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

  describe("lastRequest", () => {
    it("saveUIState preserves lastRequest key", async () => {
      // saveLastRequest writes lastRequest, then saveUIState should preserve it
      await saveLastRequest(tmpDir, "get-posts")
      await saveUIState(
        tmpDir,
        new Map([["get-posts", { requestTab: "body", responseTab: "headers" }]]),
      )
      const result = await loadLastRequest(tmpDir)
      expect(result).toBe("get-posts")
      const raw = await Bun.file(join(tmpDir, ".noodle", "ui-state.yml")).text()
      expect(raw).toContain("lastRequest: get-posts")
    })
    it("loadLastRequest returns undefined for missing file", async () => {
      const result = await loadLastRequest(tmpDir)
      expect(result).toBeUndefined()
    })

    it("loadLastRequest returns the lastRequest key when present", async () => {
      mkdirSync(join(tmpDir, ".noodle"))
      writeFileSync(
        join(tmpDir, ".noodle", "ui-state.yml"),
        "lastRequest: get-posts\n" +
          "get-posts:\n" +
          "  request: body\n" +
          "  response: pretty\n",
        "utf8",
      )
      const result = await loadLastRequest(tmpDir)
      expect(result).toBe("get-posts")
    })

    it("loadLastRequest returns undefined when key is absent", async () => {
      mkdirSync(join(tmpDir, ".noodle"))
      writeFileSync(
        join(tmpDir, ".noodle", "ui-state.yml"),
        "get-posts:\n  request: body\n  response: pretty\n",
        "utf8",
      )
      const result = await loadLastRequest(tmpDir)
      expect(result).toBeUndefined()
    })

    it("loadLastRequest returns undefined for corrupt yaml", async () => {
      mkdirSync(join(tmpDir, ".noodle"))
      writeFileSync(join(tmpDir, ".noodle", "ui-state.yml"), "{{ broken yaml\n", "utf8")
      const result = await loadLastRequest(tmpDir)
      expect(result).toBeUndefined()
    })

    it("saveLastRequest writes the lastRequest key and preserves existing tab data", async () => {
      await saveUIState(
        tmpDir,
        new Map([["get-posts", { requestTab: "body", responseTab: "headers" }]]),
      )
      await saveLastRequest(tmpDir, "get-posts")
      const raw = await Bun.file(join(tmpDir, ".noodle", "ui-state.yml")).text()
      expect(raw).toContain("lastRequest: get-posts")
      expect(raw).toContain("get-posts:")
      expect(raw).toContain("request: body")
      expect(raw).toContain("response: headers")
    })

    it("saveLastRequest creates the directory and file if missing", async () => {
      await saveLastRequest(tmpDir, "create-post")
      const raw = await Bun.file(join(tmpDir, ".noodle", "ui-state.yml")).text()
      expect(raw).toContain("lastRequest: create-post")
    })
  })
})
