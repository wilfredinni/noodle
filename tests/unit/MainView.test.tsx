import { describe, expect, it } from "bun:test"
import { act } from "react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { FullBorder } from "../../src/ui/borders"
import { MainView } from "../../src/ui/MainView"

const testRender = createTestRender()

describe("MainView", () => {
  it("uses the bordered empty state for an initialized collection without requests", async () => {
    const { keymap, cleanup } = setupKeymap()
    let createRequestCalls = 0
    const props = {
      items: [],
      loading: false,
      error: null,
      mode: "collection" as const,
      onCreateRequest: () => createRequestCalls++,
      onInitialize: () => {},
    } as unknown as Parameters<typeof MainView>[0]
    const { renderOnce, renderer, captureCharFrame, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <MainView {...props} />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 80, height: 20 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("No requests in this collection")
    expect(frame).toContain("Create request")
    expect(
      renderer.root.findDescendantById("empty-state-title"),
    ).toBeUndefined()

    const emptyState = renderer.root.findDescendantById(
      "empty-state",
    ) as BoxRenderable
    expect(emptyState.border).toEqual([...FullBorder.border])

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
    expect(createRequestCalls).toBe(1)

    cleanup()
  })
})
