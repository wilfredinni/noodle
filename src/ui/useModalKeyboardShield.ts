import { useEffect } from "react"
import { useKeymap } from "@opentui/keymap/react"

const EDITABLE_OVERLAYS = new Set([
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

export function useModalKeyboardShield(activeOverlay: string): void {
  const keymap = useKeymap()

  useEffect(() => {
    if (activeOverlay === "none") return
    const editable = EDITABLE_OVERLAYS.has(activeOverlay)
    return keymap.intercept(
      "key",
      (ctx) => {
        if (editable) {
          ctx.event.stopPropagation()
        } else {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
        }
      },
      { priority: 90 },
    )
  }, [activeOverlay, keymap])
}
