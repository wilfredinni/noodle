import { useEffect } from "react"
import type { Dispatch, RefObject, SetStateAction } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { AppView } from "./appState"
import type { Focus } from "./focus"
import { useModalKeyboardShield } from "./useModalKeyboardShield"
import type { ActiveOverlay } from "./useOverlayState"

interface UseKeymapSyncProps {
  focus: Focus
  view: AppView
  activeOverlay: ActiveOverlay
  jumpMode: boolean
  setJumpMode: Dispatch<SetStateAction<boolean>>
  headerFieldRef: RefObject<"name" | "color">
  overlayActiveRef: RefObject<boolean>
}

export function useKeymapSync({
  focus,
  view,
  activeOverlay,
  jumpMode,
  setJumpMode,
  headerFieldRef,
  overlayActiveRef,
}: UseKeymapSyncProps): boolean {
  const keymap = useKeymap()
  const overlayActive = activeOverlay !== "none"

  useEffect(() => {
    keymap.setData("app.focus", focus)
    if (focus === "env-header") headerFieldRef.current = "name"
  }, [focus, headerFieldRef, keymap])

  useEffect(() => {
    keymap.setData("app.overlay", activeOverlay)
  }, [activeOverlay, keymap])

  useEffect(() => {
    overlayActiveRef.current = overlayActive
  }, [overlayActive, overlayActiveRef])

  useEffect(() => {
    keymap.setData("app.jump", jumpMode ? "active" : "none")
  }, [jumpMode, keymap])

  useEffect(() => {
    if (overlayActive && jumpMode) setJumpMode(false)
  }, [overlayActive, jumpMode, setJumpMode])

  useEffect(() => {
    keymap.setData("app.view", view)
  }, [view, keymap])

  useModalKeyboardShield(activeOverlay)
  return overlayActive
}
