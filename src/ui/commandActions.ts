import { join } from "node:path"
import type { RefObject } from "react"
import type { CliRenderer } from "@opentui/core"
import type { Focus } from "./focus"
import { toggleExpand } from "./focus"
import { copyToClipboard } from "./clipboard"
import { showToast } from "./Toast"
import { findRequestById } from "./tree"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import { mergeFolderOverrides } from "../requests/mergeFolderOverrides"
import type { SendState } from "./sendState"
import type { ResponseQueryController } from "./responseQuery"

export interface CommandActionsConfig {
  collectionDir: string
  confirmUndoAll: boolean
  renderer: CliRenderer
  trySendRef: RefObject<(() => void) | undefined>
  draftRef: RefObject<UseRequestDraftResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
  envStateRef: RefObject<UseEnvironmentsResult>
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  collectionRef: RefObject<Collection | null>
  selectedIdRef: RefObject<string | null>
  focusRef: RefObject<Focus>
  responseStateRef: RefObject<SendState>
  responseQueryRef: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef: RefObject<string | null>
  activeIndexRef: RefObject<number>
  savingRef: RefObject<boolean>
  doSaveRef: RefObject<() => void>
  folderSaveRef: RefObject<() => void>
  focusedFolderPathRef: RefObject<string | null>
  focusedFolderNameRef: RefObject<string | null>
  folderDeletePathRef: RefObject<string | null>
}

export function sendRequest(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current) return false
  c.trySendRef.current?.()
  return true
}

export function saveRequest(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current) return false
  const d = c.draftRef.current
  if (!c.savingRef.current && d.draft && d.isDirty) {
    c.doSaveRef.current()
    return true
  }
  return false
}

export function editRequestOverlay(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current) return false
  const sid = c.selectedIdRef.current
  if (!sid) return false
  const col = c.collectionRef.current
  if (!col) return false
  const req = findRequestById(col.items, sid)
  if (!req) return false
  return true
}

export function getEditFolderYamlFile(c: CommandActionsConfig): {
  filePath: string
  folderName: string
  folderPath: string
  returnFocus: Focus
} | null {
  const folderPath = c.focusedFolderPathRef.current
  const folderName = c.focusedFolderNameRef.current
  if (!folderPath || !folderName || !c.collectionDir) return null
  return {
    filePath: join(c.collectionDir, folderPath, "folder.yml"),
    folderName,
    folderPath,
    returnFocus: c.focusRef.current,
  }
}

export function getEditRequestYamlFile(c: CommandActionsConfig): {
  filePath: string
  requestName: string
  requestId: string
  returnFocus: Focus
} | null {
  if (c.focusedFolderPathRef.current) return null
  const sid = c.selectedIdRef.current
  if (!sid || !c.collectionDir) return null
  const col = c.collectionRef.current
  if (!col) return null
  const r = findRequestById(col.items, sid)
  if (!r) return null
  return {
    filePath: join(c.collectionDir, `${r.id}.yml`),
    requestName: r.name,
    requestId: r.id,
    returnFocus: c.focusRef.current,
  }
}

export function newRequest(): boolean {
  return true
}

export function cloneRequest(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current) return false
  const sid = c.selectedIdRef.current
  if (!sid) return false
  const col = c.collectionRef.current
  if (!col) return false
  const req = findRequestById(col.items, sid)
  if (!req) return false
  return true
}

export function deleteRequest(c: CommandActionsConfig): {
  requestName: string
} | null {
  if (c.focusedFolderPathRef.current) return null
  const sid = c.selectedIdRef.current
  if (!sid) return null
  const col = c.collectionRef.current
  if (!col) return null
  const req = findRequestById(col.items, sid)
  if (!req) return null
  return { requestName: req.name }
}

export function deleteFolder(c: CommandActionsConfig): {
  folderName: string
  folderPath: string
} | null {
  const folderPath = c.focusedFolderPathRef.current
  const folderName = c.focusedFolderNameRef.current
  if (!folderPath || !folderName) return null
  return { folderName, folderPath }
}

export function copyResponseBody(c: CommandActionsConfig): boolean {
  const s = c.responseStateRef.current
  if (s?.status !== "done") return false
  const body = c.responseBodyForCopyRef.current ?? s.response.body
  if (copyToClipboard(body, c.renderer)) {
    showToast("Response body copied", "success")
    return true
  } else {
    showToast("Failed to copy response body", "error")
    return false
  }
}

export function openResponseQuery(c: CommandActionsConfig): boolean {
  return c.responseQueryRef.current?.open() ?? false
}

