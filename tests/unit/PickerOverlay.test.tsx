import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { PickerOverlay, type PickerItem } from "../../src/ui/PickerOverlay"

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

const testItems: PickerItem[] = [
  { id: "a", label: "Alpha", value: 1 },
  { id: "b", label: "Beta", value: 2 },
  { id: "c", label: "Gamma", value: 3 },
]

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
            activeId="a"
            onSelect={() => {}}
            onClose={() => {}}
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
            activeId="a"
            onSelect={() => {}}
            onClose={() => {}}
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

  it("shows indicator for all items", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={testItems}
            activeId="a"
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    const circleCount = (frame.match(/\u25cf/g) ?? []).length
    expect(circleCount).toBe(3)
    cleanup()
  })

  it("active item indicator uses custom indicatorColor", async () => {
    const itemsWithColor: PickerItem[] = [
      { id: "a", label: "Red", value: "red", indicatorColor: "#ff0000" },
    ]
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <PickerOverlay
            visible
            title="Test"
            items={itemsWithColor}
            activeId="a"
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Red")
    expect(frame).toContain("\u25cf")
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
            activeId="a"
            onSelect={() => {}}
            onClose={() => {}}
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
})
