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

  it("keeps request inspection available in browse mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const request = {
      id: "health",
      name: "Health check",
      method: "GET" as const,
      url: "https://example.com/health",
      timeout: 10_000,
      headers: {},
      params: [],
      auth: { type: "none" as const },
    }
    const props = {
      items: [{ type: "request" as const, data: request }],
      loading: false,
      error: null,
      visibleItems: [
        {
          type: "request" as const,
          id: "health",
          name: "Health check",
          depth: 0,
          expanded: false,
          hasChildren: false,
          method: "GET",
        },
      ],
      cursorIndex: 0,
      selectedId: "health",
      expandedFolders: new Set<string>(),
      focusedFolderPresent: false,
      focus: "sidebar" as const,
      draft: {
        draft: request,
        dirtyRequestIds: new Set<string>(),
        setUrl: () => {},
        setMethod: () => {},
        syncUrlParams: () => {},
      },
      eb: {
        editState: {
          mode: "inactive" as const,
          cursor: { field: "headers" as const, row: -1, addingRow: false },
          editingRow: -1,
        },
        editKey: "",
        editValue: "",
        setEditKey: () => {},
        setEditValue: () => {},
        activeTab: "headers" as const,
      },
      folderDraft: { dirtyPaths: new Set<string>() },
      layout: "stacked" as const,
      expanded: null,
      activeEnv: null,
      responseState: { status: "idle" as const },
      timelineEntries: [],
      onResponseTabChange: () => {},
      setSelectOpen: () => {},
      urlbarSubFocus: "text" as const,
      urlbarInteractive: false,
      mode: "browse" as const,
      onInitialize: () => {},
      onCreateRequest: () => {},
    } as unknown as Parameters<typeof MainView>[0]

    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <MainView {...props} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 30 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Health check")
    expect(frame).toContain("Request")
    expect(renderer.root.findDescendantById("empty-state")).toBeUndefined()

    cleanup()
  })
})
