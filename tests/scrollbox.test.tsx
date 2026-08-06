import { describe, it, expect } from "bun:test"
import { act, useMemo, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import { RGBA, ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Request, KvEntry, CollectionItem } from "../src/schema"
import type { VisibleNode } from "../src/ui/tree"
import { Sidebar } from "../src/ui/Sidebar"
import { RequestPane } from "../src/ui/RequestPane"
import { ResponsePane } from "../src/ui/ResponsePane"
import type { SendState } from "../src/ui/sendState"
import { initialEditState } from "../src/ui/editMode"
import type { EditState, FieldKind } from "../src/ui/editMode"
import type { ResponseQueryController } from "../src/ui/responseQuery"

import { ThemeProvider, THEMES } from "../src/ui/theme"
import type { Keymap } from "@opentui/keymap"
import type { Renderable, KeyEvent } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { MouseButtons } from "@opentui/core/testing"
import { visibleNodes } from "../src/ui/tree"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../src/ui/editor/CodeEditor"
import { keyEvent } from "./unit/_helpers"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})

type OpenTuiKeymap = Keymap<Renderable, KeyEvent>

function makeRequest(i: number): Request {
  return {
    id: `req-${i}`,
    name: `Very long request name to truncate ${i}`,
    method: i % 2 === 0 ? "GET" : "POST",
    url: `http://example.com/${i}`,
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
  }
}

let lastSidebarSelection = ""
let lastSidebarCursor = 0

function SidebarNavigationHarness() {
  const items = useMemo<CollectionItem[]>(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        type: "request" as const,
        data: makeRequest(i),
      })),
    [],
  )
  const visibleItems = useMemo(() => visibleNodes(items, new Set()), [items])
  const [cursorIndex, setCursorIndex] = useState(0)
  const [selectedId, setSelectedId] = useState("req-0")
  lastSidebarCursor = cursorIndex

  useKeyboard((key) => {
    if (key.name !== "down") return
    const next = Math.min(cursorIndex + 1, visibleItems.length - 1)
    setCursorIndex(next)
    setSelectedId(visibleItems[next].id)
  })

  return (
    <Sidebar
      items={items}
      loading={false}
      error={null}
      visibleItems={visibleItems}
      cursorIndex={cursorIndex}
      selectedId={selectedId}
      expanded={new Set()}
      focused
      onRequestSelect={(id) => {
        lastSidebarSelection = id
        setSelectedId(id)
        setCursorIndex(visibleItems.findIndex((node) => node.id === id))
      }}
    />
  )
}

function findSidebarScrollbox(requestRow: Renderable): ScrollBoxRenderable {
  let current: Renderable | null = requestRow
  while (current) {
    if (current instanceof ScrollBoxRenderable) return current
    current = current.parent
  }
  throw new Error("Sidebar scrollbox not found")
}

function expectThemedScrollbar(root: Renderable, id: string, visible: boolean) {
  const scrollbox = root.findDescendantById(id)
  expect(scrollbox).toBeInstanceOf(ScrollBoxRenderable)
  const scrollbar = (scrollbox as ScrollBoxRenderable).verticalScrollBar
  expect(scrollbar.visible).toBe(visible)
  expect(
    scrollbar.slider.backgroundColor.equals(
      RGBA.fromHex(THEMES[0]!.background),
    ),
  ).toBe(true)
  expect(
    scrollbar.slider.foregroundColor.equals(
      RGBA.fromHex(THEMES[0]!.borderActive),
    ),
  ).toBe(true)
}

