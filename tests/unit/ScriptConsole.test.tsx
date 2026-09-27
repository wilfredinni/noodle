import { describe, expect, it, spyOn } from "bun:test"
import { act, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { RGBA, ScrollBoxRenderable, TextRenderable } from "@opentui/core"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import {
  ScriptConsole,
  ConsoleCopyContext,
  scriptConsoleEntries,
  formatConsoleEntry,
} from "../../src/ui/ScriptConsole"
import { ThemeProvider } from "../../src/ui/theme"
import { THEMES } from "../../src/ui/theme-data"
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
  it("aligns colored fields and reflows complete messages as the pane narrows and widens", async () => {
    const { keymap } = setupKeymap()
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ScriptConsole
            execution={{
              ...execution,
              tests: {
                evaluated: true,
                results: [],
                logs: [
                  {
                    level: "error",
                    timeMs: 1234.5,
                    message:
                      "Checked users: 10\n你好 🌍 complete message\nabcdefghijklmnopqrstuvwxyz0123456789",
                  },
                ],
              },
            }}
            focused
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    const message = (index: number) =>
      h.renderer.root.findDescendantById(
        `script-console-message-${index}`,
      ) as TextRenderable
    const metadata = (index: number) =>
      h.renderer.root.findDescendantById(`script-console-metadata-${index}`)!
    const scroll = h.renderer.root.findDescendantById(
      "script-console-logs",
    ) as ScrollBoxRenderable
    await act(async () => h.renderOnce())
    expect(message(0).screenX).toBe(message(2).screenX)
    expect(message(0).screenY).toBe(metadata(0).screenY)
    expect(h.captureCharFrame()).toMatch(
      /1234\.5ms\s+tests\s+ERROR\s+Checked users: 10/,
    )
    const spans = h.captureSpans().lines.flatMap((line) => line.spans)
    for (const [label, color] of [
      ["1234.5ms", THEMES[0]!.textMuted],
      ["pre", THEMES[0]!.primary],
      ["post", THEMES[0]!.secondary],
      ["tests", THEMES[0]!.accent],
      ["INFO", THEMES[0]!.info],
      ["WARN", THEMES[0]!.warning],
      ["ERROR", THEMES[0]!.error],
    ]) {
      const span = spans.find((span) => span.text.includes(label!))
      expect(span?.fg.equals(RGBA.fromHex(color!))).toBe(true)
    }
    expect(message(2).fg.equals(RGBA.fromHex(THEMES[0]!.text))).toBe(true)
    for (const width of [42, 18, 80]) {
      await act(async () => {
        h.resize(width, 24)
        await h.renderOnce()
      })
      const frame = h.captureCharFrame()
      const contents = frame.replace(/\s+/g, "")
      expect(contents).toContain("1234.5mstestsERROR")
      expect(contents).toContain("Checkedusers:10你好🌍completemessage")
      expect(contents).toContain("abcdefghijklmnopqrstuvwxyz0123456789")
      expect(contents).not.toContain("request:")
      expect(contents).not.toContain("▸")
      expect(contents).not.toContain("▾")
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.viewport.width)
      if (width < 80) {
        expect(message(0).screenY).toBeGreaterThan(metadata(0).screenY)
      } else {
        expect(message(0).screenY).toBe(metadata(0).screenY)
      }
    }
  })

  it("scrolls full rows without opening or collapsing them and resets for the next execution", async () => {
    const { keymap, host } = setupKeymap()
    let change!: (value: ResponseExecutionResults) => void
    function Harness() {
      const [result, setResult] = useState<ResponseExecutionResults>({
        tests: {
          evaluated: true,
          results: [],
          logs: Array.from({ length: 20 }, (_, index) => ({
            level: "log",
            message: `Log ${index}: complete text`,
          })),
        },
      })
      change = setResult
      return <ScriptConsole execution={result} focused />
    }
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 42, height: 8 },
    )
    const scroll = h.renderer.root.findDescendantById(
      "script-console-logs",
    ) as ScrollBoxRenderable
    await act(async () => h.renderOnce())
    expect(scroll.verticalScrollBar.visible).toBe(true)
    expect(
      scroll.verticalScrollBar.slider.foregroundColor.equals(
        RGBA.fromHex(THEMES[0]!.borderActive),
      ),
    ).toBe(true)
    await act(async () => {
      host.press("end")
      await h.renderOnce()
    })
    expect(h.captureCharFrame()).toContain("Log 19: complete text")
    const frame = h.captureCharFrame()
    await act(async () => {
      host.press("return")
      await h.renderOnce()
    })
    expect(h.captureCharFrame()).toBe(frame)
    await act(async () => {
      host.press("home")
      host.press("pagedown")
      await h.renderOnce()
    })
    expect(scroll.scrollTop).toBeGreaterThan(0)
    await act(async () => {
      change({
        tests: {
          evaluated: true,
          results: [],
          logs: [{ level: "info", message: "next execution" }],
        },
      })
    })
    await act(async () => {
      await h.renderOnce()
    })
    expect(scroll.scrollTop).toBe(0)
    expect(h.captureCharFrame()).toContain("next execution")
  })

  it("releases Tab and Shift+Tab without stopping at removed controls", async () => {
    const { keymap, host } = setupKeymap()
    const paneMoves: boolean[] = []
    keymap.intercept(
      "key",
      ({ event }) => {
        if (event.name === "tab") paneMoves.push(!!event.shift)
      },
      { priority: 100 },
    )
    await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ScriptConsole execution={execution} focused />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 12 },
    )
    await act(async () => host.press("tab"))
    expect(paneMoves).toEqual([false])
    await act(async () => host.press("tab", { shift: true }))
    expect(paneMoves).toEqual([false, true])
  })

  it("keeps execution order, times, phases, levels and redacted text without source labels", () => {
    const entries = scriptConsoleEntries(execution)
    expect(entries.map((x) => x.phase)).toEqual(["pre", "post", "tests"])
    expect(entries.map(formatConsoleEntry)).toEqual([
      "[1.0ms] pre INFO [REDACTED]",
      "[3.0ms] post WARN post warning",
      "[4.0ms] tests ERROR test failure",
    ])
  })

  it("shows all logs without a toolbar, preserves keyboard copy and isolates the next result inside Runner overlays", async () => {
    const { keymap } = setupKeymap()
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
    expect(h.captureCharFrame()).toContain("post warning")
    expect(h.captureCharFrame()).toMatch(/test\s+failure/)
    expect(h.captureCharFrame()).not.toContain("All levels")
    expect(h.captureCharFrame()).not.toContain("Copy")
    const copied = spyOn(clipboard, "copyToClipboard").mockReturnValue(true)
    try {
      await act(async () => copy.current?.())
      expect(copied.mock.calls[0]?.[0]).toBe(
        scriptConsoleEntries(execution).map(formatConsoleEntry).join("\n"),
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
