import { describe, expect, it } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { Sidebar } from "../../src/ui/Sidebar"
import { ThemeProvider } from "../../src/ui/theme"

const testRender = createTestRender()

describe("Sidebar", () => {
  it("selects on left click and opens the request context menu on right click", async () => {
    let selected = ""
    let focused = 0
    let contextId = ""
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          items={[]}
          loading={false}
          error={null}
          visibleItems={[
            {
              type: "request",
              id: "example",
              name: "Example",
              depth: 0,
              expanded: false,
              hasChildren: false,
              method: "GET",
            },
          ]}
          cursorIndex={0}
          selectedId="example"
          expanded={new Set()}
          onPaneFocus={() => focused++}
          onRequestSelect={(id) => {
            selected = id
          }}
          onRequestContextMenu={(id) => {
            contextId = id
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(2, 1, MouseButtons.RIGHT)
    })
    expect(selected).toBe("")
    expect(focused).toBe(0)
    expect(contextId).toBe("example")

    await act(async () => {
      await mockMouse.click(3, 1, MouseButtons.LEFT)
    })
    expect(selected).toBe("example")
    expect(focused).toBe(1)
  })

  it("toggles a folder only when its chevron is clicked", async () => {
    let selected = ""
    let toggled = ""
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          items={[]}
          loading={false}
          error={null}
          visibleItems={[
            {
              type: "folder",
              id: "api",
              name: "API",
              depth: 0,
              expanded: false,
              hasChildren: true,
            },
          ]}
          cursorIndex={0}
          selectedId={null}
          expanded={new Set()}
          onFolderSelect={(id) => {
            selected = id
          }}
          onFolderToggle={(id) => {
            toggled = id
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(3, 1, MouseButtons.LEFT)
    })
    expect(toggled).toBe("api")
    expect(selected).toBe("")

    await act(async () => {
      await mockMouse.click(6, 1, MouseButtons.LEFT)
    })
    expect(selected).toBe("api")
  })

  it("opens the folder context menu on right click", async () => {
    let contextId = ""
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          items={[]}
          loading={false}
          error={null}
          visibleItems={[
            {
              type: "folder",
              id: "api",
              name: "API",
              depth: 0,
              expanded: false,
              hasChildren: true,
            },
          ]}
          cursorIndex={0}
          selectedId={null}
          expanded={new Set()}
          onFolderContextMenu={(id) => {
            contextId = id
          }}
        />
      </ThemeProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(6, 1, MouseButtons.RIGHT)
    })
    expect(contextId).toBe("api")
  })

  it("shows more of folder and request names as the sidebar grows", async () => {
    const visibleItems = [
      {
        type: "folder" as const,
        id: "folder",
        name: "Long folder name expands",
        depth: 1,
        expanded: false,
        hasChildren: true,
      },
      {
        type: "request" as const,
        id: "request",
        name: "Long request name expands",
        depth: 1,
        expanded: false,
        hasChildren: false,
        method: "GET",
      },
      {
        type: "request" as const,
        id: "emoji",
        name: "A😊BCDEFG",
        depth: 1,
        expanded: false,
        hasChildren: false,
        method: "GET",
      },
    ]
    const renderSidebar = (width: number) => (
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Sidebar
          items={[]}
          loading={false}
          error={null}
          visibleItems={visibleItems}
          cursorIndex={0}
          selectedId="request"
          expanded={new Set()}
          dirtyFolderPaths={new Set(["folder"])}
          dirtyRequestIds={new Set(["request", "emoji"])}
          width={width}
        />
      </ThemeProvider>
    )

    const narrow = await testRender(renderSidebar(24), {
      width: 50,
      height: 8,
    })
    await narrow.renderOnce()
    const narrowFrame = narrow.captureCharFrame()
    expect(narrowFrame).toContain("Long folder…")
    expect(narrowFrame).toContain("Long…")
    expect(narrowFrame).toContain("A😊B…")
    expect(narrowFrame.match(/●/g)).toHaveLength(3)

    const wide = await testRender(renderSidebar(45), {
      width: 50,
      height: 8,
    })
    await wide.renderOnce()
    const wideFrame = wide.captureCharFrame()
    expect(wideFrame).toContain("Long folder name expands")
    expect(wideFrame).toContain("Long request name expands")
    expect(wideFrame).toContain("A😊BCDEFG")
  })
})
