import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import type { BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { FullBorder } from "../../src/ui/borders"
import { MainView } from "../../src/ui/MainView"
import { SIDEBAR_WIDTH } from "../../src/ui/Sidebar"

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
    await act(async () => {
      await renderOnce()
      await renderOnce()
    })

    const frame = captureCharFrame()
    expect(frame).toContain("No requests in this collection")
    expect(frame).toContain("Create request")
    expect(
      renderer.root.findDescendantById("empty-state-title"),
    ).toBeUndefined()
    expect(
      renderer.root.findDescendantById("sidebar-resize-handle"),
    ).toBeUndefined()
    expect(
      renderer.root.findDescendantById("request-response-resize-handle"),
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
    await act(async () => {
      await renderOnce()
      await renderOnce()
    })

    const frame = captureCharFrame()
    expect(frame).toContain("Health check")
    expect(frame).toContain("Request")
    expect(renderer.root.findDescendantById("empty-state")).toBeUndefined()

    cleanup()
  })

  it("resizes, clamps, and resets main panes without changing handle focus", async () => {
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
      focus: "request" as const,
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
    let paneFocusCalls = 0
    let changeLayout = (_layout: "stacked" | "side-by-side") => {}
    let changeExpanded = (_expanded: "request" | "response" | null) => {}

    function Harness() {
      const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH)
      const [layout, setLayout] = useState<"stacked" | "side-by-side">(
        "stacked",
      )
      const [expanded, setExpanded] = useState<"request" | "response" | null>(
        null,
      )
      const [ratios, setRatios] = useState<
        Record<"stacked" | "side-by-side", number>
      >({ stacked: 0.5, "side-by-side": 0.5 })
      changeLayout = setLayout
      changeExpanded = setExpanded
      return (
        <MainView
          {...props}
          layout={layout}
          expanded={expanded}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={setSidebarWidth}
          paneSplitRatio={ratios[layout]}
          onPaneSplitRatioChange={(ratio) =>
            setRatios((current) => ({ ...current, [layout]: ratio }))
          }
          onPaneFocus={() => paneFocusCalls++}
        />
      )
    }

    const { captureCharFrame, renderOnce, renderer, mockMouse, resize } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <Harness />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 140, height: 30 },
      )
    await act(async () => {
      await renderOnce()
      await renderOnce()
    })

    const main = renderer.root.findDescendantById("main-view") as BoxRenderable
    const handle = renderer.root.findDescendantById(
      "sidebar-resize-handle",
    ) as BoxRenderable
    expect(main.width).toBe(140)
    expect(handle.screenX - main.screenX).toBe(SIDEBAR_WIDTH)
    const sidebarHandleY = handle.screenY + Math.floor(handle.height / 2)
    expect(handle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.moveTo(handle.screenX, sidebarHandleY)
    })
    await renderOnce()
    expect(handle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.pressDown(
        handle.screenX,
        sidebarHandleY,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(handle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.release(handle.screenX, sidebarHandleY, MouseButtons.LEFT)
    })
    await renderOnce()
    const drag = async (x: number) => {
      await act(async () => {
        await mockMouse.pressDown(
          handle.screenX,
          handle.screenY + Math.floor(handle.height / 2),
          MouseButtons.LEFT,
        )
        await mockMouse.moveTo(
          x,
          handle.screenY + Math.floor(handle.height / 2),
        )
        await mockMouse.release(
          x,
          handle.screenY + Math.floor(handle.height / 2),
          MouseButtons.LEFT,
        )
      })
      await renderOnce()
    }

    await drag(main.screenX)
    expect(handle.screenX - main.screenX).toBe(20)

    await drag(main.screenX + main.width - 1)
    expect(handle.screenX - main.screenX).toBe(main.width - 1 - 32)
    const preferredWidth = handle.screenX - main.screenX

    await act(async () => {
      resize(70, 30)
      await renderOnce()
    })
    await renderOnce()
    expect(handle.screenX - main.screenX).toBe(main.width - 1 - 32)

    await act(async () => {
      resize(140, 30)
      await renderOnce()
      await renderOnce()
    })
    await renderOnce()
    expect(handle.screenX - main.screenX).toBe(preferredWidth)

    await act(async () => {
      await mockMouse.click(handle.screenX, sidebarHandleY, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(handle.screenX - main.screenX).toBe(preferredWidth)
    await act(async () => {
      await mockMouse.click(handle.screenX, sidebarHandleY, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(handle.screenX - main.screenX).toBe(SIDEBAR_WIDTH)
    expect(paneFocusCalls).toBe(0)

    const split = renderer.root.findDescendantById(
      "request-response-split",
    ) as BoxRenderable
    let splitHandle = renderer.root.findDescendantById(
      "request-response-resize-handle",
    ) as BoxRenderable
    const requestSlot = renderer.root.findDescendantById(
      "request-pane-slot",
    ) as BoxRenderable
    const responseSlot = renderer.root.findDescendantById(
      "response-pane-slot",
    ) as BoxRenderable
    let stackedResponseHandle = renderer.root.findDescendantById(
      "request-response-resize-handle-response-edge",
    ) as BoxRenderable
    expect(responseSlot.screenY).toBe(requestSlot.screenY + requestSlot.height)
    expect(splitHandle.screenY).toBe(
      requestSlot.screenY + requestSlot.height - 1,
    )
    expect(splitHandle.height).toBe(1)
    expect(stackedResponseHandle.screenY).toBe(responseSlot.screenY)
    expect(stackedResponseHandle.height).toBe(1)
    expect(stackedResponseHandle.backgroundColor.a).toBe(0)
    const stackedRows = captureCharFrame().split("\n")
    expect(stackedRows[splitHandle.screenY]?.[requestSlot.screenX]).toBe("└")
    expect(stackedRows[responseSlot.screenY]?.[responseSlot.screenX]).toBe("┌")
    const splitHandleX = splitHandle.screenX + Math.floor(splitHandle.width / 2)
    expect(splitHandle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.moveTo(splitHandleX, splitHandle.screenY)
    })
    await renderOnce()
    expect(splitHandle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.pressDown(
        splitHandleX,
        splitHandle.screenY,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(splitHandle.backgroundColor.a).toBe(0)
    await act(async () => {
      await mockMouse.release(
        splitHandleX,
        splitHandle.screenY,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    const stackedAvailableHeight = split.height

    await act(async () => {
      await mockMouse.pressDown(
        stackedResponseHandle.screenX +
          Math.floor(stackedResponseHandle.width / 2),
        stackedResponseHandle.screenY,
        MouseButtons.LEFT,
      )
      await mockMouse.moveTo(
        splitHandle.screenX,
        split.screenY + split.height - 1,
      )
      await mockMouse.release(
        splitHandle.screenX,
        split.screenY + split.height - 1,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(requestSlot.height).toBe(stackedAvailableHeight - 6)
    const stackedRequestHeight = requestSlot.height

    act(() => changeLayout("side-by-side"))
    await renderOnce()
    splitHandle = renderer.root.findDescendantById(
      "request-response-resize-handle",
    ) as BoxRenderable
    expect(splitHandle.screenX).toBe(requestSlot.screenX + requestSlot.width)
    expect(responseSlot.screenX).toBe(splitHandle.screenX + 1)
    expect(
      renderer.root.findDescendantById(
        "request-response-resize-handle-response-edge",
      ),
    ).toBeUndefined()
    const sideBySideRows = captureCharFrame().split("\n")
    const sideBySideContentRow = sideBySideRows[requestSlot.screenY + 1]
    expect(
      sideBySideContentRow?.[requestSlot.screenX + requestSlot.width - 1],
    ).toBe("│")
    expect(sideBySideContentRow?.[splitHandle.screenX]).toBe(" ")
    expect(sideBySideContentRow?.[responseSlot.screenX]).toBe("│")
    await act(async () => {
      await mockMouse.pressDown(
        splitHandle.screenX,
        splitHandle.screenY + Math.floor(splitHandle.height / 2),
        MouseButtons.LEFT,
      )
      await mockMouse.moveTo(
        main.screenX + 2,
        splitHandle.screenY + Math.floor(splitHandle.height / 2),
      )
      await mockMouse.release(
        main.screenX + 2,
        splitHandle.screenY + Math.floor(splitHandle.height / 2),
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(requestSlot.width).toBe(16)
    expect(responseSlot.width).toBeGreaterThanOrEqual(16)
    expect(paneFocusCalls).toBe(0)

    await act(async () => {
      await mockMouse.pressDown(
        requestSlot.screenX + 2,
        requestSlot.screenY + 2,
        MouseButtons.LEFT,
      )
      await mockMouse.moveTo(
        responseSlot.screenX + responseSlot.width - 2,
        responseSlot.screenY + 2,
      )
      await mockMouse.release(
        responseSlot.screenX + responseSlot.width - 2,
        responseSlot.screenY + 2,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(requestSlot.width).toBe(16)

    await act(async () => {
      resize(75, 30)
      await renderOnce()
    })
    await renderOnce()
    expect(requestSlot.width).toBe(16)
    expect(responseSlot.width).toBeGreaterThanOrEqual(16)

    await act(async () => {
      resize(100, 30)
      await renderOnce()
    })
    await renderOnce()
    expect(requestSlot.width).toBe(16)

    act(() => changeLayout("stacked"))
    await renderOnce()
    expect(requestSlot.height).toBe(stackedRequestHeight)
    const paneFocusBeforeReset = paneFocusCalls

    splitHandle = renderer.root.findDescendantById(
      "request-response-resize-handle",
    ) as BoxRenderable
    stackedResponseHandle = renderer.root.findDescendantById(
      "request-response-resize-handle-response-edge",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.doubleClick(
        stackedResponseHandle.screenX +
          Math.floor(stackedResponseHandle.width / 2),
        stackedResponseHandle.screenY,
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(
      Math.abs(requestSlot.height - responseSlot.height),
    ).toBeLessThanOrEqual(1)

    act(() => changeLayout("side-by-side"))
    await renderOnce()
    expect(requestSlot.width).toBe(16)
    splitHandle = renderer.root.findDescendantById(
      "request-response-resize-handle",
    ) as BoxRenderable
    await act(async () => {
      await mockMouse.doubleClick(
        splitHandle.screenX,
        splitHandle.screenY + Math.floor(splitHandle.height / 2),
        MouseButtons.LEFT,
      )
    })
    await renderOnce()
    expect(
      Math.abs(requestSlot.width - responseSlot.width),
    ).toBeLessThanOrEqual(1)
    expect(paneFocusCalls).toBe(paneFocusBeforeReset)

    act(() => changeExpanded("request"))
    await renderOnce()
    expect(
      renderer.root.findDescendantById("request-response-resize-handle"),
    ).toBeUndefined()
    expect(
      renderer.root.findDescendantById(
        "request-response-resize-handle-response-edge",
      ),
    ).toBeUndefined()
    expect(
      renderer.root.findDescendantById("sidebar-resize-handle"),
    ).toBeDefined()

    cleanup()
  })

  it("keeps collection errors in the repair view while reloading", async () => {
    const { keymap, cleanup } = setupKeymap()
    const error = new Error("collection failed") as Error & {
      fileErrors: Array<{
        file: string
        message: string
        rawError: string
      }>
    }
    error.fileErrors = [
      {
        file: "collection",
        message: "Could not read collection",
        rawError: "Could not read collection",
      },
    ]
    const props = {
      items: [],
      collectionDir: "/tmp/noodle-errors",
      loading: true,
      error,
      focus: "sidebar" as const,
      activeEnv: null,
      mode: "collection" as const,
      onInitialize: () => {},
      onCreateRequest: () => {},
      onCollectionErrorSaved: () => {},
    } as unknown as Parameters<typeof MainView>[0]
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <MainView {...props} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 20 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Could not read collection")
    expect(frame).not.toContain("Collection Error")
    expect(frame).not.toContain("Problems")
    expect(frame).not.toContain("No collection found")
    expect(
      renderer.root.findDescendantById("sidebar-resize-handle"),
    ).toBeUndefined()
    expect(
      renderer.root.findDescendantById("request-response-resize-handle"),
    ).toBeUndefined()
    cleanup()
  })
})
