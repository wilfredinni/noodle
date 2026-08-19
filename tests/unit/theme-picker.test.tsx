import { describe, it, expect } from "bun:test"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { THEMES, ThemePickerOverlay, ThemeProvider } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

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

  it("scrolls the active theme into view when opened", async () => {
    const synthwaveIndex = THEMES.findIndex(
      (theme) => theme.name === "synthwave84",
    )
    expect(synthwaveIndex).toBeGreaterThan(-1)

    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider
          activeIndex={synthwaveIndex}
          previewIndex={synthwaveIndex}
        >
          <ThemePickerOverlay
            visible
            activeIndex={synthwaveIndex}
            previewIndex={synthwaveIndex}
            setPreviewIndex={() => {}}
            onThemeChange={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 30 },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await renderOnce()
    expect(captureCharFrame()).toContain("synthwave84")
    cleanup()
  })
})
