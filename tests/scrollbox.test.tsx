import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA, TextAttributes } from "@opentui/core"
import type { Collection, Request, KvEntry } from "../src/schema"
import { Sidebar } from "../src/ui/Sidebar"
import { RequestPane } from "../src/ui/RequestPane"
import { ResponsePane } from "../src/ui/ResponsePane"
import type { SendState } from "../src/ui/sendState"
import { initialEditState } from "../src/ui/editMode"
import type { EditState } from "../src/ui/editMode"

import { ThemeProvider } from "../src/ui/theme"

function makeRequest(i: number): Request {
  return {
    id: `req-${i}`,
    name: `Very long request name to truncate ${i}`,
    method: i % 2 === 0 ? "GET" : "POST",
    url: `http://example.com/${i}`,
    headers: {},
    params: {},
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
  }
}

describe("ResponsePane scrollbox", () => {
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

    const { renderOnce, captureCharFrame } = await testRender(
      <ResponsePane state={state} focused={true} />,
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

    const request = {
      id: "test",
      name: "Test",
      method: "GET" as const,
      url: "http://example.com",
      headers: manyHeaders,
      params: {} as Record<string, KvEntry>,
      body: "" as string | undefined,
      timeout: 0,
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <RequestPane
        request={request}
        editState={initialEditState()}
        editKey=""
        editValue=""
        setEditKey={() => {}}
        setEditValue={() => {}}
        focused={true}
        activeTab="headers"
      />,
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

    const request = {
      id: "test",
      name: "Test",
      method: "GET" as const,
      url: "http://example.com",
      headers,
      params: {} as Record<string, KvEntry>,
      body: "" as string | undefined,
      timeout: 0,
    }

    const editState: EditState = {
      mode: "browsing",
      cursor: { field: "headers", row: 0, addingRow: false },
      editingRow: -1,
    }

    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
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
      </ThemeProvider>,
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
    const collection: Collection = { id: "test", name: "Test", requests }

    const { renderOnce, captureCharFrame } = await testRender(
      <Sidebar
        collection={collection}
        loading={false}
        error={null}
        selectedIndex={5}
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
    const collection: Collection = { id: "test", name: "Test", requests }

    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          collection={collection}
          loading={false}
          error={null}
          selectedIndex={2}
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
    const collection: Collection = { id: "test", name: "Test", requests }

    const manyHeaders: Record<string, KvEntry> = {}
    for (let i = 0; i < 30; i++) {
      manyHeaders[`X-Header-${i}`] = { value: `value-${i}`, enabled: true }
    }

    const request = {
      id: "req-0",
      name: "Request 0",
      method: "GET" as const,
      url: "http://example.com",
      headers: manyHeaders,
      params: {} as Record<string, KvEntry>,
      body: "" as string | undefined,
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

    const { renderOnce, captureCharFrame } = await testRender(
      <box style={{ width: "100%", height: "100%", flexDirection: "column" }}>
        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          <Sidebar
            collection={collection}
            loading={false}
            error={null}
            selectedIndex={3}
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
      </box>,
      { width: 80, height: 24 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // All three panes contribute content
    expect(frame).toContain("Request")
    expect(frame).toContain("Response")
    expect(frame).toContain("eader-0")
    expect(frame).toContain("item-")
  })
})
