import { describe, expect, it } from "bun:test"
import { act } from "react"
import { RGBA, ScrollBoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { TimelineTab } from "../../src/ui/timeline/TimelineTab"
import type { TimelineEntry } from "../../src/schema"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function makeEntry(id: string): TimelineEntry {
  return {
    timestamp: Number(id),
    request: {
      id,
      name: id,
      method: "GET",
      url: `https://example.com/${id}`,
      headers: {},
      params: [],
    },
  }
}

async function renderTimeline(
  entries: TimelineEntry[],
  focused: boolean,
  onOpenEntry: (entry: TimelineEntry) => void,
) {
  const { keymap, cleanup } = setupKeymap()
  ;(
    keymap as unknown as { setData: (key: string, value: string) => void }
  ).setData("app.overlay", "none")
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <TimelineTab
          entries={entries}
          focused={focused}
          onOpenEntry={onOpenEntry}
        />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 80, height: 20 },
  )
  await act(async () => {
    await render.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  await render.renderOnce()
  return { ...render, cleanup }
}

describe("TimelineTab", () => {
  it("renders empty state", async () => {
    const { renderOnce, captureCharFrame, cleanup } = await renderTimeline(
      [],
      true,
      () => {},
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No timeline entries yet")
    cleanup()
  })

  it("opens entry selected after navigation", async () => {
    const entries = [makeEntry("1"), makeEntry("2"), makeEntry("3")]
    let opened: TimelineEntry | undefined
    const { renderOnce, mockInput, cleanup } = await renderTimeline(
      entries,
      true,
      (entry) => {
        opened = entry
      },
    )
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_DOWN"))
    await renderOnce()
    await act(async () => mockInput.pressKey("RETURN"))
    await renderOnce()
    expect(opened?.request.id).toBe("2")
    cleanup()
  })

  it("opens an entry on left click", async () => {
    const entries = [makeEntry("1"), makeEntry("2")]
    let opened: TimelineEntry | undefined
    const { renderOnce, mockMouse, cleanup } = await renderTimeline(
      entries,
      true,
      (entry) => {
        opened = entry
      },
    )
    await renderOnce()
    await act(async () => {
      await mockMouse.click(2, 0, MouseButtons.LEFT)
    })
    expect(opened?.request.id).toBe("1")
    cleanup()
  })

  it("wraps upward from first entry to last", async () => {
    const entries = [makeEntry("1"), makeEntry("2"), makeEntry("3")]
    let opened: TimelineEntry | undefined
    const { renderOnce, mockInput, cleanup } = await renderTimeline(
      entries,
      true,
      (entry) => {
        opened = entry
      },
    )
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_UP"))
    await renderOnce()
    await act(async () => mockInput.pressKey("RETURN"))
    await renderOnce()
    expect(opened?.request.id).toBe("3")
    cleanup()
  })

  it("ignores navigation when unfocused", async () => {
    const entries = [makeEntry("1"), makeEntry("2")]
    let opened: TimelineEntry | undefined
    const { renderOnce, mockInput, cleanup } = await renderTimeline(
      entries,
      false,
      (entry) => {
        opened = entry
      },
    )
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_DOWN"))
    await renderOnce()
    await act(async () => mockInput.pressKey("RETURN"))
    await renderOnce()
    expect(opened).toBeUndefined()
    cleanup()
  })

  it("shows a themed scrollbar when entries overflow", async () => {
    const entries = Array.from({ length: 30 }, (_, i) => makeEntry(String(i)))
    const { renderer, renderOnce, cleanup } = await renderTimeline(
      entries,
      true,
      () => {},
    )
    await renderOnce()
    await renderOnce()

    const scrollbox = renderer.root.findDescendantById("timeline-tab-scrollbox")
    expect(scrollbox).toBeInstanceOf(ScrollBoxRenderable)
    const scrollbar = (scrollbox as ScrollBoxRenderable).verticalScrollBar
    expect(scrollbar.visible).toBe(true)
    expect(
      scrollbar.slider.backgroundColor.equals(
        RGBA.fromHex(THEMES[0]!.background),
      ),
    ).toBe(true)
    expect(
      scrollbar.slider.foregroundColor.equals(
        RGBA.fromHex(THEMES[0]!.borderActive),
      ),
    ).toBe(true)
    cleanup()
  })
})
