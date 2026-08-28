import { describe, expect, it } from "bun:test"
import { act, useRef, useState } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { CollectionRunnerView } from "../../src/ui/CollectionRunnerView"
import { useCollectionRunner } from "../../src/hooks/useCollectionRunner"
import type { UseCollectionRunnerResult } from "../../src/hooks/useCollectionRunner"
import type { Focus } from "../../src/ui/focus"
import type { Collection } from "../../src/schema"
import type { collectionRun } from "../../src/app/services"

const testRender = createTestRender()
const collection: Collection = {
  id: "collection",
  name: "Collection",
  items: [
    {
      type: "request",
      data: {
        id: "health",
        name: "Health",
        method: "GET",
        url: "https://example.com/health",
        headers: {},
        params: [],
        timeout: 0,
      },
    },
  ],
}

describe("CollectionRunnerView", () => {
  it("preserves every configuration control and dirty warning at 80x24", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection,
        collectionDir: "/tmp/collection",
        folderPath: null,
        activeEnvironment: "development",
        environmentNames: ["development"],
        hasUnsavedChanges: true,
        noProxy: false,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 1,
      })
      current = runner
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionRunnerView
              runner={runner}
              focus="runner-options"
              hasUnsavedChanges
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onEditRequestTab={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 80, height: 24 })
    await render.renderOnce()
    const frame = render.captureCharFrame()
    for (const label of ["Scope", "Environment", "Include tag", "health"]) {
      expect(frame).toContain(label)
    }
    for (const index of [3, 4, 5]) {
      expect(
        render.renderer.root.findDescendantById(`runner-option-${index}`),
      ).not.toBeNull()
    }
    await act(async () => current!.setOptionIndex(5))
    await render.renderOnce()
    await render.renderOnce()
    const scrolled = render.captureCharFrame()
    expect(scrolled).toContain("Exclude tag")
    expect(scrolled).toContain("Fail fast")
    expect(scrolled).toContain("Run 1 request")
    expect(scrolled).toContain(
      "Save pending changes in the request workspace before",
    )
    cleanup()
  })

  it("renders ordered response details and opens the focused request editors", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    const edits: string[] = []
    const runCollection = (async () => ({
      results: [
        {
          id: "health",
          method: "GET" as const,
          url: "https://example.com/health",
          ok: true,
          failureCategories: [],
          response: {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: '{"ready":true}',
            timeMs: 7,
          },
          assertions: {
            evaluated: true,
            results: [
              {
                expression: "status",
                operator: "equals" as const,
                expected: 200,
                actual: 200,
                passed: true,
                message: "passed",
              },
            ],
          },
          captures: {
            evaluated: true,
            results: [
              {
                variable: "token",
                expression: "body.token",
                success: true,
                value: "[REDACTED]",
                type: "string" as const,
              },
            ],
          },
        },
      ],
      skipped: [],
      failed: false,
      summary: {
        selected: 1,
        executed: 1,
        skipped: 0,
        requestSuccesses: 1,
        requestFailures: 0,
        assertionPasses: 1,
        assertionFailures: 0,
        captureFailures: 0,
        durationMs: 7,
        failureCategories: [],
      },
    })) as typeof collectionRun
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection,
        collectionDir: "/tmp/collection",
        folderPath: null,
        activeEnvironment: null,
        environmentNames: [],
        hasUnsavedChanges: false,
        noProxy: false,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 1,
        runCollection,
      })
      current = runner
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionRunnerView
              runner={runner}
              focus="runner-detail"
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onEditRequestTab={(id, tab) => edits.push(`${id}:${tab}`)}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 120, height: 32 })
    await render.renderOnce()
    await act(async () => current!.run())
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("1 passed · 0 failed · 1/1 executed")
    expect(frame).toContain("200 OK · 7ms")
    expect(frame).toContain('{"ready":true}')
    expect(frame).toContain(
      "Available to later requests in this collection run.",
    )

    const captureRow =
      render.renderer.root.findDescendantById("response-capture-0")!
    await act(async () =>
      render.mockMouse.click(
        captureRow.screenX + 3,
        captureRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await act(async () => render.renderOnce())
    const expandedFrame = render.captureCharFrame()
    expect(expandedFrame).toContain("[REDACTED]")

    const rows = expandedFrame.split("\n")
    const actionRow = rows.findIndex((row) => row.includes("Edit Assert"))
    await act(async () => {
      await render.mockMouse.click(
        rows[actionRow]!.indexOf("Edit Assert"),
        actionRow,
        MouseButtons.LEFT,
      )
      await render.mockMouse.click(
        rows[actionRow]!.indexOf("Edit Capture"),
        actionRow,
        MouseButtons.LEFT,
      )
    })
    expect(edits).toEqual(["health:assertions", "health:captures"])
    cleanup()
  })

  it("moves focus to the visible pane when the phase changes", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    let currentFocus: Focus = "runner-options"
    const runCollection = (async () => ({
      results: [],
      skipped: [],
      failed: false,
      summary: {
        selected: 1,
        executed: 0,
        skipped: 0,
        requestSuccesses: 0,
        requestFailures: 0,
        assertionPasses: 0,
        assertionFailures: 0,
        captureFailures: 0,
        durationMs: 1,
        failureCategories: [],
      },
    })) as typeof collectionRun
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const [focus, setFocus] = useState<Focus>("runner-options")
      const runner = useCollectionRunner({
        collection,
        collectionDir: "/tmp/collection",
        folderPath: null,
        activeEnvironment: null,
        environmentNames: [],
        hasUnsavedChanges: false,
        noProxy: false,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 1,
        runCollection,
      })
      current = runner
      currentFocus = focus
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionRunnerView
              runner={runner}
              focus={focus}
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={setFocus}
              onEditRequestTab={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 120, height: 24 })
    await render.renderOnce()
    await act(async () => current!.run())
    await render.renderOnce()
    expect(currentFocus as Focus).toBe("runner-results")

    await act(async () => current!.showConfigure())
    await render.renderOnce()
    expect(currentFocus as Focus).toBe("runner-options")
    cleanup()
  })
})
