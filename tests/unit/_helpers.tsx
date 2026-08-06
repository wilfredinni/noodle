import { createTestKeymap } from "@opentui/keymap/testing"
import type { KeyEvent } from "@opentui/core"
import {
  registerEnabledFields,
  registerDefaultKeys,
} from "@opentui/keymap/addons"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import type { CodeEditorRenderable } from "../../src/ui/editor/CodeEditor"

export function keyEvent(
  name: string,
  modifiers: Partial<
    Pick<KeyEvent, "ctrl" | "meta" | "shift" | "option" | "super" | "hyper">
  > = {},
): KeyEvent {
  return {
    name,
    sequence: name,
    raw: name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    super: false,
    hyper: false,
    ...modifiers,
  } as KeyEvent
}

export function getHighlightCount(editor: CodeEditorRenderable): number {
  let count = 0
  for (let line = 0; line < editor.lineCount; line++) {
    count += editor.getLineHighlights(line).length
  }
  return count
}

export function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}
