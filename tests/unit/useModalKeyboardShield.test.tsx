import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import {
  HARD_BLOCKING_OVERLAYS,
  EDITABLE_OVERLAYS,
  useModalKeyboardShield,
} from "../../src/ui/useModalKeyboardShield"
import { setupKeymap } from "./_helpers"

function Shield({ activeOverlay }: { activeOverlay: string }) {
  useModalKeyboardShield(activeOverlay)
  return null
}

describe("useModalKeyboardShield", () => {
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
    }
  })

  it("does not hard-block unknown overlays", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <Shield activeOverlay="future-overlay" />
      </KeymapProvider>,
      { width: 1, height: 1 },
    )

    await render.renderOnce()
    const event = host.press("e")
    expect(event.defaultPrevented).toBe(false)
    expect(event.propagationStopped).toBe(false)
    cleanup()
  })
})
