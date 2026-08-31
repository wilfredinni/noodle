import { describe, it, expect } from "bun:test"
import { act } from "react"
import { createTestRender } from "../testRender"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { Tabs } from "../../src/ui/Tabs"
import { ThemeProvider, THEMES } from "../../src/ui/theme"

const testRender = createTestRender()

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

  it("renders a tab indicator with its own color", async () => {
    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Tabs
          tabs={[
            {
              id: "a",
              label: "Tab A",
              indicator: { symbol: "✓", color: THEMES[0]!.success },
            },
          ]}
          activeId="a"
        >
          <text>content</text>
        </Tabs>
      </ThemeProvider>,
      { width: 30, height: 5 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("Tab A ✓")
    const indicator = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.trim() === "✓")
    expect(indicator?.fg.equals(RGBA.fromHex(THEMES[0]!.success))).toBe(true)
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

  it("selects a tab on left click only", async () => {
    let selected = ""
    const { renderOnce, mockMouse } = await testRender(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A" },
          { id: "b", label: "Tab B" },
        ]}
        activeId="a"
        onChange={(id) => {
          selected = id
        }}
      >
        <text>content</text>
      </Tabs>,
      { width: 30, height: 5 },
    )
    await renderOnce()

    await mockMouse.click(9, 0, MouseButtons.RIGHT)
    expect(selected).toBe("")

    await mockMouse.click(9, 0, MouseButtons.LEFT)
    expect(selected).toBe("b")
  })

  it("highlights clickable tabs while the mouse is over them", async () => {
    const { renderOnce, captureSpans, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Tabs
          tabs={[
            { id: "a", label: "Tab A" },
            { id: "b", label: "Tab B" },
          ]}
          activeId="a"
          onChange={() => {}}
        >
          <text>content</text>
        </Tabs>
      </ThemeProvider>,
      { width: 30, height: 5 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.moveTo(9, 0)
    })
    await renderOnce()

    const hoverColor = RGBA.fromHex(THEMES[0]!.text)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("Tab B"))
    expect(hoveredSpan!.fg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.moveTo(29, 4)
    })
    await renderOnce()

    const unhoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("Tab B"))
    expect(unhoveredSpan!.fg.equals(hoverColor)).toBe(false)
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

  it("clips overflowing tabs and keeps right content visible", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "first", label: "First Tab" },
          { id: "middle", label: "Middle Tab" },
          { id: "last", label: "Last Tab" },
        ]}
        activeId="first"
        rightChildren={<text>esc</text>}
      >
        <text>content</text>
      </Tabs>,
      { width: 18, height: 5 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("First Tab")
    expect(frame).toContain("esc")
    expect(frame).not.toContain("Last Tab")
  })

  it("draws an inactive underline across unused header space", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs tabs={[{ id: "a", label: "Tab A" }]} activeId="a">
        <text>content</text>
      </Tabs>,
      { width: 30, height: 5 },
    )
    await renderOnce()

    expect(captureCharFrame().split("\n")[1]).toBe("─".repeat(30))
  })

  it("renders jump badges above their tabs", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <box style={{ paddingTop: 1 }}>
        <Tabs
          tabs={[
            { id: "a", label: "Tab A", jumpHint: "h" },
            { id: "b", label: "Tab B", jumpHint: "p" },
          ]}
          activeId="a"
        >
          <text>content</text>
        </Tabs>
      </box>,
      { width: 30, height: 7 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain(" h ")
    expect(frame).toContain(" p ")
  })

  it("keeps the parent border intact outside jump badges", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <box
        border={["top", "right", "bottom", "left"]}
        style={{ width: 30, height: 6 }}
      >
        <Tabs
          tabs={[
            { id: "a", label: "Tab A", jumpHint: "h" },
            { id: "b", label: "Tab B", jumpHint: "p" },
          ]}
          activeId="a"
        >
          <text>content</text>
        </Tabs>
      </box>,
      { width: 30, height: 6 },
    )
    await renderOnce()

    const [topBorder, tabRow, underline, contentRow] =
      captureCharFrame().split("\n")
    expect(topBorder![0]).toBe("┌")
    expect(topBorder!.slice(1, 4)).toBe(" h ")
    expect(topBorder!.slice(4, 9)).toBe("─".repeat(5))
    expect(topBorder!.slice(9, 12)).toBe(" p ")
    expect(topBorder!.slice(12, -1)).toBe("─".repeat(17))
    expect(topBorder!.at(-1)).toBe("┐")
    expect(tabRow).toContain("Tab A")
    expect(underline).toContain("─")
    expect(contentRow).toContain("content")
  })

  it("reveals the active tab when it starts outside the viewport", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <Tabs
        tabs={[
          { id: "first", label: "First Tab" },
          { id: "middle", label: "Middle Tab" },
          { id: "last", label: "Last Tab" },
        ]}
        activeId="last"
      >
        <text>content</text>
      </Tabs>,
      { width: 12, height: 5 },
    )
    await renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await renderOnce()

    expect(captureCharFrame()).toContain("Last Tab")
  })

  it("scrolls overflowing tabs with the mouse wheel", async () => {
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <Tabs
        tabs={[
          { id: "first", label: "First Tab" },
          { id: "middle", label: "Middle Tab" },
          { id: "last", label: "Last Tab" },
        ]}
        activeId="first"
      >
        <text>content</text>
      </Tabs>,
      { width: 16, height: 5 },
    )
    await renderOnce()
    expect(captureCharFrame()).not.toContain("Last Tab")

    for (let i = 0; i < 12; i += 1) {
      await mockMouse.scroll(5, 0, "down")
    }
    await renderOnce()

    expect(captureCharFrame()).toContain("Middle Tab")
  })

  it("scrolls tabs when the mouse is over jump badges", async () => {
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <box style={{ paddingTop: 1 }}>
        <Tabs
          tabs={[
            { id: "first", label: "First Tab", jumpHint: "h" },
            { id: "middle", label: "Middle Tab", jumpHint: "p" },
            { id: "last", label: "Last Tab", jumpHint: "b" },
          ]}
          activeId="first"
        >
          <text>content</text>
        </Tabs>
      </box>,
      { width: 16, height: 6 },
    )
    await renderOnce()

    for (let i = 0; i < 12; i += 1) {
      await mockMouse.scroll(5, 0, "down")
    }
    await renderOnce()

    expect(captureCharFrame()).toContain("Middle Tab")
  })
})