describe("ResponsePane scrollbox", () => {
  it("filters the body through the JSONPath query bar and exposes the visible result for copying", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({
          data: { group: { items: [{ id: 1 }, { id: 2 }] } },
        }),
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const copyBody = { current: null as string | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    let queryOpenCount = 0
    keymap.setData("app.overlay", "none")
    keymap.registerLayer({
      commands: [
        {
          name: "response.query",
          enabled: () => queryController.current?.canOpen() ?? false,
          run: () => {
            queryOpenCount += 1
            return queryController.current?.open()
          },
        },
      ],
      bindings: [{ key: "/", cmd: "response.query" }],
    })
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={state}
          focused
          responseKey="request-1"
          responseQueryRef={queryController}
          responseBodyForCopyRef={copyBody}
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()

    await act(async () => {
      expect(queryController.current?.open()).toBe(true)
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("JSONPath")

    await act(async () => mockInput.typeText("$.data.group.items[*].id"))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 175))
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("2 matches")
    expect(copyBody.current).toBe("[\n  1,\n  2\n]")

    await act(async () => raw.host.press("escape"))
    await renderOnce()

    expect(captureCharFrame()).not.toContain("JSONPath")
    expect(copyBody.current).toBe(state.response.body)

    await act(async () => {
      expect(queryController.current?.open()).toBe(true)
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("JSONPath")
    expect(queryOpenCount).toBe(0)

    await act(async () => raw.host.press("/"))
    expect(queryOpenCount).toBe(0)
    await act(async () => mockInput.typeText("/"))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 175))
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("0 matches")
  })

  it("scrolls to the top when JSONPath changes the displayed body", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({
          items: Array.from({ length: 60 }, (_, id) => ({ id, active: true })),
        }),
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={state}
          focused
          responseQueryRef={queryController}
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    await renderOnce()

    await act(async () => {
      expect(queryController.current?.open()).toBe(true)
    })
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "response-body-editor",
    ) as CodeEditorRenderable
    editor.scrollTo(20)
    await renderOnce()
    expect(editor.scrollY).toBe(20)

    await act(async () => mockInput.typeText("$.items[*].id"))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 175))
    })
    await renderOnce()

    expect(editor.totalVirtualLineCount).toBeGreaterThan(editor.viewport.height)
    expect(editor.scrollY).toBe(0)
  })

  it("only opens the query from the Body tab", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={state}
          focused
          initialTab="headers"
          responseQueryRef={queryController}
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()

    expect(queryController.current?.canOpen()).toBe(false)
    await act(async () => mockInput.pressKey("ARROW_LEFT"))
    await renderOnce()
    expect(queryController.current?.canOpen()).toBe(true)
  })

  it("scrolls the network trace", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "ok",
        timeMs: 12,
        network: Array.from({ length: 20 }, (_, i) => ({
          timeMs: i,
          type: "request" as const,
          message: `event ${i}`,
        })),
      },
    } satisfies SendState
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame, mockInput } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ResponsePane state={state} focused initialTab="network" />
        </KeymapProvider>,
        { width: 80, height: 16 },
      )
    await renderOnce()
    await renderOnce()
    expect(captureCharFrame()).toContain("event 0")
    expectThemedScrollbar(renderer.root, "network-tab-scrollbox", true)
    await act(async () => mockInput.pressKey("END"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    expect(captureCharFrame()).toContain("event 19")
  })

  it("shows a themed scrollbar for overflowing response headers", async () => {
    const headers = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`x-header-${i}`, `value-${i}`]),
    )
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{
            status: "done",
            response: {
              status: 200,
              statusText: "OK",
              headers,
              body: "",
              timeMs: 1,
            },
          }}
          focused
          initialTab="headers"
        />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    await renderOnce()

    expectThemedScrollbar(renderer.root, "response-headers-scrollbox", true)
  })

  it("hides the response headers scrollbar when content fits", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{
            status: "done",
            response: {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: "",
              timeMs: 1,
            },
          }}
          focused
          initialTab="headers"
        />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    await renderOnce()

    expectThemedScrollbar(renderer.root, "response-headers-scrollbox", false)
  })

  it("shows network activity while sending", async () => {
    const state = {
      status: "sending" as const,
      request: makeRequest(1),
      network: [
        { timeMs: 0, type: "request" as const, message: "GET example" },
      ],
    } satisfies SendState
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane state={state} focused initialTab="body" />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Sending")
    await act(async () => mockInput.pressKey("ARROW_RIGHT"))
    await act(async () => mockInput.pressKey("ARROW_RIGHT"))
    await renderOnce()
    expect(captureCharFrame()).toContain("GET example")
  })

  it("renders trace events after a failed request", async () => {
    const error = Object.assign(new Error("offline"), {
      network: [
        { timeMs: 0, type: "request" as const, message: "GET example" },
        { timeMs: 2, type: "error" as const, message: "offline" },
      ],
    })
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{ status: "error", request: makeRequest(1), error }}
          focused
          initialTab="network"
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("GET example")
  })

  it("shows no response headers after a failed request", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{
            status: "error",
            request: makeRequest(1),
            error: new Error("offline"),
          }}
          focused
          initialTab="headers"
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No response headers available.")
  })

  it("shows JSONPath errors in the filter bar", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({ data: [{ id: 1 }] }),
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={state}
          focused
          responseQueryRef={queryController}
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    await act(async () => {
      expect(queryController.current?.open()).toBe(true)
    })
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$.data[?(")
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 175))
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("Invalid query syntax")
  })

  it("explains when JSONPath filtering is unavailable", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "not json",
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={state}
          focused
          responseQueryRef={queryController}
        />
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await renderOnce()
    await act(async () => {
      expect(queryController.current?.open()).toBe(true)
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("Response body is not valid JSON")
  })

  it("keeps response metadata on the bottom border", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "x".repeat(120),
        timeMs: 42,
      },
    } satisfies SendState

    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <box style={{ width: "100%", height: "100%" }}>
          <ResponsePane state={state} focused />
        </box>
      </KeymapProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    const metadataLine = captureCharFrame()
      .split("\n")
      .find((line: string) => line.includes("120B") && line.includes("42ms"))
    expect(metadataLine).toBeDefined()
    expect(metadataLine ?? "").toMatch(/[┌└]/)
  })

  it("renders with large response body without overflowing", async () => {
    const longBody = JSON.stringify(
      {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
        })),
      },
      null,
      2,
    )

    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: longBody,
        timeMs: 0,
      },
    } satisfies SendState

    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame, mockInput, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ResponsePane state={state} focused={true} />
        </KeymapProvider>,
        { width: 80, height: 12 },
      )
    await renderOnce()
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // The editor clips: only some of 100 items are visible.
    const bodyLines = frame
      .split("\n")
      .filter((l: string) => l.includes("item-"))
    expect(bodyLines.length).toBeGreaterThan(0)
    expect(bodyLines.length).toBeLessThan(100)

    const bodyEditor = renderer.root.findDescendantById("response-body-editor")
    expect(bodyEditor).toBeInstanceOf(CodeEditorRenderable)
    const editor = bodyEditor as CodeEditorRenderable
    const bodyScrollbar = renderer.root.findDescendantById(
      "response-body-scrollbar",
    )
    expect(bodyScrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    const scrollbar = bodyScrollbar as CodeEditorScrollBarRenderable
    expect(scrollbar.visible).toBe(true)

    await act(async () => {
      await mockMouse.click(
        scrollbar.screenX,
        scrollbar.screenY + scrollbar.height - 1,
      )
    })
    await renderOnce()
    expect(editor.scrollY).toBeGreaterThan(0)

    await act(async () => mockInput.pressKey("END"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    expect(captureCharFrame()).toContain("item-99")

    await act(async () => mockInput.pressKey("HOME"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    expect(captureCharFrame()).toContain("item-0")
  })

  it("extends response body selections while dragging beyond the viewport", async () => {
    const body = Array.from(
      { length: 30 },
      (_, index) => `response line ${index}`,
    ).join("\n")
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ResponsePane
            state={{
              status: "done",
              response: {
                status: 200,
                statusText: "OK",
                headers: {},
                body,
                timeMs: 1,
              },
            }}
            focused
          />
        </KeymapProvider>,
        { width: 48, height: 12 },
      )
    await renderOnce()
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "response-body-editor",
    ) as CodeEditorRenderable
    const rows = captureCharFrame().split("\n")
    const firstBodyRow = rows.find((row) => row.includes("response line 0"))
    if (!firstBodyRow) throw new Error("Expected the first response body row")
    const x = firstBodyRow.indexOf("response") + 1
    const y = rows.indexOf(firstBodyRow)
    await act(async () => {
      await mockMouse.pressDown(x, y, MouseButtons.LEFT)
      await mockMouse.moveTo(x, y + 1)
    })
    expect(editor.hasSelection()).toBe(true)
    await act(async () => {
      await mockMouse.moveTo(x, editor.y + editor.height, {
        delayMs: 25,
      })
    })
    expect(editor.hasSelection()).toBe(true)
    for (let frame = 0; frame < 4; frame++) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      await renderOnce()
    }

    expect(editor.scrollY).toBeGreaterThan(0)
    const selectedText = editor.getSelectedText()
    expect(selectedText).toContain("esponse line 0")
    expect(selectedText).toContain("response line 4")

    await act(async () => {
      await mockMouse.release(x, editor.y + editor.height)
    })
    const scrollAfterRelease = editor.scrollY
    await new Promise((resolve) => setTimeout(resolve, 50))
    await renderOnce()
    expect(editor.scrollY).toBe(scrollAfterRelease)

    editor.clearSelection()
    editor.setCursor(0, 0)
    editor.focus()
    expect(editor.focused).toBe(true)
    for (let press = 0; press < 8; press++) {
      editor.handleKeyPress(keyEvent("down", { shift: true }))
    }
    await renderOnce()
    expect(editor.scrollY).toBeGreaterThan(0)
    expect(editor.getSelectedText()).toContain("response line 0")
    expect(editor.getSelectedText()).toContain("response line 5")
  })

  it("hides the response body scrollbar when the body fits", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{
            status: "done",
            response: {
              status: 200,
              statusText: "OK",
              headers: {},
              body: '{"ok":true}',
              timeMs: 1,
            },
          }}
          focused
        />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    await renderOnce()

    const bodyScrollbar = renderer.root.findDescendantById(
      "response-body-scrollbar",
    )
    expect(bodyScrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    expect((bodyScrollbar as CodeEditorScrollBarRenderable).visible).toBe(false)
  })

  it("folds the response body from the keyboard", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame, mockInput, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ResponsePane
            state={{
              status: "done",
              response: {
                status: 200,
                statusText: "OK",
                headers: {},
                body: '{\n  "before": true,\n  "data": {\n    "id": 1\n  },\n  "after": "next"\n}',
                timeMs: 1,
              },
            }}
            focused
          />
        </KeymapProvider>,
        { width: 80, height: 12 },
      )
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()

    const bodyEditor = renderer.root.findDescendantById("response-body-editor")
    expect(bodyEditor).toBeInstanceOf(CodeEditorRenderable)
    const editor = bodyEditor as CodeEditorRenderable
    expect(editor.getFoldSigns().has(0)).toBe(true)

    await act(async () => mockInput.pressKey("F5"))
    await renderOnce()
    expect(editor.lineCount).toBeLessThan(7)

    await act(async () => mockInput.pressKey("F6"))
    await renderOnce()
    expect(editor.lineCount).toBe(7)

    editor.toggleFold(2)
    await renderOnce()
    const foldedFrame = captureCharFrame()
    const dataFoldLine = foldedFrame
      .split("\n")
      .find((line) => line.includes('"data": {... }'))
    expect(dataFoldLine).toMatch(/▶ {2}3 /)
    const afterLine = foldedFrame
      .split("\n")
      .find((line) => line.includes('"after"'))
    expect(afterLine).toMatch(/\b6\s+"after"/)

    editor.unfoldAll()
    await renderOnce()

    const rows = captureCharFrame().split("\n")
    const row = rows.find((line) => line.includes("▼") && line.includes("{"))
    if (!row) throw new Error("Expected response fold icon")
    await act(async () => {
      await mockMouse.click(row.indexOf("▼"), rows.indexOf(row))
    })
    await renderOnce()
    expect(editor.lineCount).toBeLessThan(7)
  })

  it("keeps folded response source numbers beside their gutter signs", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const body = `{
  "first": {
    "value": 1
  },
  "filler0": 0,
  "filler1": 1,
  "filler2": 2,
  "filler3": 3,
  "filler4": 4,
  "filler5": 5,
  "filler6": 6,
  "filler7": 7,
  "second": {
    "value": 8
  }
}`
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane
          state={{
            status: "done",
            response: {
              status: 200,
              statusText: "OK",
              headers: {},
              body,
              timeMs: 1,
            },
          }}
          focused
        />
      </KeymapProvider>,
      { width: 48, height: 20 },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "response-body-editor",
    ) as CodeEditorRenderable
    for (const line of [12, 1]) editor.toggleFold(line)
    await renderOnce()

    const foldLines = captureCharFrame()
      .split("\n")
      .filter((line) => line.includes("▶"))
    const oneDigitLine = foldLines.find((line) => /▶ {2}2 /.test(line))
    const twoDigitLine = foldLines.find((line) => /▶ {1}13 /.test(line))
    if (!oneDigitLine || !twoDigitLine)
      throw new Error("Expected one- and two-digit folded source labels")

    const oneDigitGap = oneDigitLine.indexOf("2") - oneDigitLine.indexOf("▶")
    const twoDigitGap = twoDigitLine.indexOf("13") - twoDigitLine.indexOf("▶")
    expect(oneDigitGap).toBe(3)
    expect(twoDigitGap).toBe(2)
  })

  it("keeps bodies above 5 MB raw until v is pressed", async () => {
    const body = `{"payload":"${"x".repeat(5 * 1024 * 1024)}"}`
    let bodyEditorAvailable: boolean | undefined
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame, mockInput } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ResponsePane
            state={{
              status: "done",
              response: {
                status: 200,
                statusText: "OK",
                headers: {},
                body,
                timeMs: 1,
              },
            }}
            focused
            onBodyEditorAvailableChange={(available) => {
              bodyEditorAvailable = available
            }}
          />
        </KeymapProvider>,
        { width: 80, height: 12 },
      )
    await renderOnce()
    expect(captureCharFrame()).toContain("not rendered automatically")
    expect(renderer.root.findDescendantById("response-body-editor")).toBe(
      undefined,
    )
    expect(bodyEditorAvailable).toBe(false)

    await act(async () => mockInput.pressKey("v"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await renderOnce()
    const bodyEditor = renderer.root.findDescendantById("response-body-editor")
    expect(bodyEditor).toBeInstanceOf(CodeEditorRenderable)
    expect((bodyEditor as CodeEditorRenderable).plainText).toBe(body)
    expect(bodyEditorAvailable).toBe(true)
  })
})

