import { describe, it, expect } from "bun:test"
import { act, useEffect, useState } from "react"
import { ManualClock, MouseButtons } from "@opentui/core/testing"
import { addDefaultParsers } from "@opentui/core"
import { createTestRender } from "./testRender"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { readFile } from "node:fs/promises"
import { RequestPane } from "../src/ui/RequestPane"
import { ThemeProvider } from "../src/ui/theme"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../src/ui/editor/CodeEditor"
import { lang } from "../src/lang"
import type { Request } from "../src/schema"
import {
  useRequestDraft,
  type UseRequestDraftResult,
} from "../src/hooks/useRequestDraft"
import {
  useEditBrowse,
  type UseEditBrowseResult,
} from "../src/hooks/useEditBrowse"
import { getHighlightCount, setupKeymap } from "./unit/_helpers"
import { codeEditorParsers } from "../src/ui/editor/codeEditorParsers"

const testRender = createTestRender()

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
addDefaultParsers([...codeEditorParsers])

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

function ActiveJsonEditorHarness({
  onInteraction,
  onPaneFocus,
  onChange,
}: {
  onInteraction: () => void
  onPaneFocus: () => void
  onChange: (value: string) => void
}) {
  const [body, setBody] = useState(
    JSON.stringify({ name: "hello", count: 42 }, null, 2),
  )
  const [editing, setEditing] = useState(true)

  return (
    <RequestPane
      request={{ ...testRequest, body }}
      editState={editing ? editStateEditing : editStateBrowse}
      editKey=""
      editValue={body}
      setEditKey={() => {}}
      setEditValue={() => {}}
      focused
      activeTab="body"
      onBodyChange={(value) => {
        onChange(value)
        setBody(value)
      }}
      onBodyEditorFocus={() => setEditing(true)}
      onInteraction={() => {
        onInteraction()
        setEditing(false)
      }}
      onPaneFocus={() => {
        onPaneFocus()
        setEditing(false)
      }}
    />
  )
}

function DraftJsonEditorHarness({
  onRender,
}: {
  onRender: (
    draft: UseRequestDraftResult,
    editBrowse: UseEditBrowseResult,
  ) => void
}) {
  const draft = useRequestDraft({ ...testRequest, body: "" })
  const editBrowse = useEditBrowse(draft.draft, draft)
  useEffect(() => {
    onRender(draft, editBrowse)
  }, [draft, editBrowse, onRender])

  return (
    <RequestPane
      request={draft.draft}
      editState={editBrowse.editState}
      editKey={editBrowse.editKey}
      editValue={editBrowse.editValue}
      setEditKey={editBrowse.setEditKey}
      setEditValue={editBrowse.setEditValue}
      focused
      activeTab={editBrowse.activeTab}
      onBodyChange={draft.setBody}
    />
  )
}

