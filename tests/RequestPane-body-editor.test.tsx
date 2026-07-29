import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { RequestPane } from "../src/ui/RequestPane"
import { ThemeProvider } from "../src/ui/theme"
import { CodeEditorRenderable } from "../src/ui/editor/CodeEditor"
import type { Request } from "../src/schema"
import { setupKeymap } from "./unit/_helpers"

extend({ "code-editor": CodeEditorRenderable })

const testRequest: Request = {
  id: "test",
  name: "test",
  method: "POST",
  url: "https://example.com/api",
  body: '{"name":"hello","count":42}',
  headers: {},
  params: [],
  timeout: 0,
}

const editStateInactive = {
  mode: "inactive" as const,
  cursor: { field: "body" as const, row: -1, addingRow: false },
  editingRow: -1,
}

const editStateEditing = {
  mode: "editing" as const,
  cursor: { field: "body" as const, row: 1, addingRow: false },
  editingRow: 1,
}

const editStateBrowse = {
  mode: "browsing" as const,
  cursor: { field: "body" as const, row: 0, addingRow: false },
  editingRow: -1,
}

describe("BodySection — edit mode", () => {
  it("renders body content in edit mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateEditing}
              editKey=""
              editValue={testRequest.body!}
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Should contain the JSON content in the textarea (formatted)
    expect(frame).toContain("name")
    expect(frame).toContain("hello")
    cleanup()
  })

  it("renders formatted JSON content in textarea", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateEditing}
              editKey=""
              editValue={testRequest.body!}
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Textarea renders the formatted JSON from formatBody
    expect(frame).toContain("name")
    expect(frame).toContain("42")
    cleanup()
  })

  it("renders JSON in code editor before entering body edit focus", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateBrowse}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // JSON always renders in the code editor, not the read-only viewer.
    expect(frame).toContain("name")
    expect(frame).toContain("hello")
    // Should NOT contain "(none)"
    expect(frame).not.toContain("(none)")
    cleanup()
  })

  it("does not render a read-only empty-body placeholder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const emptyRequest: Request = {
      ...testRequest,
      body: "",
    }
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={emptyRequest}
              editState={editStateInactive}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={false}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("(none)")
    cleanup()
  })

  it("keeps the request frame bottom border over tall JSON", async () => {
    const { keymap, cleanup } = setupKeymap()
    const tallRequest: Request = {
      ...testRequest,
      body: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [`key${i}`, i]),
        ),
      ),
    }
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={8}>
            <RequestPane
              request={tallRequest}
              editState={editStateEditing}
              editKey=""
              editValue={tallRequest.body!}
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()

    const bottomLine = captureCharFrame().trimEnd().split("\n").at(-1) ?? ""
    expect(bottomLine).toContain("└")
    expect(bottomLine).toContain("┘")
    cleanup()
  })

  it("renders raw content when editing non-JSON body", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateEditing}
              editKey=""
              editValue="raw text content"
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("raw text content")
    cleanup()
  })

  it("shows inline validation errors for malformed JSON while editing", async () => {
    const { keymap, cleanup } = setupKeymap()
    const invalidRequest: Request = {
      ...testRequest,
      body: '{"name":',
    }
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={invalidRequest}
              editState={editStateEditing}
              editKey=""
              editValue={invalidRequest.body!}
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Invalid JSON")
    cleanup()
  })
})

describe("BodySection — FormEditor browse mode", () => {
  const formRequest: Request = {
    id: "form-test",
    name: "form-test",
    method: "POST",
    url: "https://example.com/api",
    headers: {},
    params: [],
    timeout: 0,
    bodyType: "multipart",
    formData: [
      { name: "username", value: "john", enabled: true, type: "text" },
      {
        name: "avatar",
        value: "/path/to/photo.png",
        enabled: true,
        type: "file",
      },
    ],
  }

  const editStateBrowseBody = {
    mode: "inactive" as const,
    cursor: { field: "body" as const, row: -1, addingRow: false },
    editingRow: -1,
  }

  it("renders [F] prefix for file-type form entries", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={formRequest}
              editState={editStateBrowseBody}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("[F]")
    expect(frame).toContain("avatar")
    expect(frame).toContain("username")
    expect(frame).toContain("john")
    cleanup()
  })

  it("does not show [F] prefix for text-type form entries", async () => {
    const textOnlyReq: Request = {
      ...formRequest,
      formData: [
        { name: "username", value: "john", enabled: true, type: "text" },
        {
          name: "email",
          value: "john@example.com",
          enabled: true,
          type: "text",
        },
      ],
    }
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={textOnlyReq}
              editState={editStateBrowseBody}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("username")
    expect(frame).toContain("john")
    expect(frame).toContain("email")
    expect(frame).toContain("john@example.com")
    expect(frame).not.toContain("[F]")
    cleanup()
  })
})
