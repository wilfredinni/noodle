import { describe, it, expect } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { RGBA, TextAttributes } from "@opentui/core"
import type { Request, KvEntry, CollectionItem } from "../src/schema"
import type { VisibleNode } from "../src/ui/tree"
import { Sidebar } from "../src/ui/Sidebar"
import { RequestPane } from "../src/ui/RequestPane"
import { ResponsePane } from "../src/ui/ResponsePane"
import type { SendState } from "../src/ui/sendState"
import { initialEditState } from "../src/ui/editMode"
import type { EditState } from "../src/ui/editMode"
import type { ResponseQueryController } from "../src/ui/responseQuery"

import { ThemeProvider } from "../src/ui/theme"
import type { Keymap } from "@opentui/keymap"
import type { Renderable, KeyEvent } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"

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

describe("ResponsePane scrollbox", () => {
  it("filters the body through the JSONPath query bar and exposes the visible result for copying", async () => {
    const state = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({ data: { items: [{ id: 1 }, { id: 2 }] } }),
        timeMs: 1,
      },
    } satisfies SendState
    const queryController = { current: null as ResponseQueryController | null }
    const copyBody = { current: null as string | null }
    const raw = createTestKeymap()
    const keymap = raw.keymap as unknown as OpenTuiKeymap
    keymap.setData("app.overlay", "none")
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

    await act(async () => mockInput.typeText("$.data.items[*].id"))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 175))
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("2 matches")
    expect(copyBody.current).toBe("[\n  1,\n  2\n]")
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
          <ResponsePane state={state} focused expandHint="f2 expand" />
        </box>
      </KeymapProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    const metadataLine = captureCharFrame()
      .split("\n")
      .find((line: string) => line.includes("120B") && line.includes("42ms"))
    expect(metadataLine).toBeDefined()
    expect(metadataLine ?? "").toContain("└")
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
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ResponsePane state={state} focused={true} />
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // scrollbox clips: only some of 100 items visible
    const bodyLines = frame
      .split("\n")
      .filter((l: string) => l.includes("item-"))
    expect(bodyLines.length).toBeGreaterThan(0)
    expect(bodyLines.length).toBeLessThan(100)
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
    const { renderOnce, captureCharFrame } = await testRender(
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
})

describe("Sidebar scrollbox", () => {
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
    expect(frame).toContain("Very long request n\u2026")
    // Should render many entries without crashing
    const count = (frame.match(/Very long request n\u2026/g) || []).length
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
        />
      </ThemeProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()

    // Verify LeftBar border character is present for selected item
    const charFrame = captureCharFrame()
    expect(charFrame).toContain("┃")

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
