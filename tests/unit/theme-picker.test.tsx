import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemePickerOverlay, ThemeProvider } from "../../src/ui/theme"

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

describe("ThemePickerOverlay", () => {
  it("renders all themes when search is empty", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ThemePickerOverlay
            visible
            activeIndex={0}
            previewIndex={0}
            setPreviewIndex={() => {}}
            onThemeChange={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("aura")
    expect(frame).toContain("matrix")
    cleanup()
  })

  it("shows header with title and esc hint", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ThemePickerOverlay
            visible
            activeIndex={0}
            previewIndex={0}
            setPreviewIndex={() => {}}
            onThemeChange={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Themes")
    expect(frame).toContain("esc")
    cleanup()
  })

  it("shows search input with placeholder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ThemePickerOverlay
            visible
            activeIndex={0}
            previewIndex={0}
            setPreviewIndex={() => {}}
            onThemeChange={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Search themes")
    cleanup()
  })

  it("shows the dot indicator for the active theme", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={0}>
          <ThemePickerOverlay
            visible
            activeIndex={0}
            previewIndex={0}
            setPreviewIndex={() => {}}
            onThemeChange={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 30 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("\u25cf")
    cleanup()
  })
})