export function canGenerateClientCode(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current !== null) return false
  const request = c.draftRef.current.draft
  if (!request) return false
  const collection = c.collectionRef.current
  const effective = collection
    ? mergeFolderOverrides(request, collection, request.id)
    : request
  if (effective.auth?.type === "aws_sigv4") {
    showToast(
      "Code generation is unavailable for AWS SigV4 requests",
      "warning",
    )
    return false
  }
  if (effective.auth?.type === "ntlm") {
    showToast("Code generation is unavailable for NTLM requests", "warning")
    return false
  }
  return true
}

export function cycleEnvironment(c: CommandActionsConfig): boolean {
  c.envStateRef.current.cycle(1)
  return true
}

export function openEnvironmentPicker(
  setVisible: (visible: boolean) => void,
): boolean {
  setVisible(true)
  return true
}

export function openEnvironmentEditor(
  c: Pick<CommandActionsConfig, "envStateRef" | "envEditorRef">,
): boolean {
  const name = c.envStateRef.current.activeEnv?.name
  c.envEditorRef.current.openEditor(name)
  return true
}

export function saveEnvironment(c: CommandActionsConfig): boolean {
  c.envEditorRef.current.save()
  return true
}

export function newEnvironment(): boolean {
  return true
}

export function cloneEnvironment(c: CommandActionsConfig): boolean {
  const ee = c.envEditorRef.current
  if (ee.selectedEnvName) {
    ee.cloneEnv(`${ee.selectedEnvName} - Copy`)
    return true
  }
  return false
}

export function deleteEnvironment(c: CommandActionsConfig): {
  envName: string
} | null {
  const ee = c.envEditorRef.current
  if (!ee.selectedEnvName) return null
  return { envName: ee.selectedEnvName }
}

export function newFolder(): boolean {
  return true
}

export function saveFolder(c: CommandActionsConfig): boolean {
  if (!c.focusedFolderPathRef.current) return false
  const d = c.folderDraftRef.current
  if (c.savingRef.current || !d.folderDraft || !d.isDirty) return false
  c.folderSaveRef.current()
  return true
}

export function toggleLayout(
  c: CommandActionsConfig,
  setLayout: (
    v:
      | "stacked"
      | "side-by-side"
      | ((prev: "stacked" | "side-by-side") => "stacked" | "side-by-side"),
  ) => void,
  onLayoutChange: (layout: "stacked" | "side-by-side") => boolean,
): boolean {
  setLayout((prev: "stacked" | "side-by-side") => {
    const next = prev === "stacked" ? "side-by-side" : "stacked"
    return onLayoutChange(next) ? next : prev
  })
  return true
}

export function togglePaneExpand(
  c: CommandActionsConfig,
  focus: string,
  setExpanded: (
    v:
      | "request"
      | "response"
      | null
      | ((
          prev: "request" | "response" | null,
        ) => "request" | "response" | null),
  ) => void,
): boolean {
  const f = focus as "request" | "response"
  if (f !== "request" && f !== "response") return false
  setExpanded((prev: "request" | "response" | null) => toggleExpand(prev, f))
  return true
}

export function undoAll(c: CommandActionsConfig): boolean {
  const d = c.draftRef.current
  const fd = c.folderDraftRef.current
  const ee = c.envEditorRef.current
  const hasDirty =
    d.dirtyRequestIds.size > 0 || fd.dirtyPaths.size > 0 || (ee?.dirty ?? false)
  if (!hasDirty) return false
  if (c.confirmUndoAll) {
    return true
  } else {
    d.revertAllRequests()
    fd.revertAllFolders()
    ee?.revertDraft()
    return true
  }
}

export function toggleHelp(): boolean {
  return true
}

export function openThemePicker(): boolean {
  return true
}

export function openAbout(): boolean {
  return true
}

export function openCollectionExport(
  setVisible: (visible: boolean) => void,
): boolean {
  setVisible(true)
  return true
}

export function openCollectionImport(
  setVisible: (visible: boolean) => void,
): boolean {
  setVisible(true)
  return true
}

export function closeCollectionExport(
  pending: RefObject<boolean>,
  setVisible: (visible: boolean) => void,
): boolean {
  if (pending.current) return false
  setVisible(false)
  return true
}

export function openCollectionSwitcher(view: string): boolean {
  if (view === "env-editor") {
    showToast("Cannot switch collections from environment editor", "warning")
    return false
  }
  return true
}

export function openSettings(
  c: Pick<CommandActionsConfig, "envEditorRef">,
  view: string,
): boolean {
  if (view === "env-editor" && c.envEditorRef.current.dirty) {
    showToast(
      "Save or discard environment changes before opening Settings",
      "warning",
    )
    return false
  }
  return true
}
