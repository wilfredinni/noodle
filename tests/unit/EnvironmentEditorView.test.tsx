import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
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
              setEnvDeletePending={() => {}}
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
