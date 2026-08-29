import { describe, expect, it } from "bun:test"
import { act, useRef, useState } from "react"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { CollectionRunnerView } from "../../src/ui/CollectionRunnerView"
import { useCollectionRunner } from "../../src/hooks/useCollectionRunner"
import { LeftBar } from "../../src/ui/borders"
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

const multiRequestCollection: Collection = {
  ...collection,
  items: ["one", "two", "three"].map((id) => ({
    type: "request" as const,
    data: {
      id,
      name: id,
      method: "GET" as const,
      url: `https://example.com/${id}`,
      headers: {},
      params: [],
      timeout: 0,
      tags:
        id === "two"
          ? undefined
          : id === "one"
            ? ["smoke"]
            : ["smoke", "a-very-long-regression-tag"],
    },
  })),
}

const folderCollection: Collection = {
  ...collection,
  items: [
    {
      type: "folder",
      data: {
        id: "albums",
        name: "Albums",
        path: "albums",
        children: [
          {
            type: "request",
            data: {
              id: "albums/create",
              name: "create-album",
              method: "POST",
              url: "https://example.com/albums",
              headers: {},
              params: [],
              timeout: 0,
            },
          },
          {
            type: "request",
            data: {
              id: "albums/list",
              name: "list-albums",
              method: "GET",
              url: "https://example.com/albums",
              headers: {},
              params: [],
              timeout: 0,
            },
          },
        ],
      },
    },
  ],
}

