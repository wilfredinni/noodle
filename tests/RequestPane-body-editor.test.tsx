import { describe, it, expect } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { readFile } from "node:fs/promises"
import { RequestPane } from "../src/ui/RequestPane"
import { ThemeProvider } from "../src/ui/theme"
import { CodeEditorRenderable } from "../src/ui/editor/CodeEditor"
import { lang } from "../src/lang"
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

const editStateEditingTimeout = {
  mode: "editing" as const,
  cursor: { field: "settings" as const, row: 0, addingRow: false },
  editingRow: 0,
}

describe("BodySection — edit mode", () => {
  it("does not report formatted JSON as an edit while browsing", async () => {
    const { keymap, cleanup } = setupKeymap()
    const changes: string[] = []
    const { renderOnce } = await testRender(
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
              onBodyChange={(body) => changes.push(body)}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()

    expect(changes).toEqual([])
    cleanup()
  })

  it("reports JSON edits while the body editor is active", async () => {
    const { keymap, cleanup } = setupKeymap()
    const changes: string[] = []
    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateEditing}
              editKey=""
              editValue={JSON.stringify({ name: "updated" }, null, 2)}
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
              onBodyChange={(body) => changes.push(body)}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()
    await act(async () => mockInput.typeText(" "))

    expect(changes.at(-1)).toContain("updated")
    cleanup()
  })

  it("activates the JSON editor without activating the body type selector", async () => {
    const { keymap, cleanup } = setupKeymap()
    let editorActivations = 0
    const { renderOnce, mockMouse } = await testRender(
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
              onBodyEditorFocus={() => editorActivations++}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(5, 5, MouseButtons.LEFT)
    })
    expect(editorActivations).toBe(1)
    cleanup()
  })

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

  it("formats stored JSON before body edit focus", async () => {
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
    expect(frame).toContain('"name": "hello"')
    expect(frame).toContain('"count": 42')
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

  it("toggles a JSON fold from its gutter icon", async () => {
    const { keymap, cleanup } = setupKeymap()
    const body = '{\n  "name": "hello",\n  "count": 42\n}'
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={{ ...testRequest, body }}
              editState={editStateEditing}
              editKey=""
              editValue={body}
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
    await new Promise((resolve) => setTimeout(resolve, 250))
    await renderOnce()

    const rows = captureCharFrame().split("\n")
    const row = rows.find((line) => line.includes("▼") && line.includes("{"))
    if (!row) throw new Error("Expected JSON fold icon")
    const y = rows.indexOf(row)
    const x = row.indexOf("▼")

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("{... } (3 lines)")
    cleanup()
  })

  it("pages through a focused JSON body", async () => {
    const { keymap, cleanup } = setupKeymap()
    const tallRequest: Request = {
      ...testRequest,
      body: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [`key${i}`, i]),
        ),
      ),
    }
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={8}>
            <RequestPane
              request={tallRequest}
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
      { width: 80, height: 8 },
    )
    await renderOnce()

    for (let i = 0; i < 20; i++) {
      act(() => {
        mockInput.pressKey("\x1b[6~")
      })
      await renderOnce()
    }

    expect(captureCharFrame()).toContain('"key29"')
    cleanup()
  })

  it("scrolls an unfocused JSON body from its gutter", async () => {
    const { keymap, cleanup } = setupKeymap()
    const tallRequest: Request = {
      ...testRequest,
      body: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 30 }, (_, i) => [`key${i}`, i]),
        ),
      ),
    }
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={8}>
            <RequestPane
              request={tallRequest}
              editState={editStateBrowse}
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
      { width: 80, height: 8 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const row = rows.find((line) => line.includes("{") && line.includes("1"))
    if (!row) throw new Error("Expected JSON gutter row")

    for (let i = 0; i < 30; i++) {
      await mockMouse.scroll(row.indexOf("1"), rows.indexOf(row), "down")
      await renderOnce()
    }

    expect(captureCharFrame()).toContain('"key29"')
    cleanup()
  })

  it("scrolls Create Post to the end while unfocused", async () => {
    const { keymap, cleanup } = setupKeymap()
    const request = lang.parseRequest(
      "posts/create-post",
      await readFile("collections/posts/create-post.yml", "utf8"),
    )
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={12}>
            <RequestPane
              request={request}
              editState={editStateBrowse}
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
      { width: 80, height: 12 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const row = rows.find((line) => line.includes("{") && line.includes("1"))
    if (!row) throw new Error("Expected JSON gutter row")

    for (let i = 0; i < 100; i++) {
      await mockMouse.scroll(row.indexOf("1"), rows.indexOf(row), "down")
      await renderOnce()
    }

    expect(captureCharFrame()).toContain('"likes": 0')
    cleanup()
  })

  it("renders file path when editing a binary body", async () => {
    const { keymap, cleanup } = setupKeymap()
    const binaryRequest: Request = {
      ...testRequest,
      bodyType: "binary",
      filePath: "/tmp/payload.bin",
    }
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={binaryRequest}
              editState={editStateEditing}
              editKey=""
              editValue="/tmp/payload.bin"
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
    expect(frame).toContain("/tmp/payload.bin")
    cleanup()
  })

  it("activates a binary body editor on click", async () => {
    const { keymap, cleanup } = setupKeymap()
    const binaryRequest: Request = {
      ...testRequest,
      bodyType: "binary",
      filePath: "/tmp/payload.bin",
    }
    let activated = ""
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={binaryRequest}
              editState={editStateBrowse}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="body"
              onBodyEditorFocus={(bodyType) => {
                activated = bodyType
              }}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(5, 5, MouseButtons.LEFT)
    })
    expect(activated).toBe("binary")
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

describe("RequestPane mouse transitions", () => {
  it("commits before switching tabs from an active edit", async () => {
    const { keymap, cleanup } = setupKeymap()
    const events: string[] = []
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={testRequest}
              editState={editStateEditingTimeout}
              editKey=""
              editValue="10"
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused={true}
              activeTab="settings"
              onInteraction={() => events.push("commit")}
              onTabChange={(tab) => events.push(tab)}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(12, 1, MouseButtons.LEFT)
    })

    expect(events).toEqual(["commit", "params"])
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
