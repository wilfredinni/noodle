import { describe, it, expect } from "bun:test"
import { act, useState } from "react"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { CliRenderEvents, RGBA, type TerminalColors } from "@opentui/core"
import {
  THEMES,
  ThemePickerOverlay,
  ThemeProvider,
  useTheme,
} from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function terminalColors(cyan = "#22ccdd"): TerminalColors {
  return {
    palette: [
      "#ffffff",
      "#cc0000",
      "#00cc00",
      "#cccc00",
      "#0000cc",
      "#cc00cc",
      cyan,
      "#000000",
      ...Array(8).fill(null),
    ],
    defaultForeground: "#000000",
    defaultBackground: "#ffffff",
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
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
    expect(frame).toContain("claude-code")
    expect(frame).toContain("material")
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

  it("exposes the system theme and scrolls it into view when active", async () => {
    const systemIndex = THEMES.findIndex((theme) => theme.name === "system")
    expect(systemIndex).toBeGreaterThan(-1)

    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, captureSpans, renderer } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={systemIndex} previewIndex={systemIndex}>
            <ThemePickerOverlay
              visible
              activeIndex={systemIndex}
              previewIndex={systemIndex}
              setPreviewIndex={() => {}}
              onThemeChange={() => {}}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 60, height: 30 },
      )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await renderOnce()
    expect(captureCharFrame()).toContain("system")
    await act(async () => {
      renderer.emit(CliRenderEvents.PALETTE, terminalColors("#003333"))
    })
    await renderOnce()
    const systemLabel = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("system"))
    expect(systemLabel?.fg.equals(RGBA.fromHex("#f0f0f0"))).toBe(true)
    cleanup()
  })
})

function ThemeProbe() {
  const theme = useTheme()
  return <text>{`${theme.primary}|${theme.backgroundPanel}`}</text>
}

describe("system ThemeProvider", () => {
  it("repaints when OpenTUI publishes a later terminal palette", async () => {
    const systemIndex = THEMES.findIndex((theme) => theme.name === "system")
    const render = await testRender(
      <ThemeProvider activeIndex={systemIndex} previewIndex={null}>
        <ThemeProbe />
      </ThemeProvider>,
      { width: 40, height: 4 },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await render.renderOnce()

    const colors = terminalColors()
    await act(async () => {
      render.renderer.emit(CliRenderEvents.PALETTE, colors)
    })
    await render.renderOnce()

    expect(render.captureCharFrame()).toContain("#22ccdd|#ffffff")
  })

  it("refreshes for terminal-theme notifications and ignores queued work after cleanup", async () => {
    const systemIndex = THEMES.findIndex((theme) => theme.name === "system")
    let leaveSystem = () => {}
    function Harness() {
      const [previewIndex, setPreviewIndex] = useState<number | null>(null)
      leaveSystem = () => setPreviewIndex(0)
      return (
        <ThemeProvider activeIndex={systemIndex} previewIndex={previewIndex}>
          <ThemeProbe />
        </ThemeProvider>
      )
    }

    const render = await testRender(<Harness />, { width: 40, height: 4 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    let paletteQueries = 0
    render.renderer.getPalette = async () => {
      paletteQueries++
      return terminalColors()
    }

    await act(async () => {
      render.mockInput.pressKey("\x1b[?997;1n")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await render.renderOnce()
    expect(paletteQueries).toBe(1)
    expect(render.captureCharFrame()).toContain("#22ccdd|#ffffff")

    act(() => {
      render.mockInput.pressKey("\x1b[?997;2n")
      leaveSystem()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(paletteQueries).toBe(1)
  })
})
