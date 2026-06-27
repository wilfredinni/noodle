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

  it("does not show ▸ prefix on any tab", async () => {
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
    expect(frame).not.toContain("▸")
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

    const { THEMES } = await import("../../src/ui/theme")
    const primaryRgba = RGBA.fromInts(
      Number.parseInt(THEMES[0]!.primary.slice(1, 3), 16),
      Number.parseInt(THEMES[0]!.primary.slice(3, 5), 16),
      Number.parseInt(THEMES[0]!.primary.slice(5, 7), 16),
    )
    const mutedRgba = RGBA.fromInts(
      Number.parseInt(THEMES[0]!.textMuted.slice(1, 3), 16),
      Number.parseInt(THEMES[0]!.textMuted.slice(3, 5), 16),
      Number.parseInt(THEMES[0]!.textMuted.slice(5, 7), 16),
    )

    const activeSpan = allSpans.find((s) => s.text.includes("Tab A"))
    expect(activeSpan).toBeDefined()
    expect(activeSpan!.fg.equals(primaryRgba)).toBe(true)
    expect(activeSpan!.bg.equals(primaryRgba)).toBe(false)

    const inactiveSpan = allSpans.find((s) => s.text.includes("Tab B"))
    expect(inactiveSpan).toBeDefined()
    expect(inactiveSpan!.fg.equals(mutedRgba)).toBe(true)
  })
})
