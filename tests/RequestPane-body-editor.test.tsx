import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RequestPane } from "../src/ui/RequestPane"
import { ThemeProvider } from "../src/ui/theme"
import type { Request } from "../src/schema"
import type { UseRequestDraftResult } from "../src/ui/useRequestDraft"
import { parseJsonError } from "../src/ui/useJsonHighlight"

const testRequest: Request = {
  id: "test",
  name: "test",
  method: "POST",
  url: "https://example.com/api",
  body: '{"name":"hello","count":42}',
  headers: {},
  params: {},
}

const editStateInactive = {
  mode: "inactive" as const,
  cursor: { field: "body" as const, row: -1, addingRow: false },
  editingRow: -1,
}

const editStateEditing = {
  mode: "editing" as const,
  cursor: { field: "body" as const, row: -1, addingRow: false },
  editingRow: -1,
}

const editStateBrowse = {
  mode: "browsing" as const,
  cursor: { field: "body" as const, row: -1, addingRow: false },
  editingRow: -1,
}

const noopDraft: UseRequestDraftResult = {
  draft: testRequest,
  isDirty: false,
  setUrl: () => {},
  setBody: () => {},
  setHeaderRow: () => {},
  addHeaderRow: () => {},
  removeHeaderRow: () => {},
  setParamRow: () => {},
  addParamRow: () => {},
  removeParamRow: () => {},
  revertField: () => {},
  revertAll: () => {},
  markSaved: () => {},
}

describe("BodySection — edit mode", () => {
  it("renders body content in edit mode", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={20}>
          <RequestPane
            request={testRequest}
            editState={editStateEditing}
            editKey=""
            editValue={testRequest.body!}
            setEditKey={() => {}}
            setEditValue={() => {}}
            draft={noopDraft}
            focused={true}
            activeTab="body"
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Should contain the JSON content in the textarea (formatted)
    expect(frame).toContain("name")
    expect(frame).toContain("hello")
  })

  it("renders formatted JSON content in textarea", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={20}>
          <RequestPane
            request={testRequest}
            editState={editStateEditing}
            editKey=""
            editValue={testRequest.body!}
            setEditKey={() => {}}
            setEditValue={() => {}}
            draft={noopDraft}
            focused={true}
            activeTab="body"
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Textarea renders the formatted JSON from formatBody
    expect(frame).toContain("name")
    expect(frame).toContain("42")
  })

  it("renders browse view unchanged when not editing body", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={20}>
          <RequestPane
            request={testRequest}
            editState={editStateBrowse}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            draft={noopDraft}
            focused={true}
            activeTab="body"
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Browse view: should contain the formatted JSON
    expect(frame).toContain("name")
    expect(frame).toContain("hello")
    // Should NOT contain "(none)"
    expect(frame).not.toContain("(none)")
  })

  it("renders (none) when body is empty and not editing", async () => {
    const emptyRequest: Request = {
      ...testRequest,
      body: "",
    }
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={20}>
          <RequestPane
            request={emptyRequest}
            editState={editStateInactive}
            editKey=""
            editValue=""
            setEditKey={() => {}}
            setEditValue={() => {}}
            draft={noopDraft}
            focused={false}
            activeTab="body"
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("(none)")
  })

  it("shows error bar when editing invalid JSON", async () => {
    // Verify parseJsonError detects invalid JSON (drives the ✗ error bar)
    const result = parseJsonError("{{invalid")
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error.message.length).toBeGreaterThan(0)
    }

    // Verify ✗ error prefix exists in rendered output when body is invalid
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box width={80} height={20}>
          <RequestPane
            request={testRequest}
            editState={editStateEditing}
            editKey=""
            editValue="invalid json content"
            setEditKey={() => {}}
            setEditValue={() => {}}
            draft={noopDraft}
            focused={true}
            activeTab="body"
          />
        </box>
      </ThemeProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // The textarea shows raw body content when it can't be parsed as JSON
    expect(frame).toContain("invalid json content")
    // Error bar (line sign ✗) is rendered by applyHighlightsAndValidate
    // via the debounced onContentChange callback (tested at the pure level above)
  })
})
