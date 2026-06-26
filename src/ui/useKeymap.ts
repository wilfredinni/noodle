import type { CliRenderer } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"

export function createNoodleKeymap(
  renderer: CliRenderer,
): ReturnType<typeof createDefaultOpenTuiKeymap> {
  const keymap = createDefaultOpenTuiKeymap(renderer)

  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")

  return keymap
}
