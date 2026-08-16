import { describe, it, expect } from "bun:test"
import { act } from "react"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { THEMES, ThemeProvider } from "../../src/ui/theme"
import { PickerOverlay } from "../../src/ui/overlays/PickerOverlay"

const testRender = createTestRender()

function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

interface TestItem {
  id: string
  label: string
  value: number
}

const testItems: TestItem[] = [
  { id: "a", label: "Alpha", value: 1 },
  { id: "b", label: "Beta", value: 2 },
  { id: "c", label: "Gamma", value: 3 },
]

function noop() {}

describe("PickerOverlay", () => {
  it("renders title and esc hint", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Pick color"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item, query) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            }
            renderItem={(item) => <text>{item.label}</text>}
            activeItem={testItems[0]}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Pick color")
    expect(frame).toContain("esc")
    cleanup()
  })

  it("renders all items", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item, query) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            }
            renderItem={(item) => <text>{item.label}</text>}
            activeItem={testItems[0]}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Alpha")
    expect(frame).toContain("Beta")
    expect(frame).toContain("Gamma")
    cleanup()
  })

  it("passes active flag to renderItem for active item", async () => {
    const { keymap, cleanup } = setupKeymap()
    const activeLabels: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item, query) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            }
            renderItem={(item, { active }) => {
              if (active) activeLabels.push(item.id)
              return <text>{item.label}</text>
            }}
            activeItem={testItems[0]}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    expect(activeLabels).toEqual(["a"])
    cleanup()
  })

  it("renders custom content per item", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item, query) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            }
            renderItem={(item) => (
              <>
                <text>★</text>
                <text>{item.label}</text>
              </>
            )}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("★ Alpha")
    expect(frame).toContain("★ Beta")
    expect(frame).toContain("★ Gamma")
    cleanup()
  })

  it("returns null when not visible", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible={false}
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item, query) =>
              item.label.toLowerCase().includes(query.toLowerCase())
            }
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Test")
    expect(frame).not.toContain("Alpha")
    cleanup()
  })

  it("selects a navigable item when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    const selected: string[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={(item) => selected.push(item.id)}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("Beta"))
    const x = rows[y]!.indexOf("Beta")
    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    expect(selected).toEqual(["b"])
    cleanup()
  })

  it("down arrow highlights next item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const highlights: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
            onHighlightChange={(item) => highlights.push(item!.id)}
            highlightedItem={testItems[0]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("down")
    expect(highlights).toEqual(["b"])
    cleanup()
  })

  it("down arrow wraps to first item when at end", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const highlights: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
            onHighlightChange={(item) => highlights.push(item!.id)}
            highlightedItem={testItems[2]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("down")
    expect(highlights).toEqual(["a"])
    cleanup()
  })

  it("up arrow highlights previous item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const highlights: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
            onHighlightChange={(item) => highlights.push(item!.id)}
            highlightedItem={testItems[1]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("up")
    expect(highlights).toEqual(["a"])
    cleanup()
  })

  it("up arrow wraps to last item when at start", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const highlights: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
            onHighlightChange={(item) => highlights.push(item!.id)}
            highlightedItem={testItems[0]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("up")
    expect(highlights).toEqual(["c"])
    cleanup()
  })

  it("enter selects highlighted item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let selected: string | null = null
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={(item) => {
              selected = item.id
            }}
            onClose={noop}
            highlightedItem={testItems[1]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("return")
    expect(selected!).toBe("b")
    cleanup()
  })

  it("escape calls onClose", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let closed = false
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={() => {
              closed = true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    host.press("escape")
    expect(closed).toBe(true)
    cleanup()
  })

  it("filters items via filter function", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={(item) => item.id === "b"}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Beta")
    expect(frame).not.toContain("Alpha")
    expect(frame).not.toContain("Gamma")
    cleanup()
  })

  it("shows no results when filter returns empty", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => false}
            renderItem={(item) => <text>{item.label}</text>}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("No results found")
    cleanup()
  })

  it("keeps the first action visible when filtering returns no results", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => false}
            renderItem={(item) => <text>{item.label}</text>}
            firstAction={{ label: "Manage items", onSelect: noop }}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("No results found")
    expect(frame).toContain("Manage items")
    cleanup()
  })

  it("selects the first action with the keyboard instead of an item", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const selected: string[] = []
    let actionCount = 0
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            highlightedItem={testItems[2]}
            firstAction={{
              label: "Manage items",
              onSelect: () => actionCount++,
            }}
            onHighlightChange={noop}
            onSelect={(item) => selected.push(item.id)}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("down")
      host.press("return")
    })

    expect(actionCount).toBe(1)
    expect(selected).toEqual([])
    cleanup()
  })

  it("reflects first-action selection in its active styling", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    try {
      const { renderOnce, captureSpans } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <PickerOverlay
              visible
              title="Test"
              items={testItems}
              keyExtractor={(item) => item.id}
              filter={() => true}
              renderItem={(item) => <text>{item.label}</text>}
              highlightedItem={testItems[2]}
              firstAction={{
                label: "Manage items",
                shortcut: "f3",
                onSelect: noop,
              }}
              onHighlightChange={noop}
              onSelect={noop}
              onClose={noop}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 60, height: 20 },
      )
      await renderOnce()

      const actionShortcut = () =>
        captureSpans()
          .lines.flatMap((line) => line.spans)
          .find((span) => span.text.includes("f3"))?.fg

      expect(actionShortcut()?.equals(RGBA.fromHex(THEMES[0]!.text))).toBe(true)

      act(() => host.press("down"))
      await renderOnce()

      expect(actionShortcut()?.equals(RGBA.fromHex(THEMES[0]!.secondary))).toBe(
        true,
      )
    } finally {
      cleanup()
    }
  })

  it("wraps keyboard navigation through the first action", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const highlights: Array<string | null> = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            highlightedItem={testItems[0]}
            firstAction={{ label: "Manage items", onSelect: noop }}
            onHighlightChange={(item) => highlights.push(item?.id ?? null)}
            onSelect={noop}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("up")
      host.press("up")
    })

    expect(highlights).toEqual([null, "c"])
    cleanup()
  })

  it("selects the first action with the mouse instead of an item", async () => {
    const { keymap, cleanup } = setupKeymap()
    const selected: string[] = []
    let actionCount = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            keyExtractor={(item) => item.id}
            filter={() => true}
            renderItem={(item) => <text>{item.label}</text>}
            firstAction={{
              label: "Manage items",
              onSelect: () => actionCount++,
            }}
            onSelect={(item) => selected.push(item.id)}
            onClose={noop}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()

    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("Manage items"))
    const x = rows[y]!.indexOf("Manage items")
    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })

    expect(actionCount).toBe(1)
    expect(selected).toEqual([])
    cleanup()
  })
})
