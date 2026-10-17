import { describe, expect, it } from "bun:test"
import { act, createRef, useState } from "react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvironmentEditorView } from "../../src/ui/env-editor/EnvironmentEditorView"
import type { EnvHeaderPaneHandle } from "../../src/ui/env-editor/EnvHeaderPane"
import type { UseEnvironmentEditorResult } from "../../src/hooks/useEnvironmentEditor"
import { FullBorder } from "../../src/ui/borders"

const testRender = createTestRender()

function emptyEditor(): UseEnvironmentEditorResult {
  return {
    envNames: [],
    remaskSecrets: () => {},
  } as unknown as UseEnvironmentEditorResult
}

describe("EnvironmentEditorView", () => {
  it("disables empty-state creation while read-only", async () => {
    const { keymap, cleanup } = setupKeymap()
    let creates = 0
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvironmentEditorView
            readOnly
            envEditor={emptyEditor()}
            activeEnv={null}
            envColors={{}}
            focus="env-sidebar"
            envHeaderRef={createRef<EnvHeaderPaneHandle>()}
            onCreateEnvironment={() => creates++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await h.renderOnce()
    await act(async () => h.mockInput.pressEnter())
    const button = h.renderer.root.findDescendantById("empty-state-action")!
    await act(async () => h.mockMouse.click(button.screenX + 1, button.screenY))
    expect(creates).toBe(0)
    cleanup()
  })

  it("locks an active variable edit and blocks mouse commits and secret changes", async () => {
    const { keymap, cleanup } = setupKeymap()
    const changes: string[] = []
    let lock!: () => void
    const editor = {
      envNames: ["dev"],
      selectedEnvName: "dev",
      draft: {
        name: "dev",
        color: undefined,
        varRows: [
          { id: 1, key: "TOKEN", value: "secret", enabled: true, secret: true },
        ],
      },
      editState: {
        mode: "editing",
        row: 0,
        editingRow: 0,
        addingRow: false,
        subfield: "value",
      },
      editKey: "TOKEN",
      editValue: "secret",
      dirty: false,
      remaskSecrets: () => {},
      selectEnv: () => {},
      setName: () => changes.push("name"),
      setColor: () => changes.push("color"),
      setEditKey: () => changes.push("key"),
      setEditValue: () => changes.push("value"),
      commitEdit: () => changes.push("commit"),
      toggleReveal: () => changes.push("reveal"),
      toggleVar: () => changes.push("toggle"),
      toggleSecret: () => changes.push("secret"),
    } as unknown as UseEnvironmentEditorResult
    function Locking() {
      const [readOnly, setReadOnly] = useState(false)
      lock = () => setReadOnly(true)
      return (
        <EnvironmentEditorView
          readOnly={readOnly}
          envEditor={editor}
          activeEnv={null}
          envColors={{}}
          focus="env-vars"
          envHeaderRef={createRef<EnvHeaderPaneHandle>()}
          onCreateEnvironment={() => {}}
        />
      )
    }
    const h = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Locking />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 16 },
    )
    await h.renderOnce()
    await act(async () => lock())
    await act(async () => h.renderOnce())
    await act(async () => h.mockInput.typeText("changed"))
    const row = h.renderer.root.findDescendantById("vrow-0")!
    for (const field of row.getChildren())
      await act(async () => h.mockMouse.click(field.screenX, field.screenY))
    expect(changes).toEqual([])
    expect(h.captureCharFrame()).not.toContain("changed")
    cleanup()
  })

  it("renders the reusable empty state and opens environment creation", async () => {
    const { keymap, cleanup } = setupKeymap()
    let createCalls = 0
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <EnvironmentEditorView
              envEditor={emptyEditor()}
              activeEnv={null}
              envColors={{}}
              focus="env-sidebar"
              envHeaderRef={createRef<EnvHeaderPaneHandle>()}
              onCreateEnvironment={() => createCalls++}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Create environment")
    expect(frame).toContain("No environments in this collection")
    expect(frame).not.toContain("(no environments)")
    expect(
      renderer.root.findDescendantById("empty-state-title"),
    ).toBeUndefined()
    const emptyState = renderer.root.findDescendantById(
      "empty-state",
    ) as BoxRenderable
    expect(emptyState.border).toEqual([...FullBorder.border])
    expect(frame).toContain("┌")

    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.click(
        action.screenX + Math.floor(action.width / 2),
        action.screenY,
        MouseButtons.LEFT,
      )
    })
    expect(createCalls).toBe(1)

    cleanup()
  })
})
