import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { Sidebar } from "../src/ui/Sidebar"
import { RequestPane } from "../src/ui/RequestPane"
import { initialEditState } from "../src/ui/editMode"
import type { Auth, Request, Collection } from "../src/schema"
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
      auth: null as Auth | null,
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
})
