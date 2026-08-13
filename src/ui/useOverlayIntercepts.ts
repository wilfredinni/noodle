import type { RefObject } from "react"
import type { SaveState } from "./saveState"
import type { Focus } from "./focus"
import type { AppView } from "./appState"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"
import type { NewRequestOverlayHandle } from "./overlays/NewRequestOverlay"
import type { CloneRequestOverlayHandle } from "./overlays/CloneRequestOverlay"
import type { NewFolderOverlayHandle } from "./overlays/NewFolderOverlay"
import type { ImportCurlOverlayHandle } from "./overlays/ImportCurlOverlay"
import type { ExportCollectionOverlayHandle } from "./overlays/ExportCollectionOverlay"
import type { ImportCollectionOverlayHandle } from "./overlays/ImportCollectionOverlay"
import type { ExportCollectionValues } from "./collectionExport"
import type { CollectionImportValues } from "./collectionImport"
import type { ImportedCollectionPending } from "./useOverlayState"
import type {
  NewEnvironmentOverlayHandle,
  NewEnvironmentValues,
} from "./overlays/NewEnvironmentOverlay"
import type {
  CookieFormOverlayHandle,
  CookieFormValues,
} from "./overlays/CookieFormOverlay"
import type { CookieDeletePending } from "./useOverlayState"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { ActiveOverlay } from "./useOverlayState"
import { useGlobalIntercepts } from "./intercepts/useGlobalIntercepts"
import { useDialogIntercepts } from "./intercepts/useDialogIntercepts"
import {
  useFormOverlayIntercept,
  useSingleFieldFormOverlayIntercept,
} from "./intercepts/useFormOverlayIntercept"
import { useEnvEditorIntercept } from "./intercepts/useEnvEditorIntercept"

export function shouldCancelSend(
  activeOverlay: string,
  event: { name: string; eventType?: string },
): boolean {
  return (
    activeOverlay === "none" &&
    event.name === "escape" &&
    event.eventType === "press"
  )
}

