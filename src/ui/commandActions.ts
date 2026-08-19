import { join } from "node:path"
import { mkdirSync } from "node:fs"
import type { RefObject } from "react"
import type { CliRenderer } from "@opentui/core"
import type { Focus } from "./focus"
import { toggleExpand } from "./focus"
import type { AppView } from "./appState"
import { copyToClipboard } from "./clipboard"
import { showToast } from "./Toast"
import { findRequestById } from "./tree"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseEnvironmentsResult } from "../hooks/useEnvironments"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { Collection } from "../schema"
import { mergeFolderOverrides } from "../requests/mergeFolderOverrides"
import { substitute } from "../requests/substitute"
import {
  clearOAuth2Token,
  currentOAuth2Token,
  resolveOAuth2Token,
} from "../requests/oauth2"
import type { ProxyPolicy } from "../proxy"
import type { TlsPolicy } from "../tls"
import type { SendState } from "./sendState"
import type { ResponseQueryController } from "./responseQuery"
import { launchExternalEditor, type ExternalEditor } from "../externalEditor"
import { installNoodleSkill, type AgentSkillInstallResult } from "../agentSkill"

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
  proxyPolicy?: ProxyPolicy
  tlsPolicy?: TlsPolicy
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
  if (effective.auth?.type === "oauth1" || effective.auth?.type === "oauth2") {
    showToast(
      `Code generation is unavailable for ${effective.auth.type === "oauth1" ? "OAuth 1.0a" : "OAuth 2.0"} requests`,
      "warning",
    )
    return false
  }
  return true
}

function oauth2Auth(c: CommandActionsConfig) {
  try {
    if (c.focusedFolderPathRef.current !== null) return null
    const request = c.draftRef.current.draft
    if (!request) return null
    const collection = c.collectionRef.current
    const effective = collection
      ? mergeFolderOverrides(request, collection, request.id)
      : request
    const resolved = c.envStateRef.current.activeEnv
      ? substitute(effective, c.envStateRef.current.activeEnv)
      : effective
    return resolved.auth?.type === "oauth2" ? resolved.auth : null
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error")
    return null
  }
}

export function hasOAuth2Auth(c: CommandActionsConfig): boolean {
  if (c.focusedFolderPathRef.current !== null) return false
  const request = c.draftRef.current?.draft
  if (!request) return false
  const collection = c.collectionRef.current ?? null
  const effective = collection
    ? mergeFolderOverrides(request, collection, request.id)
    : request
  return effective.auth?.type === "oauth2"
}

function showOAuth2Event(message: string): void {
  showToast(
    message,
    /unavailable|session only|legacy|not recommended/i.test(message)
      ? "warning"
      : "info",
  )
}

export function fetchOAuth2Token(c: CommandActionsConfig): boolean {
  const auth = oauth2Auth(c)
  if (!auth) return false
  void resolveOAuth2Token(
    auth,
    {
      collectionDir: c.collectionDir,
      mode: "interactive",
      proxyPolicy: c.proxyPolicy,
      tlsPolicy: c.tlsPolicy,
      onAuthEvent: showOAuth2Event,
    },
    { force: true },
  )
    .then(() => showToast("OAuth 2 token ready", "success"))
    .catch((error: unknown) =>
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      ),
    )
  return true
}

export function copyOAuth2Token(c: CommandActionsConfig): boolean {
  const auth = oauth2Auth(c)
  if (!auth) return false
  void currentOAuth2Token(auth, c.collectionDir, showOAuth2Event)
    .then((token) => {
      if (!token) showToast("No OAuth 2 token is cached", "warning")
      else if (copyToClipboard(token, c.renderer))
        showToast("OAuth 2 token copied", "success")
      else showToast("Failed to copy OAuth 2 token", "error")
    })
    .catch((error: unknown) =>
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      ),
    )
  return true
}

export function clearCurrentOAuth2Token(c: CommandActionsConfig): boolean {
  const auth = oauth2Auth(c)
  if (!auth) return false
  void clearOAuth2Token(auth, c.collectionDir)
    .then(() => showToast("OAuth 2 token cleared", "success"))
    .catch((error: unknown) =>
      showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      ),
    )
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

export function openCookieJar(
  setView: (v: AppView | ((prev: AppView) => AppView)) => void,
  setFocus: (focus: Focus | ((prev: Focus) => Focus)) => void,
): boolean {
  setView("cookie-jar")
  setFocus("cookie-sidebar")
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

export function installAgentSkill(
  installer: () => Promise<AgentSkillInstallResult> = installNoodleSkill,
  notify: typeof showToast = showToast,
): boolean {
  void installer()
    .then(({ action }) =>
      notify(
        action === "installed"
          ? "Noodle skill installed"
          : "Noodle skill updated",
        "success",
      ),
    )
    .catch((error: unknown) =>
      notify(
        `Failed to install Noodle skill: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      ),
    )
  return true
}

type EditorLauncher = typeof launchExternalEditor

function openFolderInEditor(
  editor: ExternalEditor | undefined,
  target: string,
  launch: EditorLauncher,
): boolean {
  if (!editor) {
    showToast("No supported external editor found", "warning")
    return false
  }
  try {
    void launch(editor, target)
      .then(() => showToast(`Opened folder in ${editor.label}`, "success"))
      .catch((error: unknown) =>
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        ),
      )
    return true
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error")
    return false
  }
}

export function openCollectionInEditor(
  editor: ExternalEditor | undefined,
  collectionDir: string,
  launch: EditorLauncher = launchExternalEditor,
): boolean {
  return openFolderInEditor(editor, collectionDir, launch)
}

export function openAppSettingsInEditor(
  editor: ExternalEditor | undefined,
  configDir: string,
  launch: EditorLauncher = launchExternalEditor,
  ensureDir: (path: string) => void = (path) =>
    mkdirSync(path, { recursive: true }),
): boolean {
  if (!editor) return openFolderInEditor(editor, configDir, launch)
  try {
    ensureDir(configDir)
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), "error")
    return false
  }
  return openFolderInEditor(editor, configDir, launch)
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
