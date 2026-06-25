import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA, TextAttributes } from "@opentui/core"
import { Sidebar } from "../src/ui/Sidebar"
import { RequestPane } from "../src/ui/RequestPane"
import { ResponsePane } from "../src/ui/ResponsePane"
import { initialEditState } from "../src/ui/editMode"
import type { EditState } from "../src/ui/editMode"
import type { Request, Collection } from "../src/schema"
import type { SendState } from "../src/ui/sendState"
import type { UseRequestDraftResult } from "../src/ui/useRequestDraft"

function makeRequest(i: number): Request {
  return {
    id: `req-${i}`,
    name: `Request number ${i}`,
    method: i % 2 === 0 ? "GET" : "POST",
    url: `http://example.com/${i}`,
    headers: {},
    params: {},
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
    const bodyLines = frame.split("\n").filter((l: string) =>
      l.includes("item-"),
    )
    expect(bodyLines.length).toBeGreaterThan(0)
    expect(bodyLines.length).toBeLessThan(100)

    // scroll indicator present (proves overflow rendering)
    expect(frame).toMatch(/[▀▄▌]/)
  })
})

describe("RequestPane scrollbox", () => {
  it("renders with many headers without overflowing", async () => {
    const manyHeaders: Record<string, string> = {}
    for (let i = 0; i < 30; i++) {
      manyHeaders[`X-Header-${i}`] = `value-${i}`
    }

    const request = {
      id: "test",
      name: "Test",
      method: "GET" as const,
      url: "http://example.com",
      headers: manyHeaders,
      params: {} as Record<string, string>,
      body: "" as string | undefined,
    }

    const draft: UseRequestDraftResult = {
      draft: request,
      isDirty: false,
      setUrl: () => {},
      setBody: () => {},
      addHeaderRow: () => {},
      setHeaderRow: () => {},
      removeHeaderRow: () => {},
      addParamRow: () => {},
      setParamRow: () => {},
      removeParamRow: () => {},
      revertField: () => {},
      revertAll: () => {},
      markSaved: () => {},
    }

    const { renderOnce, captureCharFrame } = await testRender(
      <RequestPane
        request={request}
        editState={initialEditState()}
        editValue=""
        setEditValue={() => {}}
        draft={draft}
        focused={true}
        activeTab="headers"
      />,
      { width: 80, height: 12 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toBe("")

    // scrollbox clips: only some of 30 headers visible
    const headerLines = frame.split("\n").filter((l: string) =>
      l.includes("X-Header-"),
    )
    expect(headerLines.length).toBeGreaterThan(0)
    expect(headerLines.length).toBeLessThan(30)

    // scroll indicator present (proves overflow rendering)
    expect(frame).toMatch(/[▀▄▌]/)
  })

  it("browse cursor has #007aff background and white text instead of INVERSE", async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": "Bearer token",
    }

    const request = {
      id: "test",
      name: "Test",
      method: "GET" as const,
      url: "http://example.com",
      headers,
      params: {} as Record<string, string>,
      body: "" as string | undefined,
    }

    const draft: UseRequestDraftResult = {
      draft: request,
      isDirty: false,
      setUrl: () => {},
      setBody: () => {},
      addHeaderRow: () => {},
      setHeaderRow: () => {},
      removeHeaderRow: () => {},
      addParamRow: () => {},
      setParamRow: () => {},
      removeParamRow: () => {},
      revertField: () => {},
      revertAll: () => {},
      markSaved: () => {},
    }

    const editState: EditState = {
      mode: "browsing",
      cursor: { field: "headers", row: 0, addingRow: false },
      editingRow: -1,
    }

    const { renderOnce, captureSpans } = await testRender(
      <RequestPane
        request={request}
        editState={editState}
        editValue=""
        setEditValue={() => {}}
        draft={draft}
        focused={true}
        activeTab="headers"
      />,
      { width: 80, height: 12 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap(l => l.spans)

    // Headers are sorted alphabetically: Authorization before Content-Type
    // Row 0 = Authorization (highlighted), Row 1 = Content-Type (not highlighted)
    const highlightedSpan = allSpans.find(
      s => s.text.includes("Authorization") && s.bg.equals(RGBA.fromInts(0, 122, 255)),
    )
    expect(highlightedSpan).toBeDefined()
    expect(highlightedSpan!.fg.equals(RGBA.fromInts(255, 255, 255))).toBe(true)
    expect(highlightedSpan!.attributes & TextAttributes.INVERSE).toBe(0)

    const nonHighlightedSpan = allSpans.find(
      s => s.text.includes("Content-Type") && s.bg.equals(RGBA.fromInts(0, 122, 255)),
    )
    expect(nonHighlightedSpan).toBeUndefined()
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

    const lines = frame.split("\n").filter(l => l.trim() !== "")
    expect(lines.length).toBeLessThan(50)

    expect(frame).toContain("Request number 5")
  })

  it("selected request has #007aff background and white text instead of INVERSE", async () => {
    const requests = Array.from({ length: 5 }, (_, i) => makeRequest(i))
    const collection: Collection = { id: "test", name: "Test", requests }

    const { renderOnce, captureSpans } = await testRender(
      <Sidebar
        collection={collection}
        loading={false}
        error={null}
        selectedIndex={2}
        focused={true}
      />,
      { width: 80, height: 24 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap(l => l.spans)

    // Find the method span for the selected request
    const selectedMethodSpan = allSpans.find(
      s => s.text.includes("GET") && s.bg.equals(RGBA.fromInts(0, 122, 255)),
    )
    expect(selectedMethodSpan).toBeDefined()
    expect(selectedMethodSpan!.fg.equals(RGBA.fromInts(255, 255, 255))).toBe(true)
    expect(selectedMethodSpan!.attributes & TextAttributes.INVERSE).toBe(0)

    // Find the name span for the selected request
    const selectedNameSpan = allSpans.find(
      s => s.text.includes("Request number 2") && s.bg.equals(RGBA.fromInts(0, 122, 255)),
    )
    expect(selectedNameSpan).toBeDefined()
    expect(selectedNameSpan!.fg.equals(RGBA.fromInts(255, 255, 255))).toBe(true)
    expect(selectedNameSpan!.attributes & TextAttributes.INVERSE).toBe(0)

    // Unselected item should not have the blue background
    const unselectedSpan = allSpans.find(
      s => s.text.includes("Request number 0") && s.bg.equals(RGBA.fromInts(0, 122, 255)),
    )
    expect(unselectedSpan).toBeUndefined()
  })
})

describe("App layout stability", () => {
  it("renders all three panes together without overflow", async () => {
    const requests = Array.from({ length: 50 }, (_, i) => makeRequest(i))
    const collection: Collection = { id: "test", name: "Test", requests }

    const manyHeaders: Record<string, string> = {}
    for (let i = 0; i < 30; i++) {
      manyHeaders[`X-Header-${i}`] = `value-${i}`
    }

    const request = {
      id: "req-0",
      name: "Request 0",
      method: "GET" as const,
      url: "http://example.com",
      headers: manyHeaders,
      params: {} as Record<string, string>,
      body: "" as string | undefined,
    }

    const draft: UseRequestDraftResult = {
      draft: request,
      isDirty: false,
      setUrl: () => {},
      setBody: () => {},
      addHeaderRow: () => {},
      setHeaderRow: () => {},
      removeHeaderRow: () => {},
      addParamRow: () => {},
      setParamRow: () => {},
      removeParamRow: () => {},
      revertField: () => {},
      revertAll: () => {},
      markSaved: () => {},
    }

    const longBody = JSON.stringify(
      { data: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) },
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
              editValue=""
              setEditValue={() => {}}
              draft={draft}
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
    expect(frame).toContain("X-Header-")
    expect(frame).toContain("item-")
  })
})