describe("BodySection — edit mode", () => {
  it("keeps typed JSON characters and advances the cursor across draft renders", async () => {
    const { keymap, cleanup } = setupKeymap()
    let draftState: UseRequestDraftResult | null = null
    let editBrowseState: UseEditBrowseResult | null = null
    const { renderer, renderOnce, flush, waitFor, mockInput } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box width={80} height={20}>
              <DraftJsonEditorHarness
                onRender={(draft, editBrowse) => {
                  draftState = draft
                  editBrowseState = editBrowse
                }}
              />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 20 },
      )
    await renderOnce()

    await act(async () => editBrowseState!.enterBrowseAt("body", 0))
    await renderOnce()
    await act(async () => editBrowseState!.enterTextBodyEditor())
    await renderOnce()
    await waitFor(() => editBrowseState!.isEditingTextBody)

    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    editor.setCursor(0, 0)

    await act(async () => mockInput.typeText("a"))
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("b")
    })
    await flush()
    await waitFor(() => draftState!.draft?.body === "ab")

    expect(editor.plainText).toBe("ab")
    expect(draftState!.draft?.body).toBe("ab")
    expect(editor.logicalCursor).toMatchObject({ row: 0, col: 2 })

    await act(async () => editBrowseState!.returnToTextBodyTypeSelect())
    await renderOnce()
    await act(async () => draftState!.setBody('{"updated":true}'))
    await waitFor(() => editor.plainText === '{\n  "updated": true\n}')
    expect(editor.plainText).toBe('{\n  "updated": true\n}')
    cleanup()
  })

  it("keeps a request-body selection anchored while dragging beyond the viewport", async () => {
    const clock = new ManualClock()
    const { keymap, cleanup } = setupKeymap()
    const body = Array.from(
      { length: 30 },
      (_, index) => `request line ${index}`,
    ).join("\n")
    const { renderer, renderOnce, captureCharFrame, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <box width={48} height={12}>
              <RequestPane
                request={{ ...testRequest, body }}
                editState={editStateEditing}
                editKey=""
                editValue={body}
                setEditKey={() => {}}
                setEditValue={() => {}}
                focused
                activeTab="body"
                onBodyChange={() => {}}
              />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 48, height: 12, clock },
      )
    await renderOnce()
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    const rows = captureCharFrame().split("\n")
    const firstBodyRow = rows.find((row) => row.includes("request line 0"))
    if (!firstBodyRow) throw new Error("Expected the first request body row")
    const x = firstBodyRow.indexOf("request") + 1
    const y = rows.indexOf(firstBodyRow)
    await act(async () => {
      await mockMouse.pressDown(x, y, MouseButtons.LEFT)
      await mockMouse.moveTo(x, y + 1)
      await mockMouse.moveTo(x, editor.y + editor.height, { delayMs: 25 })
    })
    for (let frame = 0; frame < 4; frame++) {
      clock.setTime(clock.now() + 30)
      await renderOnce()
    }

    expect(editor.scrollY).toBeGreaterThan(0)
    expect(editor.getSelectedText()).toContain("equest line 0")
    expect(editor.getSelectedText()).toContain("request line 4")

    await act(async () => {
      await mockMouse.release(x, editor.y + editor.height)
    })
    const scrollAfterRelease = editor.scrollY
    clock.setTime(clock.now() + 50)
    await renderOnce()
    expect(editor.scrollY).toBe(scrollAfterRelease)
    cleanup()
  })

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

  it("renders XML in the shared editor without changing whitespace", async () => {
    const { keymap, cleanup } = setupKeymap()
    const body = `<root>\n  <value>$token</value>\n</root>`
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={{ ...testRequest, bodyType: "xml", body }}
              editState={editStateBrowse}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()
    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    expect(editor.plainText).toBe(body)
    expect(editor.filetype).toBe("xml")
    await editor.refreshHighlights()
    expect(getHighlightCount(editor)).toBeGreaterThan(0)
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
    const initialChangeCount = changes.length
    await act(async () => mockInput.typeText(" "))

    expect(changes.length).toBeGreaterThan(initialChangeCount)
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

  it("keeps an active JSON editor focused when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    const changes: string[] = []
    let interactions = 0
    let paneFocuses = 0
    const { renderOnce, mockInput, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <ActiveJsonEditorHarness
              onInteraction={() => interactions++}
              onPaneFocus={() => paneFocuses++}
              onChange={(value) => changes.push(value)}
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()

    await mockMouse.click(5, 5, MouseButtons.LEFT)
    await renderOnce()
    await act(async () => mockInput.typeText("X"))

    expect(interactions).toBe(0)
    expect(paneFocuses).toBe(0)
    expect(changes.at(-1)).toContain("X")
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
    const { renderer, renderOnce, captureCharFrame } = await testRender(
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
    await renderOnce()
    const frame = captureCharFrame()
    // JSON always renders in the code editor, not the read-only viewer.
    expect(frame).toContain("name")
    expect(frame).toContain("hello")
    // Should NOT contain "(none)"
    expect(frame).not.toContain("(none)")
    const scrollbar = renderer.root.findDescendantById("request-body-scrollbar")
    expect(scrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    expect(scrollbar!.visible).toBe(false)
    cleanup()
  })

  it("should expand short JSON across the available body width", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderer, renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={20}>
            <RequestPane
              request={{ ...testRequest, body: '{"a":1}' }}
              editState={editStateBrowse}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()
    await renderOnce()

    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    const bodyField = renderer.root.findDescendantById("body-field")
    if (!bodyField) throw new Error("Expected request body field")

    expect(editor.x + editor.width).toBe(bodyField.x + bodyField.width - 1)
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

  it("keeps the request frame bottom border at the resize minimum", async () => {
    const { keymap, cleanup } = setupKeymap()
    const tallRequest: Request = {
      ...testRequest,
      body: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [`key${i}`, i]),
        ),
      ),
    }
    const { renderer, renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={80} height={6}>
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
      { width: 80, height: 6 },
    )
    await renderOnce()
    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    await editor.refreshHighlights()
    await renderOnce()

    const bottomLine = captureCharFrame().trimEnd().split("\n").at(-1) ?? ""
    expect(bottomLine).toBe(`└${"─".repeat(78)}┘`)
    cleanup()
  })

  it("shows and synchronizes an interactive scrollbar for tall JSON", async () => {
    const { keymap, cleanup } = setupKeymap()
    const tallRequest: Request = {
      ...testRequest,
      body: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [`key${i}`, i]),
        ),
      ),
    }
    const { renderer, renderOnce, mockMouse } = await testRender(
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
              focused
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await renderOnce()

    const editor = renderer.root.findDescendantById("request-body-editor")
    const scrollbar = renderer.root.findDescendantById("request-body-scrollbar")
    expect(editor).toBeInstanceOf(CodeEditorRenderable)
    expect(scrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    const codeEditor = editor as CodeEditorRenderable
    const editorScrollbar = scrollbar as CodeEditorScrollBarRenderable
    expect(editorScrollbar.scrollSize).toBeGreaterThan(
      editorScrollbar.viewportSize,
    )
    expect(editorScrollbar.viewportSize).toBe(codeEditor.viewport.height)
    expect(editorScrollbar.visible).toBe(true)

    await act(async () => {
      await mockMouse.click(
        editorScrollbar.slider.screenX,
        editorScrollbar.slider.screenY + editorScrollbar.slider.height - 1,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()

    expect(codeEditor.scrollY).toBeGreaterThan(0)
    expect(editorScrollbar.scrollPosition).toBe(codeEditor.scrollY)
    cleanup()
  })

  it("uses wrapped editor rows when dragging the JSON scrollbar", async () => {
    const { keymap, cleanup } = setupKeymap()
    const wrappedRequest: Request = {
      ...testRequest,
      body: JSON.stringify({
        message: "wrapped content ".repeat(300),
        tail: "end",
      }),
    }
    const { renderer, renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <box width={42} height={10}>
            <RequestPane
              request={wrappedRequest}
              editState={editStateBrowse}
              editKey=""
              editValue=""
              setEditKey={() => {}}
              setEditValue={() => {}}
              focused
              activeTab="body"
            />
          </box>
        </ThemeProvider>
      </KeymapProvider>,
      { width: 42, height: 10 },
    )
    await renderOnce()
    await renderOnce()

    const editor = renderer.root.findDescendantById("request-body-editor")
    const scrollbar = renderer.root.findDescendantById("request-body-scrollbar")
    expect(editor).toBeInstanceOf(CodeEditorRenderable)
    expect(scrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    const codeEditor = editor as CodeEditorRenderable
    const editorScrollbar = scrollbar as CodeEditorScrollBarRenderable
    expect(codeEditor.focused).toBe(false)
    expect(codeEditor.totalVirtualLineCount).toBeGreaterThan(
      codeEditor.viewport.height,
    )
    expect(editorScrollbar.scrollSize).toBe(codeEditor.totalVirtualLineCount)
    expect(editorScrollbar.viewportSize).toBe(codeEditor.viewport.height)

    const dragX = editorScrollbar.slider.screenX
    const dragY = editorScrollbar.slider.screenY
    const dragEndY = dragY + editorScrollbar.slider.height - 1

    await act(async () => {
      await mockMouse.pressDown(dragX, dragY, MouseButtons.LEFT)
      const rows = Array.from(
        { length: dragEndY - dragY + 1 },
        (_, i) => dragY + i,
      )
      for (const y of [...rows, ...rows.toReversed()]) {
        await mockMouse.moveTo(dragX, y)
        const expectedPosition = editorScrollbar.scrollPosition
        await renderOnce()
        expect(codeEditor.scrollY).toBe(expectedPosition)
        expect(editorScrollbar.scrollPosition).toBe(codeEditor.scrollY)
      }
      await mockMouse.release(dragX, dragY, MouseButtons.LEFT)
    })
    await renderOnce()

    expect(codeEditor.scrollY).toBe(0)
    expect(codeEditor.focused).toBe(false)
    expect(editorScrollbar.scrollPosition).toBe(codeEditor.scrollY)
    cleanup()
  })

  it("toggles a JSON fold from its gutter icon", async () => {
    const { keymap, cleanup } = setupKeymap()
    const body = '{\n  "name": "hello",\n  "count": 42\n}'
    const { renderer, renderOnce, captureCharFrame, mockMouse } =
      await testRender(
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
    const editor = renderer.root.findDescendantById(
      "request-body-editor",
    ) as CodeEditorRenderable
    await editor.refreshHighlights()
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
    const foldedFrame = captureCharFrame()
    expect(foldedFrame).toContain("{...} (3 lines)")
    const foldedLine = foldedFrame
      .split("\n")
      .find((line) => line.includes("{...} (3 lines)"))
    expect(foldedLine).toMatch(/▶ {2}1 /)
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
    const { renderer, renderOnce, captureCharFrame, mockInput } =
      await testRender(
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

    for (let i = 0; i < 40; i++) {
      await act(async () => {
        await mockInput.pressKey("\x1b[6~")
      })
      await renderOnce()
    }

    expect(captureCharFrame()).toContain('"key29"')
    const editor = renderer.root.findDescendantById("request-body-editor")
    const scrollbar = renderer.root.findDescendantById("request-body-scrollbar")
    expect(editor).toBeInstanceOf(CodeEditorRenderable)
    expect(scrollbar).toBeInstanceOf(CodeEditorScrollBarRenderable)
    expect((scrollbar as CodeEditorScrollBarRenderable).scrollPosition).toBe(
      (editor as CodeEditorRenderable).scrollY,
    )
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

    for (let i = 0; i < 60; i++) {
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
      body: '{\n  "name": "Ada"\n  "age": 42\n}',
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
    expect(frame).toContain("Expected ',' at line 3, column 3")
    expect(frame).not.toContain("Invalid JSON")
    expect(frame).not.toContain("JSON Parse error")
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
              onInteraction={() => {
                events.push("commit")
              }}
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
