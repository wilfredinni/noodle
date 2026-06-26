import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { Tabs } from "../../src/ui/Tabs"
import { ThemeProvider } from "../../src/ui/theme"

describe("Tabs", () => {
  it("renders all tab labels", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
          { id: "c", label: "Tab C" },
        ]}
        activeId="a"
      >
        <text>content a</text>
      </Tabs>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Tab A")
    expect(frame).toContain("Tab B")
    expect(frame).toContain("Tab C")
  })

  it("renders content for the active tab", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
        ]}
        activeId="b"
      >
        <text>content for b</text>
      </Tabs>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("content for b")
  })

  it("shows ▸ prefix on active tab", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
        ]}
        activeId="a"
      >
        <text>content</text>
      </Tabs>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("▸")
  })

  it("active tab has primary foreground and no background highlight", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Tabs
          tabs={[
            { id: "a", label: "Tab A" },
            { id: "b", label: "Tab B" },
          ]}
          activeId="a"
        >
          <text>content</text>
        </Tabs>
      </ThemeProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)

    const activeSpan = allSpans.find((s) => s.text.includes("▸ Tab A"))
    expect(activeSpan).toBeDefined()
    // active tab text should be primary color (opencode: #fab283)
    expect(activeSpan!.fg.equals(RGBA.fromInts(250, 178, 131))).toBe(true)
    // active tab should NOT have primary-colored background
    expect(activeSpan!.bg.equals(RGBA.fromInts(250, 178, 131))).toBe(false)

    const inactiveSpan = allSpans.find((s) => s.text.includes("Tab B"))
    expect(inactiveSpan).toBeDefined()
    // inactive tab should be muted
    expect(inactiveSpan!.fg.equals(RGBA.fromInts(128, 128, 128))).toBe(true)
  })
})
