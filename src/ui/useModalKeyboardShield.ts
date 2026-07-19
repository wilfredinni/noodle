import { useEffect } from "react"
import { useKeymap } from "@opentui/keymap/react"

export const EDITABLE_OVERLAYS = new Set([
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
])

export const HARD_BLOCKING_OVERLAYS = new Set([
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
])

export function useModalKeyboardShield(activeOverlay: string): void {
  const keymap = useKeymap()

  useEffect(() => {
    if (activeOverlay === "none" || EDITABLE_OVERLAYS.has(activeOverlay)) {
      return
    }
    const hardBlocking = HARD_BLOCKING_OVERLAYS.has(activeOverlay)
    if (!hardBlocking) {
      console.warn(
        `useModalKeyboardShield: unknown overlay "${activeOverlay}"; treating it as editable`,
      )
      return
    }
    return keymap.intercept(
      "key",
      (ctx) => {
        ctx.event.preventDefault()
        ctx.event.stopPropagation()
      },
      { priority: 90 },
    )
  }, [activeOverlay, keymap])
}