describe("RequestPane scrollbox", () => {
  it("renders with many headers without overflowing", async () => {
    const manyHeaders: Record<string, KvEntry> = {}
    for (let i = 0; i < 30; i++) {
      manyHeaders[`X-Header-${i}`] = { value: `value-${i}`, enabled: true }
    }

    const request: Request = {
      id: "test",
      name: "Test",
      method: "GET",
      url: "http://example.com",
      headers: manyHeaders,
      params: [],
      body: "",
      timeout: 0,
    }

    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <RequestPane
          request={request}
          editState={initialEditState()}
          editKey=""
          editValue=""
          setEditKey={() => {}}
          setEditValue={() => {}}
          focused={true}
          activeTab="headers"
        />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // scrollbox clips: only some of 30 headers visible
    const headerLines = frame
      .split("\n")
      .filter((l: string) => l.includes("X-Header-"))
    expect(headerLines.length).toBeGreaterThan(0)
    expect(headerLines.length).toBeLessThan(30)

    // scroll indicator present (proves overflow rendering)
    expect(frame).toMatch(/[▀▄▌]/)
    expectThemedScrollbar(renderer.root, "request-tab-scrollbox", true)
  })

  it("hides the request tab scrollbar when content fits", async () => {
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <RequestPane
          request={makeRequest(1)}
          editState={initialEditState()}
          editKey=""
          editValue=""
          setEditKey={() => {}}
          setEditValue={() => {}}
          focused
          activeTab="headers"
        />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    await renderOnce()

    expectThemedScrollbar(renderer.root, "request-tab-scrollbox", false)
  })

  it("browse cursor highlights header row with background highlight", async () => {
    const headers: Record<string, KvEntry> = {
      "Content-Type": { value: "application/json", enabled: true },
      Authorization: { value: "Bearer token", enabled: true },
    }

    const request: Request = {
      id: "test",
      name: "Test",
      method: "GET",
      url: "http://example.com",
      headers,
      params: [],
      body: "",
      timeout: 0,
    }

    const editState: EditState = {
      mode: "browsing",
      cursor: { field: "headers", row: 0, addingRow: false },
      editingRow: -1,
    }

    const raw2 = createTestKeymap()
    const keymap2 = raw2.keymap as unknown as OpenTuiKeymap
    keymap2.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap2}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestPane
            request={request}
            editState={editState}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            focused={true}
            activeTab="headers"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()

    // No LeftBar ┃ and no header labels (removed)
    const charFrame = captureCharFrame()
    expect(charFrame).toContain("Authorization")
    expect(charFrame).toContain("Bearer token")

    // Authorization (highlighted row) text span has no INVERSE and no primary bg
    const spanFrame = captureSpans()
    const allSpans = spanFrame.lines.flatMap((l) => l.spans)
    const authSpan = allSpans.find((s) => s.text.includes("Authorization"))
    expect(authSpan).toBeDefined()
    expect(authSpan!.attributes & TextAttributes.INVERSE).toBe(0)
    // No primary background on active row (uses backgroundElement instead)
    expect(authSpan!.bg.equals(RGBA.fromInts(250, 178, 131))).toBe(false)
  })

  it("renders missing URL path tokens as empty path rows", async () => {
    const request: Request = {
      id: "test",
      name: "Test",
      method: "GET",
      url: "https://example.com/posts/:post_id?key=val1",
      headers: {},
      params: [],
      body: "",
      timeout: 0,
    }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <RequestPane
            request={request}
            editState={initialEditState()}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            focused={true}
            activeTab="pathParams"
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("post_id")
  })

  it("renders every path param after switching from headers", async () => {
    const headers: Record<string, KvEntry> = {}
    for (let i = 0; i < 30; i++) {
      headers[`X-Header-${i}`] = { value: `value-${i}`, enabled: true }
    }
    const request: Request = {
      id: "compliance-audit-items",
      name: "Get compliance audit items for a domain",
      method: "GET",
      url: "$base_url/v1/domains/:id/compliance-audits/:complianceAuditId/compliance-audit-items",
      headers,
      params: [],
      pathParams: [
        { name: "id", value: "", enabled: true },
        { name: "complianceAuditId", value: "", enabled: true },
      ],
      body: "",
      timeout: 0,
    }
    let setTab: ((tab: FieldKind) => void) | undefined

    function SwitchingPane() {
      const [activeTab, setActiveTab] = useState<FieldKind>("headers")
      setTab = setActiveTab
      return (
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <RequestPane
              request={request}
              editState={initialEditState()}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </ThemeProvider>
        </KeymapProvider>
      )
    }

    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <SwitchingPane />,
      { width: 80, height: 12 },
    )
    await renderOnce()

    await act(async () => {
      for (let i = 0; i < 22; i++) {
        await mockMouse.scroll(20, 4, "down")
      }
    })
    await renderOnce()
    const headersFrame = captureCharFrame()
    expect(headersFrame).not.toContain("X-Header-0")
    expect(headersFrame).toContain("X-Header-29")

    await act(async () => setTab?.("pathParams"))
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("id")
    expect(frame).toContain("complianceAuditId")
  })
})

