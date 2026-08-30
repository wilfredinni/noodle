import type { RefObject } from "react"
import type { SaveState } from "./saveState"
import type { Focus } from "./focus"
import type { AppView } from "./appState"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"
import type { ExportCollectionValues } from "./collectionExport"
import type { CollectionImportValues } from "./collectionImport"
import type { ImportedCollectionPending } from "./useOverlayState"
import type { NewEnvironmentValues } from "./overlays/NewEnvironmentOverlay"
import type { CookieFormValues } from "./overlays/CookieFormOverlay"
import type { CookieDeletePending } from "./useOverlayState"
import type { OverlayState } from "./useOverlayState"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
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

/**
 * Wires keyboard intercepts for every overlay.
 *
 * Overlay visibility, pending values, and handles travel as the single
 * `overlays` object owned by `useOverlayState`; only behavior callbacks and
 * state owned elsewhere (the reload guard, the collection switcher) are
 * separate props.
 */
export function useOverlayIntercepts(opts: {
  overlays: OverlayState
  cancelSendRef: RefObject<() => void>
  setSaveState: (s: SaveState) => void
  onCollectionUnregisterConfirm: (path: string) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  view: AppView
  setView: (v: AppView) => void
  focusRef: RefObject<Focus>
  setFocus: (f: Focus) => void
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  headerFieldRef: RefObject<"name" | "color">
  onNewEnvironmentConfirm: (values: NewEnvironmentValues) => void
  onCookieFormConfirm: (values: CookieFormValues) => void
  onCookieDeleteConfirm: (pending: CookieDeletePending) => void
  onNewRequestConfirm: (values: {
    name: string
    method: string
    url: string
    folderPath?: string
  }) => void
  onImportCurlConfirm: (values: {
    command: string
    name: string
    folderPath: string
  }) => void
  onExportCollectionCancel: () => void
  onExportCollectionConfirm: (values: ExportCollectionValues) => void
  importCollectionPendingRef: RefObject<boolean>
  onImportCollectionConfirm: (values: CollectionImportValues) => void
  onImportOpenConfirm: (pending: ImportedCollectionPending) => void
  onEditRequestConfirm: (values: {
    name: string
    method: string
    url: string
    folderPath?: string
  }) => void
  onCloneRequestConfirm: (newName: string) => void
  onRequestDeleteConfirm: () => void
  onRequestDeleteCancel: () => void
  onNewFolderConfirm: (name: string) => void
  onTagConfirm: (tag: string) => void
  onTagClear: () => void
  onFolderDeleteConfirm: () => void
  collectionSwitchPending: string | null
  setCollectionSwitchPending: (s: string | null) => void
  onCollectionSwitchConfirm: (collectionDir: string) => void
  onReloadConfirm: () => void
  onReloadCancel: () => void
  onInitConfirm: () => void
  draftRef: RefObject<UseRequestDraftResult>
  folderDraftRef: RefObject<UseFolderDraftResult>
}) {
  const { overlays } = opts

  useGlobalIntercepts(opts)

  const dialogActions = useDialogIntercepts(opts)

  const newEnvironmentActions = useFormOverlayIntercept({
    visible: overlays.newEnvironmentVisible,
    handleRef: overlays.newEnvironmentRef,
    onConfirm: opts.onNewEnvironmentConfirm,
    onCancel: () => overlays.setNewEnvironmentVisible(false),
    passThroughFocuses: ["color"],
  })

  const cookieFormActions = useFormOverlayIntercept({
    visible: overlays.cookieFormVisible,
    handleRef: overlays.cookieFormRef,
    onConfirm: opts.onCookieFormConfirm,
    onCancel: () => overlays.setCookieFormVisible(false),
    passThroughFocuses: ["sameSite"],
    toggleFocuses: ["secure", "httpOnly", "hostOnly"],
  })

  const newRequestActions = useFormOverlayIntercept({
    visible: overlays.newRequestVisible,
    handleRef: overlays.newRequestRef,
    onConfirm: opts.onNewRequestConfirm,
    onCancel: () => overlays.setNewRequestVisible(false),
    passThroughFocuses: ["method", "folder"],
  })

  const importCurlActions = useFormOverlayIntercept({
    visible: overlays.importCurlVisible,
    handleRef: overlays.importCurlRef,
    onConfirm: opts.onImportCurlConfirm,
    onCancel: () => overlays.setImportCurlVisible(false),
  })

  const exportCollectionActions = useFormOverlayIntercept({
    visible: overlays.exportCollectionVisible,
    handleRef: overlays.exportCollectionRef,
    onConfirm: opts.onExportCollectionConfirm,
    onCancel: opts.onExportCollectionCancel,
    passThroughFocuses: ["format"],
  })

  const importCollectionActions = useFormOverlayIntercept({
    visible: overlays.importCollectionVisible,
    handleRef: overlays.importCollectionRef,
    onConfirm: opts.onImportCollectionConfirm,
    onCancel: () => {
      if (!opts.importCollectionPendingRef.current) {
        overlays.setImportCollectionVisible(false)
      }
    },
    passThroughFocuses: ["destination"],
  })

  const editRequestActions = useFormOverlayIntercept({
    visible: overlays.editRequestVisible,
    handleRef: overlays.editRequestRef,
    onConfirm: opts.onEditRequestConfirm,
    onCancel: () => overlays.setEditRequestVisible(false),
    passThroughFocuses: ["method", "folder"],
  })

  const cloneRequestActions = useSingleFieldFormOverlayIntercept({
    visible: overlays.cloneRequestVisible,
    handleRef: overlays.cloneRequestRef,
    onConfirm: opts.onCloneRequestConfirm,
    onCancel: () => overlays.setCloneRequestVisible(false),
  })

  const newFolderActions = useSingleFieldFormOverlayIntercept({
    visible: overlays.newFolderVisible,
    handleRef: overlays.newFolderRef,
    onConfirm: opts.onNewFolderConfirm,
    onCancel: () => overlays.setNewFolderVisible(false),
  })

  const tagEditorActions = useSingleFieldFormOverlayIntercept({
    visible: overlays.tagEditPending !== null,
    handleRef: overlays.tagEditorRef,
    onConfirm: opts.onTagConfirm,
    onCancel: () => overlays.setTagEditPending(null),
    onClear:
      overlays.tagEditPending?.kind === "runner-filter" &&
      overlays.tagEditPending.value
        ? opts.onTagClear
        : undefined,
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
    tagEditor: tagEditorActions,
  }
}
