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

  it("scrolls to bottom with end and back to top with home", async () => {
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
    let frame = captureCharFrame()
    expect(frame).toContain("Request Editing")

    for (let i = 0; i < 3; i++) {
      act(() => {
        host.press("down")
      })
      await renderOnce()
    }
    frame = captureCharFrame()
    expect(frame).toContain("Code Editor")

    act(() => {
      host.press("end")
    })
    await renderOnce()
    frame = captureCharFrame()
    expect(frame).toContain("Env Editor")

    act(() => {
      host.press("home")
    })
    await renderOnce()
    frame = captureCharFrame()
    expect(frame).toContain("Request Editing")

    act(() => {
      host.press("pagedown")
    })
    await renderOnce()
    frame = captureCharFrame()
    const pagedownFrame = frame
    act(() => {
      host.press("pageup")
    })
    await renderOnce()
    expect(captureCharFrame()).not.toBe(pagedownFrame)

    cleanup()
  })
})