describe("CollectionRunnerView", () => {
  it("keeps runner and run result rows compact", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    const runCollection = (async () => {
      const results = multiRequestCollection.items.map((item) => {
        if (item.type !== "request") throw new Error("expected request")
        const { data } = item
        return {
          id: data.id,
          method: data.method,
          url: data.url,
          ok: true,
          failureCategories: [],
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "",
            timeMs: 1,
          },
        }
      })
      return {
        results,
        skipped: [],
        failed: false,
        summary: {
          selected: results.length,
          executed: results.length,
          skipped: 0,
          requestSuccesses: results.length,
          requestFailures: 0,
          assertionPasses: 0,
          assertionFailures: 0,
          captureFailures: 0,
          durationMs: 1,
          failureCategories: [],
        },
      }
    }) as typeof collectionRun
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection: multiRequestCollection,
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
              focus="runner-requests"
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onOpenResultDetail={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }

    const render = await testRender(<Harness />, { width: 120, height: 24 })
    await render.renderOnce()
    const firstRequest =
      render.renderer.root.findDescendantById("runner-row-0")!
    const secondRequest =
      render.renderer.root.findDescendantById("runner-row-1")!
    expect(firstRequest.height).toBe(1)
    expect(secondRequest.screenY - firstRequest.screenY).toBe(1)
    const requestRows = render
      .captureCharFrame()
      .split("\n")
      .filter((row) => ["one", "two", "three"].some((id) => row.includes(id)))
    expect(requestRows).toHaveLength(3)
    expect(requestRows[0]!.indexOf("GET")).toBe(requestRows[1]!.indexOf("GET"))
    expect(requestRows[0]!.indexOf("one")).toBe(requestRows[1]!.indexOf("two"))
    expect(requestRows[0]!.indexOf("#smoke")).toBe(
      requestRows[2]!.indexOf("#smoke"),
    )
    expect(requestRows.join("\n")).not.toContain("…")
    await act(async () => current!.run())
    await render.renderOnce()
    const resultFrame = render.captureCharFrame()
    expect(resultFrame).toMatch(/one\s+GET 200 OK/)
    const first = render.renderer.root.findDescendantById("runner-result-0")!
    const second = render.renderer.root.findDescendantById("runner-result-1")!
    expect(first.height).toBe(1)
    expect(second.screenY - first.screenY).toBe(1)
    cleanup()
  })

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
              onOpenResultDetail={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 80, height: 24 })
    await render.renderOnce()
    const frame = render.captureCharFrame()
    for (const label of ["Scope", "Environment", "Include tag", "Health"]) {
      expect(frame).toContain(label)
    }
    for (const index of [3, 4, 5]) {
      expect(
        render.renderer.root.findDescendantById(`runner-option-${index}`),
      ).not.toBeNull()
    }
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const option = render.renderer.root.findDescendantById(
        `runner-option-${index}`,
      ) as BoxRenderable
      expect(option.border).toEqual([...LeftBar.border])
    }
    expect(frame).toContain(
      "Run every request in the collection or selected folder.",
    )
    expect(frame).toContain("Select the environment used for this run.")
    await act(async () => current!.setOptionIndex(5))
    await render.renderOnce()
    await render.renderOnce()
    const scrolled = render.captureCharFrame()
    expect(scrolled).toContain("Exclude tag")
    expect(scrolled).toContain("Fail fast")
    expect(scrolled).toContain("Run 1 request")
    expect(scrolled).toContain("Save")
    cleanup()
  })

  it("renders folder rows with complete and partial selection states", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection: folderCollection,
        collectionDir: "/tmp/collection",
        folderPath: null,
        activeEnvironment: null,
        environmentNames: [],
        hasUnsavedChanges: false,
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
              focus="runner-requests"
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onOpenResultDetail={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }

    const render = await testRender(<Harness />, { width: 120, height: 24 })
    await render.renderOnce()
    const folderRow = render.renderer.root.findDescendantById("runner-row-0")!
    expect(render.captureCharFrame()).toContain("[x] FOLDER Albums")

    await act(async () =>
      render.mockMouse.click(
        folderRow.screenX + 1,
        folderRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("[ ] FOLDER Albums")

    await act(async () => current!.toggleSelected(0))
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("[-] FOLDER Albums")

    await act(async () =>
      render.mockMouse.click(
        folderRow.screenX + 1,
        folderRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("[x] FOLDER Albums")

    await act(async () =>
      render.mockMouse.click(
        folderRow.screenX + 1,
        folderRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("[ ] FOLDER Albums")
    cleanup()
  })

  it("resizes runner panes and restores the split on double click", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection: folderCollection,
        collectionDir: "/tmp/collection",
        folderPath: null,
        activeEnvironment: null,
        environmentNames: [],
        hasUnsavedChanges: false,
        noProxy: false,
        systemProxy: { bypass: [] },
        insecure: false,
        resetKey: 1,
      })
      return (
        <KeymapProvider
          keymap={
            keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
          }
        >
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <CollectionRunnerView
              runner={runner}
              focus="runner-requests"
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onOpenResultDetail={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }

    const render = await testRender(<Harness />, { width: 120, height: 24 })
    await render.renderOnce()
    const split = render.renderer.root.findDescendantById(
      "runner-split",
    ) as BoxRenderable
    const requestsPane = split.getChildren()[2] as BoxRenderable
    const requestRow = render.renderer.root.findDescendantById(
      "runner-row-1",
    ) as BoxRenderable
    const requestName = requestRow.getChildren()[2]!
    const initialNameWidth = requestName.width
    let handle = render.renderer.root.findDescendantById(
      "runner-resize-handle",
    ) as BoxRenderable
    const initialX = handle.screenX

    await act(async () => {
      await render.mockMouse.pressDown(
        handle.screenX,
        handle.screenY + Math.floor(handle.height / 2),
        MouseButtons.LEFT,
      )
      await render.mockMouse.moveTo(
        split.screenX + 100,
        handle.screenY + Math.floor(handle.height / 2),
      )
      await render.mockMouse.release(
        split.screenX + 100,
        handle.screenY + Math.floor(handle.height / 2),
        MouseButtons.LEFT,
      )
    })
    await render.renderOnce()
    handle = render.renderer.root.findDescendantById(
      "runner-resize-handle",
    ) as BoxRenderable
    expect(handle.screenX).toBeGreaterThan(initialX)
    expect(requestName.screenX + requestName.width).toBeLessThanOrEqual(
      requestsPane.screenX + requestsPane.width,
    )

    await act(async () => {
      await render.mockMouse.pressDown(
        handle.screenX,
        handle.screenY + Math.floor(handle.height / 2),
        MouseButtons.LEFT,
      )
      await render.mockMouse.moveTo(
        split.screenX + 20,
        handle.screenY + Math.floor(handle.height / 2),
      )
      await render.mockMouse.release(
        split.screenX + 20,
        handle.screenY + Math.floor(handle.height / 2),
        MouseButtons.LEFT,
      )
    })
    await render.renderOnce()
    expect(requestName.width).toBeGreaterThan(initialNameWidth)

    await act(async () => {
      await render.mockMouse.doubleClick(
        handle.screenX,
        handle.screenY + Math.floor(handle.height / 2),
        MouseButtons.LEFT,
      )
    })
    await render.renderOnce()
    handle = render.renderer.root.findDescendantById(
      "runner-resize-handle",
    ) as BoxRenderable
    expect(
      Math.abs(handle.screenX - (split.screenX + Math.floor(split.width / 2))),
    ).toBeLessThanOrEqual(1)
    cleanup()
  })

  it("opens executed result details without expanding the result row", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    let current: UseCollectionRunnerResult | null = null
    const opened: number[] = []
    const resultCollection: Collection = {
      ...collection,
      items: [
        ...collection.items,
        {
          type: "request",
          data: {
            id: "skipped",
            name: "Skipped",
            method: "GET",
            url: "https://example.com/skipped",
            headers: {},
            params: [],
            timeout: 0,
          },
        },
      ],
    }
    const runCollection = (async (
      ...args: Parameters<typeof collectionRun>
    ) => {
      args[10]?.({
        requestId: "health",
        entry: {
          timestamp: 1,
          request: {
            id: "health",
            name: "Health",
            method: "GET",
            url: "https://example.com/health",
            headers: {},
            params: [],
          },
          response: {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: '{"ready":true}',
            timeMs: 7,
            size: 14,
          },
        },
      })
      return {
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
        skipped: [{ id: "skipped", reason: "fail-fast" as const }],
        failed: false,
        summary: {
          selected: 2,
          executed: 1,
          skipped: 1,
          requestSuccesses: 1,
          requestFailures: 0,
          assertionPasses: 1,
          assertionFailures: 0,
          captureFailures: 0,
          durationMs: 7,
          failureCategories: [],
        },
      }
    }) as typeof collectionRun
    function Harness() {
      const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
      const runner = useCollectionRunner({
        collection: resultCollection,
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
              focus="runner-requests"
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={() => {}}
              onOpenResultDetail={(index) => opened.push(index)}
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
    expect(frame).toContain("Select")
    expect(frame).toContain("Results")
    expect(frame).toContain("1 passed · 0 failed · 1/2 executed")
    expect(frame).toMatch(/PASS\s+health\s+GET 200 OK · 7ms/)
    expect(frame).toContain("⏎")
    expect(
      frame.split("\n").find((line) => line.includes("skipped")),
    ).not.toContain("⏎")
    expect(frame).not.toContain('{"ready":true}')

    const resultRow =
      render.renderer.root.findDescendantById("runner-result-0")!
    const resultLine = resultRow.getChildren()[0] as BoxRenderable
    const resultName = resultLine.getChildren()[2] as BoxRenderable
    const initialResultNameWidth = resultName.width
    const split = render.renderer.root.findDescendantById(
      "runner-split",
    ) as BoxRenderable
    const handle = render.renderer.root.findDescendantById(
      "runner-resize-handle",
    ) as BoxRenderable
    await act(async () => {
      await render.mockMouse.pressDown(
        handle.screenX,
        handle.screenY,
        MouseButtons.LEFT,
      )
      await render.mockMouse.moveTo(split.screenX + 20, handle.screenY)
      await render.mockMouse.release(
        split.screenX + 20,
        handle.screenY,
        MouseButtons.LEFT,
      )
    })
    await render.renderOnce()
    expect(resultName.width).toBeGreaterThan(initialResultNameWidth)
    await act(async () =>
      render.mockMouse.click(
        resultRow.screenX + 1,
        resultRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await render.renderOnce()
    expect(opened).toEqual([0])
    expect(render.captureCharFrame()).not.toContain('{"ready":true}')

    const skippedRow =
      render.renderer.root.findDescendantById("runner-result-1")!
    await act(async () =>
      render.mockMouse.click(
        skippedRow.screenX + 1,
        skippedRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    expect(opened).toEqual([0])
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
              onOpenResultDetail={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }
    const render = await testRender(<Harness />, { width: 120, height: 24 })
    await render.renderOnce()
    await act(async () => current!.run())
    await render.renderOnce()
    expect(currentFocus as Focus).toBe("runner-requests")

    await act(async () => current!.showConfigure())
    await render.renderOnce()
    expect(currentFocus as Focus).toBe("runner-requests")
    cleanup()
  })
})
