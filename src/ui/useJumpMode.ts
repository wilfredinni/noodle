import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type {
  UseFolderEditBrowseResult,
  FolderFieldKind,
} from "../hooks/useFolderEditBrowse"
import type { UseUIStateResult } from "./tabs/useUIState"
import type { Focus, UrlBarSubFocus } from "./focus"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import type { Request } from "../schema"
import type { EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"

export type JumpTarget =
  | { kind: "sidebar" }
  | { kind: "method" }
  | { kind: "url" }
  | { kind: "request-tab"; field: FieldKind }
  | { kind: "folder-tab"; field: FolderFieldKind }
  | { kind: "response-tab"; tab: ResponseTabKind }
  | { kind: "env-sidebar" }
  | { kind: "env-name" }
  | { kind: "env-color" }
  | { kind: "env-vars" }
  | { kind: "settings-sidebar" }
  | { kind: "settings-content" }

interface UseJumpModeOpts {
  jumpMode: boolean
  setJumpMode: (v: boolean | ((prev: boolean) => boolean)) => void
  setFocus: (f: Focus) => void
  setUrlbarSubFocus: (f: UrlBarSubFocus) => void
  ebRef: RefObject<UseEditBrowseResult>
  folderEbRef: RefObject<UseFolderEditBrowseResult>
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  headerFieldRef: RefObject<"name" | "color">
  pendingHeaderFieldRef: RefObject<"name" | "color" | null>
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
    folderEbRef,
    envHeaderRef,
    headerFieldRef,
    pendingHeaderFieldRef,
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
          case "folder-tab":
            folderEbRef.current.enterBrowseAt(target.field)
            setFocus("folder")
            break
          case "response-tab": {
            const id = selectedIdRef.current
            if (id) setTab(id, "response", target.tab)
            setFocus("response")
            break
          }
          case "env-sidebar":
            setFocus("env-sidebar")
            break
          case "env-name":
            headerFieldRef.current = "name"
            pendingHeaderFieldRef.current = "name"
            setFocus("env-header")
            envHeaderRef.current?.focusName()
            break
          case "env-color":
            headerFieldRef.current = "color"
            pendingHeaderFieldRef.current = "color"
            setFocus("env-header")
            envHeaderRef.current?.focusColor()
            break
          case "env-vars":
            setFocus("env-vars")
            break
          case "settings-sidebar":
            setFocus("settings-sidebar")
            break
          case "settings-content":
            setFocus("settings-content")
            break
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
    folderEbRef,
    envHeaderRef,
    headerFieldRef,
    pendingHeaderFieldRef,
    setTab,
    selectedIdRef,
  ])
}

export function getAvailableTargets(
  hasRequest: boolean,
  expanded: "request" | "response" | null,
  folderView: boolean,
  environmentView = false,
  settingsView = false,
): Map<string, JumpTarget> {
  const targets = new Map<string, JumpTarget>()
  if (settingsView) {
    targets.set("s", { kind: "settings-sidebar" })
    targets.set("c", { kind: "settings-content" })
    return targets
  }
  if (environmentView) {
    targets.set("s", { kind: "env-sidebar" })
    targets.set("m", { kind: "env-name" })
    targets.set("c", { kind: "env-color" })
    targets.set("v", { kind: "env-vars" })
    return targets
  }
  if (folderView) {
    targets.set("s", { kind: "sidebar" })
    targets.set("m", { kind: "folder-tab", field: "meta" })
    targets.set("h", { kind: "folder-tab", field: "headers" })
    targets.set("a", { kind: "folder-tab", field: "auth" })
    targets.set("y", { kind: "folder-tab", field: "activity" })
    return targets
  }
  targets.set("s", { kind: "sidebar" })
  if (hasRequest) {
    if (expanded !== "response") {
      targets.set("m", { kind: "method" })
      targets.set("u", { kind: "url" })
      targets.set("h", { kind: "request-tab", field: "headers" })
      targets.set("p", { kind: "request-tab", field: "params" })
      targets.set("x", { kind: "request-tab", field: "pathParams" })
      targets.set("b", { kind: "request-tab", field: "body" })
      targets.set("a", { kind: "request-tab", field: "auth" })
      targets.set("t", { kind: "request-tab", field: "settings" })
    }
    if (expanded !== "request") {
      targets.set("r", { kind: "response-tab", tab: "body" })
      targets.set("e", { kind: "response-tab", tab: "headers" })
      targets.set("n", { kind: "response-tab", tab: "network" })
      targets.set("l", { kind: "response-tab", tab: "timeline" })
    }
  }
  return targets
}

export const REQUEST_TAB_HINTS: Record<string, string> = {
  headers: "h",
  params: "p",
  pathParams: "x",
  body: "b",
  auth: "a",
  settings: "t",
}

export const RESPONSE_TAB_HINTS: Record<string, string> = {
  body: "r",
  headers: "e",
  network: "n",
  timeline: "l",
}

export const REQUEST_TAB_HINT_ORDER: string[] = ["h", "p", "x", "b", "a", "t"]
export const RESPONSE_TAB_HINT_ORDER: string[] = ["r", "e", "n", "l"]
export const FOLDER_TAB_HINT_ORDER: string[] = ["m", "h", "a", "y"]

export function computeRequestTabLabels(request: Request | null): string[] {
  if (!request) return ["Headers", "Params", "Path", "Body", "Auth", "Settings"]
  const headerActive = Object.values(request.headers).some((e) => e.enabled)
  const paramActive = request.params.some((e) => e.enabled)
  const pathParamActive = (request.pathParams ?? []).some((e) => e.enabled)
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
    pathParamActive ? "Path \u2022" : "Path",
    hasBody ? "Body \u2022" : "Body",
    hasAuth ? "Auth \u2022" : "Auth",
    hasTimeout ? "Settings \u2022" : "Settings",
  ]
}
