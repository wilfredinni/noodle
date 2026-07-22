import { describe, it, expect } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { HelpOverlay } from "../../src/ui/overlays/HelpOverlay"
import { bindingDefaults } from "../../src/ui/keybind"
import { setupKeymap } from "./_helpers"

describe("HelpOverlay", () => {
  it("keeps spacing between long key hints and descriptions", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <HelpOverlay visible keybinds={bindingDefaults()} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 30 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("^alt+e          Edit YAML")
    cleanup()
  })

  it("handles arrow key scrolling without errors", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <HelpOverlay visible keybinds={bindingDefaults()} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 15 },
    )

    await renderOnce()
    expect(captureCharFrame()).toContain("Request Editing")

    act(() => {
      host.press("down")
    })
    await renderOnce()

    act(() => {
      host.press("up")
    })
    await renderOnce()

    act(() => {
      host.press("j")
    })
    await renderOnce()

    act(() => {
      host.press("k")
    })
    await renderOnce()

    cleanup()
  })
})
