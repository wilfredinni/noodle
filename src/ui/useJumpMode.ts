import { useEffect, useRef } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseUIStateResult } from "./tabs/useUIState"
import type { Focus, UrlBarSubFocus } from "./focus"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"

export type JumpTarget =
  | { kind: "sidebar" }
  | { kind: "method" }
  | { kind: "url" }
  | { kind: "request-tab"; field: FieldKind }
  | { kind: "response-tab"; tab: ResponseTabKind }

interface UseJumpModeOpts {
  jumpMode: boolean
  setJumpMode: (v: boolean | ((prev: boolean) => boolean)) => void
  setFocus: (f: Focus) => void
  setUrlbarSubFocus: (f: UrlBarSubFocus) => void
  ebRef: RefObject<UseEditBrowseResult>
  setTab: UseUIStateResult["setTab"]
  selectedIdRef: RefObject<string | null>
  targetsRef: RefObject<Map<string, JumpTarget>>
  triggerKey: string
}

export function useJumpMode(opts: UseJumpModeOpts): void {
  const keymap = useKeymap()
  const {
    jumpMode,
    setJumpMode,
    setFocus,
    setUrlbarSubFocus,
    ebRef,
    setTab,
    selectedIdRef,
    targetsRef,
    triggerKey,
  } = opts

  const exitRef = useRef(() => {})
  exitRef.current = () => setJumpMode(false)

  useEffect(() => {
    keymap.setData("app.jump.trigger", triggerKey)
  }, [keymap, triggerKey])

  useEffect(() => {
    if (!jumpMode) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const event = ctx.event
        event.preventDefault()
        event.stopPropagation()
        const trigger = keymap.getData("app.jump.trigger") as string | undefined
        if (event.name === "escape" || event.name === trigger) {
          exitRef.current()
          return
        }
        const target = targetsRef.current.get(event.name)
        if (!target) return
        switch (target.kind) {
          case "sidebar":
            setFocus("sidebar")
            break
          case "method":
            setFocus("urlbar")
            setUrlbarSubFocus("select")
            break
          case "url":
            setFocus("urlbar")
            setUrlbarSubFocus("text")
            break
          case "request-tab":
            ebRef.current.enterBrowseAt(target.field)
            setFocus("request")
            break
          case "response-tab": {
            const id = selectedIdRef.current
            if (id) setTab(id, "response", target.tab)
            setFocus("response")
            break
          }
        }
        exitRef.current()
      },
      { priority: 100 },
    )
    return dispose
  }, [
    jumpMode,
    keymap,
    setFocus,
    setUrlbarSubFocus,
    ebRef,
    setTab,
    selectedIdRef,
  ])
}

export const JUMP_TARGETS = new Map<string, JumpTarget>([
  ["s", { kind: "sidebar" }],
  ["m", { kind: "method" }],
  ["u", { kind: "url" }],
  ["h", { kind: "request-tab", field: "headers" }],
  ["p", { kind: "request-tab", field: "params" }],
  ["b", { kind: "request-tab", field: "body" }],
  ["a", { kind: "request-tab", field: "auth" }],
  ["t", { kind: "request-tab", field: "settings" }],
  ["r", { kind: "response-tab", tab: "body" }],
  ["e", { kind: "response-tab", tab: "headers" }],
  ["l", { kind: "response-tab", tab: "timeline" }],
])

export const REQUEST_TAB_HINTS: Record<string, string> = {
  headers: "h",
  params: "p",
  body: "b",
  auth: "a",
  settings: "t",
}

export const RESPONSE_TAB_HINTS: Record<string, string> = {
  body: "r",
  headers: "e",
  timeline: "l",
}
