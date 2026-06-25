import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA, TextAttributes } from "@opentui/core"
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

  it("shows focus prefix on active tab when focused", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
        ]}
        activeId="a"
        focused
      >
        <text>content</text>
      </Tabs>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("▸ Tab A")
  })

  it("does not show focus prefix when not focused", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
        ]}
        activeId="a"
        focused={false}
      >
        <text>content</text>
      </Tabs>,
      { width: 60, height: 10 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toContain("▸")
  })

  it("active tab has theme primary background and contrast text instead of INVERSE", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider
        isSelectingRef={{ current: false }}
        previewIndexRef={{ current: null }}
        blocking={() => false}
      >
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
    const allSpans = frame.lines.flatMap(l => l.spans)

    const activeSpan = allSpans.find(s => s.text.includes("Tab A"))
    expect(activeSpan).toBeDefined()
    expect(activeSpan!.bg.equals(RGBA.fromInts(250, 178, 131))).toBe(true)
    expect(activeSpan!.fg.equals(RGBA.fromInts(26, 26, 26))).toBe(true)
    expect(activeSpan!.attributes & TextAttributes.INVERSE).toBe(0)

    const inactiveSpan = allSpans.find(s => s.text.includes("Tab B"))
    expect(inactiveSpan).toBeDefined()
    expect(inactiveSpan!.bg.equals(RGBA.fromInts(250, 178, 131))).toBe(false)
  })
})
