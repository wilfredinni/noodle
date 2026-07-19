import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { useModalKeyboardShield } from "../../src/ui/useModalKeyboardShield"
import { setupKeymap } from "./_helpers"

const EDITABLE_OVERLAYS = [
  "command-palette",
  "request-finder",
  "collection-switcher",
  "theme",
  "yaml-editor",
  "new-request",
  "import-curl",
  "edit-request",
  "clone-request",
  "new-folder",
]

const HARD_OVERLAYS = [
  "help",
  "about",
  "confirm",
  "env-delete",
  "undo-all",
  "init-confirm",
  "collection-switch-confirm",
  "code-generator",
  "folder-delete",
  "request-delete",
  "timeline-detail",
]

function Shield({ activeOverlay }: { activeOverlay: string }) {
  useModalKeyboardShield(activeOverlay)
  return null
}

describe("useModalKeyboardShield", () => {
  it("blocks lower-priority handlers for every editable overlay", async () => {
    for (const activeOverlay of EDITABLE_OVERLAYS) {
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

  it("blocks lower-priority handlers for every non-editable overlay", async () => {
    for (const activeOverlay of HARD_OVERLAYS) {
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
})
