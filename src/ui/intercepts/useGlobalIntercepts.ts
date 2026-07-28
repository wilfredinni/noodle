import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"

export function useGlobalIntercepts(opts: {
  activeOverlay: string
  cancelSendRef: RefObject<() => void>
  helpVisible: boolean
  setHelpVisible: (v: boolean) => void
  aboutVisible: boolean
  setAboutVisible: (v: boolean) => void
}): void {
  const keymap = useKeymap()
  const {
    activeOverlay,
    cancelSendRef,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
  } = opts

  // ── Cancel send on ESC ──────────────────────────────────────────────
  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (
          activeOverlay === "none" &&
          ctx.event.name === "escape" &&
          ctx.event.eventType === "press"
        ) {
          cancelSendRef.current()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, cancelSendRef])

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