export function useOverlayIntercepts(opts: {
  activeOverlay: ActiveOverlay
  cancelSendRef: RefObject<() => void>
  setSaveState: (s: SaveState) => void
  envDeletePending: string | null
  envDeletePendingRef: RefObject<string | null>
  setEnvDeletePending: (s: string | null) => void
  collectionUnregisterPending: string | null
  setCollectionUnregisterPending: (s: string | null) => void
  onCollectionUnregisterConfirm: (path: string) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  helpVisible: boolean
  setHelpVisible: (v: boolean) => void
  aboutVisible: boolean
  setAboutVisible: (v: boolean) => void
  view: AppView
  setView: (v: AppView) => void
  focusRef: RefObject<Focus>
  setFocus: (f: Focus) => void
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  headerFieldRef: RefObject<"name" | "color">
  newEnvironmentVisible: boolean
  newEnvironmentRef: RefObject<NewEnvironmentOverlayHandle | null>
  setNewEnvironmentVisible: (v: boolean) => void
  onNewEnvironmentConfirm: (values: NewEnvironmentValues) => void
  cookieFormVisible: boolean
  cookieFormRef: RefObject<CookieFormOverlayHandle | null>
  setCookieFormVisible: (v: boolean) => void
  onCookieFormConfirm: (values: CookieFormValues) => void
  cookieDeletePending: CookieDeletePending | null
  setCookieDeletePending: (pending: CookieDeletePending | null) => void
  onCookieDeleteConfirm: (pending: CookieDeletePending) => void
  newRequestVisible: boolean
  newRequestRef: RefObject<NewRequestOverlayHandle | null>
  setNewRequestVisible: (v: boolean) => void
  onNewRequestConfirm: (values: {
    name: string
    method: string
    url: string
    folderPath?: string
  }) => void
  importCurlVisible: boolean
  importCurlRef: RefObject<ImportCurlOverlayHandle | null>
  setImportCurlVisible: (v: boolean) => void
  onImportCurlConfirm: (values: {
    command: string
    name: string
    folderPath: string
  }) => void
  exportCollectionVisible: boolean
  exportCollectionRef: RefObject<ExportCollectionOverlayHandle | null>
  onExportCollectionCancel: () => void
  onExportCollectionConfirm: (values: ExportCollectionValues) => void
  importCollectionVisible: boolean
  importCollectionRef: RefObject<ImportCollectionOverlayHandle | null>
  importCollectionPendingRef: RefObject<boolean>
  setImportCollectionVisible: (v: boolean) => void
  onImportCollectionConfirm: (values: CollectionImportValues) => void
  importOpenPending: ImportedCollectionPending | null
  setImportOpenPending: (pending: ImportedCollectionPending | null) => void
  onImportOpenConfirm: (pending: ImportedCollectionPending) => void
  editRequestVisible: boolean
  editRequestRef: RefObject<NewRequestOverlayHandle | null>
  setEditRequestVisible: (v: boolean) => void
  onEditRequestConfirm: (values: {
    name: string
    method: string
    url: string
    folderPath?: string
  }) => void
  cloneRequestVisible: boolean
  cloneRequestRef: RefObject<CloneRequestOverlayHandle | null>
  setCloneRequestVisible: (v: boolean) => void
  onCloneRequestConfirm: (newName: string) => void
  requestDeletePending: string | null
  setRequestDeletePending: (s: string | null) => void
  onRequestDeleteConfirm: () => void
  newFolderVisible: boolean
  newFolderRef: RefObject<NewFolderOverlayHandle | null>
  setNewFolderVisible: (v: boolean) => void
  onNewFolderConfirm: (name: string) => void
  folderDeletePending: string | null
  setFolderDeletePending: (s: string | null) => void
  onFolderDeleteConfirm: () => void
  collectionSwitchPending: string | null
  setCollectionSwitchPending: (s: string | null) => void
  onCollectionSwitchConfirm: (collectionDir: string) => void
  reloadPending: boolean
  setReloadPending: (v: boolean) => void
  onReloadConfirm: () => void
  undoAllPending: boolean
  setUndoAllPending: (v: boolean) => void
  initPending: boolean
  setInitPending: (v: boolean) => void
  onInitConfirm: () => void
  draftRef: RefObject<UseRequestDraftResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
  updateConfirmVisible: boolean
  onConfirmInstall: () => void
  onCancelUpdate: () => void
}) {
  useGlobalIntercepts(opts)

  const dialogActions = useDialogIntercepts(opts)

  const newEnvironmentActions = useFormOverlayIntercept({
    visible: opts.newEnvironmentVisible,
    handleRef: opts.newEnvironmentRef,
    onConfirm: opts.onNewEnvironmentConfirm,
    onCancel: () => opts.setNewEnvironmentVisible(false),
    passThroughFocuses: ["color"],
  })

  const cookieFormActions = useFormOverlayIntercept({
    visible: opts.cookieFormVisible,
    handleRef: opts.cookieFormRef,
    onConfirm: opts.onCookieFormConfirm,
    onCancel: () => opts.setCookieFormVisible(false),
    passThroughFocuses: ["sameSite"],
    toggleFocuses: ["secure", "httpOnly", "hostOnly"],
  })

  const newRequestActions = useFormOverlayIntercept({
    visible: opts.newRequestVisible,
    handleRef: opts.newRequestRef,
    onConfirm: opts.onNewRequestConfirm,
    onCancel: () => opts.setNewRequestVisible(false),
    passThroughFocuses: ["method", "folder"],
  })

  const importCurlActions = useFormOverlayIntercept({
    visible: opts.importCurlVisible,
    handleRef: opts.importCurlRef,
    onConfirm: opts.onImportCurlConfirm,
    onCancel: () => opts.setImportCurlVisible(false),
  })

  const exportCollectionActions = useFormOverlayIntercept({
    visible: opts.exportCollectionVisible,
    handleRef: opts.exportCollectionRef,
    onConfirm: opts.onExportCollectionConfirm,
    onCancel: opts.onExportCollectionCancel,
    passThroughFocuses: ["format"],
  })

  const importCollectionActions = useFormOverlayIntercept({
    visible: opts.importCollectionVisible,
    handleRef: opts.importCollectionRef,
    onConfirm: opts.onImportCollectionConfirm,
    onCancel: () => {
      if (!opts.importCollectionPendingRef.current) {
        opts.setImportCollectionVisible(false)
      }
    },
    passThroughFocuses: ["destination"],
  })

  const editRequestActions = useFormOverlayIntercept({
    visible: opts.editRequestVisible,
    handleRef: opts.editRequestRef,
    onConfirm: opts.onEditRequestConfirm,
    onCancel: () => opts.setEditRequestVisible(false),
    passThroughFocuses: ["method", "folder"],
  })

  const cloneRequestActions = useSingleFieldFormOverlayIntercept({
    visible: opts.cloneRequestVisible,
    handleRef: opts.cloneRequestRef,
    onConfirm: opts.onCloneRequestConfirm,
    onCancel: () => opts.setCloneRequestVisible(false),
  })

  const newFolderActions = useSingleFieldFormOverlayIntercept({
    visible: opts.newFolderVisible,
    handleRef: opts.newFolderRef,
    onConfirm: opts.onNewFolderConfirm,
    onCancel: () => opts.setNewFolderVisible(false),
  })

  useEnvEditorIntercept(opts)

  return {
    ...dialogActions,
    newEnvironment: newEnvironmentActions,
    cookieForm: cookieFormActions,
    newRequest: newRequestActions,
    importCurl: importCurlActions,
    exportCollection: exportCollectionActions,
    importCollection: importCollectionActions,
    editRequest: editRequestActions,
    cloneRequest: cloneRequestActions,
    newFolder: newFolderActions,
  }
}
