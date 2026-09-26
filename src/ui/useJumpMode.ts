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
import { FIELD_ORDER, FOLDER_FIELD_ORDER, type FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import type { Folder, Request } from "../schema"
import { scriptPhase, scriptText } from "../scriptAuthoring"
import type { EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"

export type JumpTarget =
  | { kind: "sidebar" }
  | { kind: "method" }
  | { kind: "url" }
  | { kind: "request-tab"; field: FieldKind }
  | { kind: "request-tab-add" }
  | { kind: "folder-tab"; field: FolderFieldKind }
  | { kind: "folder-tab-add" }
  | { kind: "response-tab"; tab: ResponseTabKind }
  | { kind: "env-sidebar" }
  | { kind: "env-name" }
  | { kind: "env-color" }
  | { kind: "env-vars" }
  | { kind: "cookie-sidebar" }
  | { kind: "cookie-list" }
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
  sidebarVisible: boolean
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
    sidebarVisible,
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
            if (!sidebarVisible) {
              keymap.dispatchCommand("sidebar.toggle")
            }
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
          case "request-tab-add":
            ebRef.current.setOptionalTabMenuActive(true)
            setFocus("request")
            break
          case "folder-tab":
            folderEbRef.current.enterBrowseAt(target.field)
            setFocus("folder")
            break
          case "folder-tab-add":
            folderEbRef.current.setOptionalTabMenuActive(true)
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
          case "cookie-sidebar":
            setFocus("cookie-sidebar")
            break
          case "cookie-list":
            setFocus("cookie-list")
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
  cookieJarView = false,
  requestTabAddVisible = false,
  folderTabAddVisible = false,
  visibleTabs: {
    request?: readonly FieldKind[]
    folder?: readonly FolderFieldKind[]
    console?: boolean
  } = {},
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
  if (cookieJarView) {
    targets.set("s", { kind: "cookie-sidebar" })
    targets.set("c", { kind: "cookie-list" })
    return targets
  }
  if (folderView) {
    targets.set("s", { kind: "sidebar" })
    for (const field of visibleTabs.folder ?? getVisibleFolderTabs(null)) {
      targets.set(FOLDER_TAB_HINTS[field], { kind: "folder-tab", field })
    }
    if (folderTabAddVisible) {
      targets.set(REQUEST_TAB_ADD_HINT, { kind: "folder-tab-add" })
    }
    return targets
  }
  targets.set("s", { kind: "sidebar" })
  if (hasRequest) {
    if (expanded !== "response") {
      targets.set("m", { kind: "method" })
      targets.set("u", { kind: "url" })
      for (const field of visibleTabs.request ?? getVisibleRequestTabs(null)) {
        const hint = REQUEST_TAB_HINTS[field]
        if (hint) targets.set(hint, { kind: "request-tab", field })
      }
      if (requestTabAddVisible) {
        targets.set(REQUEST_TAB_ADD_HINT, { kind: "request-tab-add" })
      }
    }
    if (expanded !== "request") {
      for (const tab of Object.keys(RESPONSE_TAB_HINTS) as ResponseTabKind[]) {
        if (tab !== "console" || visibleTabs.console) {
          targets.set(RESPONSE_TAB_HINTS[tab], { kind: "response-tab", tab })
        }
      }
    }
  }
  return targets
}

export const REQUEST_TAB_HINTS: Partial<Record<FieldKind, string>> = {
  headers: "h",
  params: "p",
  pathParams: "x",
  body: "b",
  auth: "a",
  assertions: "v",
  captures: "c",
  preScript: "d",
  postScript: "f",
  tests: "j",
  settings: "t",
}

export const REQUEST_TAB_ADD_HINT = "o"

export const RESPONSE_TAB_HINTS: Record<ResponseTabKind, string> = {
  body: "r",
  headers: "e",
  results: "i",
  network: "n",
  timeline: "l",
  cookies: "k",
  console: "z",
}
export const FOLDER_TAB_HINTS: Record<FolderFieldKind, string> = {
  meta: "m",
  headers: "h",
  auth: "a",
  preScript: "d",
  postScript: "f",
  tests: "j",
  activity: "y",
}

export function getVisibleRequestTabs(
  request: Request | null,
  activeTab: FieldKind = "headers",
  revealedOptionalTabs: readonly FieldKind[] = [],
): FieldKind[] {
  return FIELD_ORDER.filter((field) => {
    if (field === activeTab || revealedOptionalTabs.includes(field)) return true
    if (field === "assertions") return !!request?.assertions?.length
    if (field === "captures")
      return !!Object.keys(request?.captures ?? {}).length
    const phase = scriptPhase(field)
    return !phase || !!scriptText(request ?? {}, phase)
  })
}

export function getVisibleFolderTabs(
  folder: Folder | null,
  activeTab: FieldKind = "meta",
  revealedOptionalTabs: readonly FieldKind[] = [],
): FolderFieldKind[] {
  return FOLDER_FIELD_ORDER.filter((field) => {
    const phase = scriptPhase(field)
    return (
      field === activeTab ||
      revealedOptionalTabs.includes(field) ||
      !phase ||
      !!scriptText(folder ?? {}, phase)
    )
  })
}

export function computeRequestTabLabels(
  request: Request | null,
): Record<string, string> {
  if (!request)
    return {
      headers: "Headers",
      params: "Params",
      pathParams: "Path",
      body: "Body",
      auth: "Auth",
      assertions: "Assert",
      captures: "Capture",
      preScript: "Pre Script",
      postScript: "Post Script",
      tests: "Tests",
      settings: "Settings",
    }
  const headerActive = Object.values(request.headers).some((e) => e.enabled)
  const paramActive = request.params.some((e) => e.enabled)
  const pathParamActive = (request.pathParams ?? []).some((e) => e.enabled)
  const hasBody =
    (request.body !== undefined && request.body !== "") ||
    (request.formData !== undefined && request.formData.length > 0) ||
    (request.filePath !== undefined && request.filePath !== "")
  const hasAuth =
    request.auth?.type !== undefined && request.auth.type !== "none"
  const hasAssertions = (request.assertions?.length ?? 0) > 0
  const hasCaptures = Object.keys(request.captures ?? {}).length > 0
  const hasSettings = request.timeout > 0 || (request.tags?.length ?? 0) > 0
  return {
    headers: headerActive ? "Headers \u2022" : "Headers",
    params: paramActive ? "Params \u2022" : "Params",
    pathParams: pathParamActive ? "Path \u2022" : "Path",
    body: hasBody ? "Body \u2022" : "Body",
    auth: hasAuth ? "Auth \u2022" : "Auth",
    assertions: hasAssertions ? "Assert \u2022" : "Assert",
    captures: hasCaptures ? "Capture \u2022" : "Capture",
    preScript: request.scripts?.pre?.trim()
      ? "Pre Script \u2022"
      : "Pre Script",
    postScript: request.scripts?.post?.trim()
      ? "Post Script \u2022"
      : "Post Script",
    tests: request.tests?.trim() ? "Tests \u2022" : "Tests",
    settings: hasSettings ? "Settings \u2022" : "Settings",
  }
}
