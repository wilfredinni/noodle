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
import { ConfirmOverlay } from "../../src/ui/overlays/ConfirmOverlay"

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

describe("Delete confirmation", () => {
  it("ConfirmOverlay shows delete environment message", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible
            message='Delete environment "staging"?'
            selectedIndex={0}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Delete environment")
    expect(frame).toContain("staging")
    expect(frame).toContain("Confirm")
    expect(frame).toContain("y")
    expect(frame).toContain("n")
    cleanup()
  })

  it("ConfirmOverlay returns null when visible is false", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible={false}
            message='Delete environment "staging"?'
            selectedIndex={0}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Delete environment")
    cleanup()
  })

  it("ConfirmOverlay shows Y and N with labels", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message="Delete?" selectedIndex={0} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Confirm")
    expect(frame).toContain("cancel")
    cleanup()
  })

  it("renders esc hint", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message="Delete?" selectedIndex={0} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("esc")
    cleanup()
  })
})
