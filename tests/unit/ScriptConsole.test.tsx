import { describe, expect, it, spyOn } from "bun:test"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import {
  ScriptConsole,
  ConsoleCopyContext,
  scriptConsoleEntries,
  formatConsoleEntry,
} from "../../src/ui/ScriptConsole"
import { ThemeProvider } from "../../src/ui/theme"
import * as clipboard from "../../src/ui/clipboard"
import type { ResponseExecutionResults } from "../../src/executionResults"

const testRender = createTestRender()
const execution: ResponseExecutionResults = {
  scripts: {
    evaluated: true,
    results: [
      {
        phase: "pre",
        success: true,
        durationMs: 1,
        scope: "collection",
        sourceKind: "inline",
        source: { scope: "collection", path: "settings.yml" },
        logs: [{ level: "info", message: "[REDACTED]", timeMs: 1 }],
      },
      {
        phase: "post",
        success: true,
        durationMs: 1,
        scope: "request",
        sourceKind: "external",
        logs: [
          {
            level: "warn",
            message: "post warning",
            timeMs: 3,
            source: {
              scope: "request",
              scopeId: "a",
              path: "a.yml",
              sourcePath: "./post.js",
              sourceKind: "external",
            },
          },
        ],
      },
    ],
  },
  tests: {
    evaluated: true,
    results: [],
    logs: [
      {
        level: "error",
        message: "test failure",
        timeMs: 4,
        source: { scope: "folder", scopeId: "users", path: "users/folder.yml" },
      },
    ],
  },
}

describe("ScriptConsole", () => {
  it("keeps execution order and relative times with scope, phase, level and redacted text", () => {
    const entries = scriptConsoleEntries(execution)
    expect(entries.map((x) => x.phase)).toEqual(["pre", "post", "tests"])
    expect(formatConsoleEntry(entries[0]!)).toBe(
      "[1.0ms] collection: settings.yml pre INFO [REDACTED]",
    )
    expect(formatConsoleEntry(entries[1]!)).toContain("post WARN post warning")
  })

  it("filters, copies displayed logs, isolates the next result and works inside Runner overlays", async () => {
    const { keymap, host } = setupKeymap()
    keymap.setData("app.overlay", "timeline-detail")
    let change!: (value: ResponseExecutionResults) => void
    const copy = { current: null as (() => boolean) | null }
    function Harness() {
      const [result, setResult] = useState(execution)
      change = setResult
      return (
        <ConsoleCopyContext.Provider value={copy}>
          <ScriptConsole execution={result} focused allowOverlay />
        </ConsoleCopyContext.Provider>
      )
    }
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 42, height: 12 },
    )
    await act(async () => {
      await h.renderOnce()
    })
    expect(h.captureCharFrame()).toContain("[REDACTED]")
    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await act(async () => {
      await h.renderOnce()
    })
    expect(h.captureCharFrame()).toContain("post warning")
    expect(h.captureCharFrame()).not.toContain("test failure")
    const copied = spyOn(clipboard, "copyToClipboard").mockReturnValue(true)
    try {
      await act(async () => host.press("tab"))
      await act(async () => host.press("return"))
      expect(copied.mock.calls[0]?.[0]).toBe(
        formatConsoleEntry(scriptConsoleEntries(execution)[1]!),
      )
      expect(copy.current).not.toBeNull()
      await act(async () =>
        change({
          tests: {
            evaluated: true,
            results: [],
            logs: [{ level: "info", message: "next request" }],
          },
        }),
      )
      await act(async () => {
        await h.renderOnce()
      })
      expect(h.captureCharFrame()).toContain("next request")
      expect(h.captureCharFrame()).not.toContain("post warning")
      await act(async () => {
        copy.current?.()
      })
      expect(copied.mock.calls.at(-1)?.[0]).toContain("next request")
    } finally {
      copied.mockRestore()
    }
  })
})
