import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { AppView } from "../appState"
import type { OverlayState } from "../useOverlayState"

export function useGlobalIntercepts(opts: {
  overlays: OverlayState
  view: AppView
  cancelSendRef: RefObject<() => void>
}): void {
  const keymap = useKeymap()
  const { overlays, view, cancelSendRef } = opts
  const {
    activeOverlay,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
  } = overlays

  // ── Cancel send on ESC ──────────────────────────────────────────────
  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (
          activeOverlay === "none" &&
          view === "main" &&
          ctx.event.name === "escape" &&
          ctx.event.eventType === "press"
        ) {
          cancelSendRef.current()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, view, keymap, cancelSendRef])

  // ── Overlay: Help ──────────────────────────────────────────────────
  useEffect(() => {
    if (!helpVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setHelpVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [helpVisible, keymap, setHelpVisible])

  // ── Overlay: About ─────────────────────────────────────────────────
  useEffect(() => {
    if (!aboutVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setAboutVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [aboutVisible, keymap, setAboutVisible])
}
