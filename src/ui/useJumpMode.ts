import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseUIStateResult } from "./tabs/useUIState"
import type { Focus, UrlBarSubFocus } from "./focus"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import type { Request } from "../schema"

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
          setJumpMode(false)
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
        setJumpMode(false)
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

export function getAvailableTargets(
  hasRequest: boolean,
  expanded: "request" | "response" | null,
  folderView: boolean,
): Map<string, JumpTarget> {
  const targets = new Map<string, JumpTarget>()
  if (folderView) {
    targets.set("s", { kind: "sidebar" })
    return targets
  }
  targets.set("s", { kind: "sidebar" })
  if (hasRequest) {
    if (expanded !== "response") {
      targets.set("m", { kind: "method" })
      targets.set("u", { kind: "url" })
      targets.set("h", { kind: "request-tab", field: "headers" })
      targets.set("p", { kind: "request-tab", field: "params" })
      targets.set("b", { kind: "request-tab", field: "body" })
      targets.set("a", { kind: "request-tab", field: "auth" })
      targets.set("t", { kind: "request-tab", field: "settings" })
    }
    if (expanded !== "request") {
      targets.set("r", { kind: "response-tab", tab: "body" })
      targets.set("e", { kind: "response-tab", tab: "headers" })
      targets.set("l", { kind: "response-tab", tab: "timeline" })
    }
  }
  return targets
}

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

export const REQUEST_TAB_HINT_ORDER: string[] = ["h", "p", "b", "a", "t"]
export const RESPONSE_TAB_HINT_ORDER: string[] = ["r", "e", "l"]

export function computeRequestTabLabels(request: Request | null): string[] {
  if (!request) return ["Headers", "Params", "Body", "Auth", "Settings"]
  const headerActive = Object.values(request.headers).some((e) => e.enabled)
  const paramActive = request.params.some((e) => e.enabled)
  const hasBody =
    (request.body !== undefined && request.body !== "") ||
    (request.formData !== undefined && request.formData.length > 0) ||
    (request.filePath !== undefined && request.filePath !== "")
  const hasAuth =
    request.auth?.type !== undefined && request.auth.type !== "none"
  const hasTimeout = request.timeout > 0
  return [
    headerActive ? "Headers \u2022" : "Headers",
    paramActive ? "Params \u2022" : "Params",
    hasBody ? "Body \u2022" : "Body",
    hasAuth ? "Auth \u2022" : "Auth",
    hasTimeout ? "Settings \u2022" : "Settings",
  ]
}
