import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { Sidebar } from "../../src/ui/Sidebar"
import { ThemeProvider } from "../../src/ui/theme"

describe("Sidebar", () => {
  it("selects a request on left click only", async () => {
    let selected = ""
    let focused = 0
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
        />
      </ThemeProvider>,
      { width: 40, height: 8 },
    )
    await renderOnce()

    await mockMouse.click(2, 1, MouseButtons.RIGHT)
    expect(selected).toBe("")
    expect(focused).toBe(0)

    await mockMouse.click(3, 1, MouseButtons.LEFT)
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

    await mockMouse.click(3, 1, MouseButtons.LEFT)
    expect(toggled).toBe("api")
    expect(selected).toBe("")

    await mockMouse.click(6, 1, MouseButtons.LEFT)
    expect(selected).toBe("api")
  })
})
