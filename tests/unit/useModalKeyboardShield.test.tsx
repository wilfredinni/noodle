import { describe, expect, it, spyOn } from "bun:test"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { act } from "react"
import {
  HARD_BLOCKING_OVERLAYS,
  EDITABLE_OVERLAYS,
  useModalKeyboardShield,
} from "../../src/ui/useModalKeyboardShield"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function Shield({ activeOverlay }: { activeOverlay: string }) {
  useModalKeyboardShield(activeOverlay)
  return null
}

describe("useModalKeyboardShield", () => {
  it("treats collection export as editable", () => {
    expect(EDITABLE_OVERLAYS).toContain("export-collection")
  })

  it("allows input for every editable overlay", async () => {
    for (const activeOverlay of EDITABLE_OVERLAYS) {
      const { keymap, host, cleanup } = setupKeymap()
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <Shield activeOverlay={activeOverlay} />
        </KeymapProvider>,
        { width: 1, height: 1 },
      )

      await render.renderOnce()
      const event = host.press("e")
      expect(event.defaultPrevented).toBe(false)
      expect(event.propagationStopped).toBe(false)
      cleanup()
      act(() => render.renderer.destroy())
    }
  })

  it("blocks lower-priority handlers for every non-editable overlay", async () => {
    for (const activeOverlay of HARD_BLOCKING_OVERLAYS) {
      const { keymap, host, cleanup } = setupKeymap()
      const backgroundKeys: string[] = []
      const dispose = keymap.intercept(
        "key",
        (ctx) => backgroundKeys.push(ctx.event.name),
        { priority: 0 },
      )
      const render = await testRender(
        <KeymapProvider keymap={keymap}>
          <Shield activeOverlay={activeOverlay} />
        </KeymapProvider>,
        { width: 1, height: 1 },
      )

      await render.renderOnce()
      host.press("e")
      expect(backgroundKeys).toEqual([])
      dispose()
      cleanup()
      act(() => render.renderer.destroy())
    }
  })

  it("does not hard-block unknown overlays", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    const { keymap, host, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <Shield activeOverlay="future-overlay" />
      </KeymapProvider>,
      { width: 1, height: 1 },
    )
    try {
      await render.renderOnce()
      const event = host.press("e")
      expect(event.defaultPrevented).toBe(false)
      expect(event.propagationStopped).toBe(false)
      expect(warn).toHaveBeenCalledWith(
        'useModalKeyboardShield: unknown overlay "future-overlay"; treating it as editable',
      )
    } finally {
      cleanup()
      act(() => render.renderer.destroy())
      warn.mockRestore()
    }
  })
})
