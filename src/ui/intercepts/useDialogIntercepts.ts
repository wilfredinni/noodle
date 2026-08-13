import { useCallback, useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { SaveState } from "../saveState"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"
import type { ActiveOverlay } from "../useOverlayState"
import type { ImportedCollectionPending } from "../useOverlayState"
import type { CookieDeletePending } from "../useOverlayState"

export function useDialogIntercepts(opts: {
  activeOverlay: ActiveOverlay
  setSaveState: (s: SaveState) => void
  envDeletePending: string | null
  setEnvDeletePending: (s: string | null) => void
  collectionUnregisterPending: string | null
  setCollectionUnregisterPending: (s: string | null) => void
  onCollectionUnregisterConfirm: (path: string) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  collectionSwitchPending: string | null
  setCollectionSwitchPending: (s: string | null) => void
  onCollectionSwitchConfirm: (collectionDir: string) => void
  importOpenPending: ImportedCollectionPending | null
  setImportOpenPending: (pending: ImportedCollectionPending | null) => void
  onImportOpenConfirm: (pending: ImportedCollectionPending) => void
  reloadPending: boolean
  setReloadPending: (v: boolean) => void
  onReloadConfirm: () => void
  requestDeletePending: string | null
  setRequestDeletePending: (s: string | null) => void
  onRequestDeleteConfirm: () => void
  folderDeletePending: string | null
  setFolderDeletePending: (s: string | null) => void
  onFolderDeleteConfirm: () => void
  cookieDeletePending: CookieDeletePending | null
  setCookieDeletePending: (pending: CookieDeletePending | null) => void
  onCookieDeleteConfirm: (pending: CookieDeletePending) => void
  undoAllPending: boolean
  setUndoAllPending: (v: boolean) => void
  draftRef: RefObject<{ revertAllRequests: () => void }>
  folderDraftRef: RefObject<{ revertAllFolders: () => void }>
  initPending: boolean
  setInitPending: (v: boolean) => void
  onInitConfirm: () => void
  updateConfirmVisible: boolean
  onConfirmInstall: () => void
  onCancelUpdate: () => void
}): { onConfirm: () => void; onCancel: () => void } {
  const keymap = useKeymap()
  const {
    activeOverlay,
    setSaveState,
    envDeletePending,
    setEnvDeletePending,
    collectionUnregisterPending,
    setCollectionUnregisterPending,
    onCollectionUnregisterConfirm,
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    collectionSwitchPending,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm,
    importOpenPending,
    setImportOpenPending,
    onImportOpenConfirm,
    setReloadPending,
    onReloadConfirm,
    setRequestDeletePending,
    onRequestDeleteConfirm,
    setFolderDeletePending,
    onFolderDeleteConfirm,
    cookieDeletePending,
    setCookieDeletePending,
    onCookieDeleteConfirm,
    setUndoAllPending,
    draftRef,
    folderDraftRef,
    setInitPending,
    onInitConfirm,
    onConfirmInstall,
    onCancelUpdate,
  } = opts

  const confirmEnvDelete = useCallback(() => {
    if (!envDeletePending) return
    const envName = envDeletePending
    setEnvDeletePending(null)
    envEditorRef.current
      .deleteEnv()
      .then(() => {
        clearSaveTimer()
        setSaveState({ kind: "success", message: `Deleted ${envName}` })
        saveTimerRef.current = setTimeout(
          () => setSaveState({ kind: "idle" }),
          2000,
        )
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        clearSaveTimer()
        setSaveState({ kind: "error", message: msg })
        saveTimerRef.current = setTimeout(
          () => setSaveState({ kind: "idle" }),
          2000,
        )
      })
  }, [
    envDeletePending,
    setEnvDeletePending,
    envEditorRef,
    clearSaveTimer,
    setSaveState,
    saveTimerRef,
  ])

  const confirmUndoAll = useCallback(() => {
    draftRef.current.revertAllRequests()
    folderDraftRef.current.revertAllFolders()
    envEditorRef.current?.revertDraft()
    setUndoAllPending(false)
  }, [draftRef, folderDraftRef, envEditorRef, setUndoAllPending])

  const confirmCollectionUnregister = useCallback(() => {
    if (!collectionUnregisterPending) return
    setCollectionUnregisterPending(null)
    onCollectionUnregisterConfirm(collectionUnregisterPending)
  }, [
    collectionUnregisterPending,
    onCollectionUnregisterConfirm,
    setCollectionUnregisterPending,
  ])

  const confirmInit = useCallback(() => {
    onInitConfirm()
    setInitPending(false)
  }, [onInitConfirm, setInitPending])

  const confirmCollectionSwitch = useCallback(() => {
    if (!collectionSwitchPending) return
    setCollectionSwitchPending(null)
    onCollectionSwitchConfirm(collectionSwitchPending)
  }, [
    collectionSwitchPending,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm,
  ])

  const confirmImportOpen = useCallback(() => {
    if (!importOpenPending) return
    setImportOpenPending(null)
    onImportOpenConfirm(importOpenPending)
  }, [importOpenPending, onImportOpenConfirm, setImportOpenPending])

  const confirmCookieDelete = useCallback(() => {
    if (!cookieDeletePending) return
    setCookieDeletePending(null)
    onCookieDeleteConfirm(cookieDeletePending)
  }, [cookieDeletePending, setCookieDeletePending, onCookieDeleteConfirm])

  const onConfirm = useCallback(() => {
    if (activeOverlay === "env-delete") confirmEnvDelete()
    else if (activeOverlay === "collection-unregister")
      confirmCollectionUnregister()
    else if (activeOverlay === "undo-all") confirmUndoAll()
    else if (activeOverlay === "init-confirm") confirmInit()
    else if (activeOverlay === "collection-switch-confirm")
      confirmCollectionSwitch()
    else if (activeOverlay === "import-open-confirm") confirmImportOpen()
    else if (activeOverlay === "reload-confirm") onReloadConfirm()
    else if (activeOverlay === "delete-folder") onFolderDeleteConfirm()
    else if (activeOverlay === "request-delete") onRequestDeleteConfirm()
    else if (activeOverlay === "cookie-delete") confirmCookieDelete()
    else if (activeOverlay === "update-confirm") onConfirmInstall()
  }, [
    activeOverlay,
    confirmEnvDelete,
    confirmCollectionUnregister,
    confirmUndoAll,
    confirmInit,
    confirmCollectionSwitch,
    confirmImportOpen,
    onReloadConfirm,
    onFolderDeleteConfirm,
    onRequestDeleteConfirm,
    confirmCookieDelete,
    onConfirmInstall,
  ])

  const onCancel = useCallback(() => {
    if (activeOverlay === "env-delete") setEnvDeletePending(null)
    else if (activeOverlay === "collection-unregister")
      setCollectionUnregisterPending(null)
    else if (activeOverlay === "undo-all") setUndoAllPending(false)
    else if (activeOverlay === "init-confirm") setInitPending(false)
    else if (activeOverlay === "collection-switch-confirm")
      setCollectionSwitchPending(null)
    else if (activeOverlay === "import-open-confirm") setImportOpenPending(null)
    else if (activeOverlay === "reload-confirm") setReloadPending(false)
    else if (activeOverlay === "delete-folder") setFolderDeletePending(null)
    else if (activeOverlay === "request-delete") setRequestDeletePending(null)
    else if (activeOverlay === "cookie-delete") setCookieDeletePending(null)
    else if (activeOverlay === "update-confirm") onCancelUpdate()
  }, [
    activeOverlay,
    setEnvDeletePending,
    setCollectionUnregisterPending,
    setUndoAllPending,
    setInitPending,
    setCollectionSwitchPending,
    setImportOpenPending,
    setReloadPending,
    setFolderDeletePending,
    setRequestDeletePending,
    setCookieDeletePending,
    onCancelUpdate,
  ])

  // ── Overlay: Delete env confirmation ──────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "env-delete") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Unregister collection confirmation ──────────────────
  useEffect(() => {
    if (activeOverlay !== "collection-unregister") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Cookie delete confirmation ──────────────────────────
  useEffect(() => {
    if (activeOverlay !== "cookie-delete") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Collection switch confirmation ──────────────────────
  useEffect(() => {
    if (activeOverlay !== "collection-switch-confirm") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  useEffect(() => {
    if (activeOverlay !== "import-open-confirm") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Reload confirmation ─────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "reload-confirm") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Delete Request ────────────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "request-delete") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
          return
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Delete Folder ────────────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "delete-folder") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
          return
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Undo All ──────────────────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "undo-all") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Init Confirm ─────────────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "init-confirm") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  // ── Overlay: Update confirm ──────────────────────────────────────
  useEffect(() => {
    if (activeOverlay !== "update-confirm") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || name === "return") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onConfirm()
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancel()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, onConfirm, onCancel])

  return { onConfirm, onCancel }
}