describe("Sidebar scrollbox", () => {
  it("does not scroll when navigating after selecting a request with the mouse", async () => {
    lastSidebarSelection = ""
    lastSidebarCursor = 0
    const { renderer, renderOnce, mockInput, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
          <box style={{ flexDirection: "row", flexGrow: 1 }}>
            <SidebarNavigationHarness />
          </box>
        </box>
      </ThemeProvider>,
      { width: 40, height: 24 },
    )
    await renderOnce()
    await renderOnce()

    const requestRow = renderer.root.findDescendantById("so-req-0")
    expect(requestRow).toBeDefined()
    const scrollbox = findSidebarScrollbox(requestRow!)

    await act(async () => mockMouse.click(10, requestRow!.screenY))
    await renderOnce()

    expect(lastSidebarSelection).toBe("req-0")
    expect(lastSidebarCursor).toBe(0)
    expect(scrollbox.focused).toBe(false)

    await act(async () => mockInput.pressArrow("down"))
    await renderOnce()

    expect(lastSidebarCursor).toBe(1)
    expect(scrollbox.scrollTop).toBe(0)
  })

  it("renders without crashing with many requests", async () => {
    const requests = Array.from({ length: 50 }, (_, i) => makeRequest(i))
    const items: CollectionItem[] = requests.map((r) => ({
      type: "request",
      data: r,
    }))
    const visibleItems: VisibleNode[] = requests.map((r) => ({
      type: "request" as const,
      id: r.id,
      name: r.name,
      depth: 0,
      expanded: false,
      hasChildren: false,
      method: r.method,
    }))

    const { renderOnce, captureCharFrame } = await testRender(
      <Sidebar
        items={items}
        loading={false}
        error={null}
        visibleItems={visibleItems}
        cursorIndex={5}
        selectedId="req-5"
        expanded={new Set()}
        focused={true}
      />,
      { width: 80, height: 24 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    const lines = frame.split("\n").filter((l) => l.trim() !== "")
    expect(lines.length).toBeLessThan(50)

    // Text truncated to fit sidebar width; check truncated form present
    expect(frame).toContain("Very long request\u2026")
    // Should render many entries without crashing
    const count = (frame.match(/Very long request\u2026/g) || []).length
    expect(count).toBeGreaterThan(10)
  })

  it("selected request has LeftBar border and no INVERSE instead of primary background", async () => {
    const requests = Array.from({ length: 5 }, (_, i) => makeRequest(i))
    const items: CollectionItem[] = requests.map((r) => ({
      type: "request",
      data: r,
    }))
    const visibleItems: VisibleNode[] = requests.map((r) => ({
      type: "request" as const,
      id: r.id,
      name: r.name,
      depth: 0,
      expanded: false,
      hasChildren: false,
      method: r.method,
    }))

    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          items={items}
          loading={false}
          error={null}
          visibleItems={visibleItems}
          cursorIndex={2}
          selectedId="req-2"
          expanded={new Set()}
          focused={true}
          jumpMode
        />
      </ThemeProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()

    // Verify LeftBar border character is present for selected item
    const charFrame = captureCharFrame()
    expect(charFrame).toContain("┃")
    expect(charFrame).toContain(" s ")

    // Verify no span uses INVERSE
    const spanFrame = captureSpans()
    const allSpans = spanFrame.lines.flatMap((l) => l.spans)
    for (const s of allSpans) {
      expect(s.attributes & TextAttributes.INVERSE).toBe(0)
    }

    // Verify no span has primary background
    const spanWithPrimaryBg = allSpans.find((s) =>
      s.bg.equals(RGBA.fromInts(250, 178, 131)),
    )
    expect(spanWithPrimaryBg).toBeUndefined()
  })
})

describe("App layout stability", () => {
  it("renders all three panes together without overflow", async () => {
    const requests = Array.from({ length: 50 }, (_, i) => makeRequest(i))
    const items: CollectionItem[] = requests.map((r) => ({
      type: "request",
      data: r,
    }))
    const visibleItems: VisibleNode[] = requests.map((r) => ({
      type: "request" as const,
      id: r.id,
      name: r.name,
      depth: 0,
      expanded: false,
      hasChildren: false,
      method: r.method,
    }))

    const manyHeaders: Record<string, KvEntry> = {}
    for (let i = 0; i < 30; i++) {
      manyHeaders[`X-Header-${i}`] = { value: `value-${i}`, enabled: true }
    }

    const request: Request = {
      id: "req-0",
      name: "Request 0",
      method: "GET",
      url: "http://example.com",
      headers: manyHeaders,
      params: [],
      body: "",
      timeout: 0,
    }

    const longBody = JSON.stringify(
      {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
        })),
      },
      null,
      2,
    )
    const responseState = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: longBody,
        timeMs: 0,
      },
    } satisfies SendState

    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
          <box style={{ flexDirection: "row", flexGrow: 1 }}>
            <Sidebar
              items={items}
              loading={false}
              error={null}
              visibleItems={visibleItems}
              cursorIndex={3}
              selectedId="req-3"
              expanded={new Set()}
              focused={false}
            />
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              <RequestPane
                request={request}
                editState={initialEditState()}
                editKey=""
                editValue=""
                setEditKey={() => {}}
                setEditValue={() => {}}
                focused={false}
                activeTab="headers"
              />
              <ResponsePane state={responseState} focused={false} />
            </box>
          </box>
        </box>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // All three panes contribute content
    expect(frame).toContain("Request")
    expect(frame).toContain("Response")
    expect(frame).toContain("X-Header-")
    expect(frame).toContain("item-")
  })
})
