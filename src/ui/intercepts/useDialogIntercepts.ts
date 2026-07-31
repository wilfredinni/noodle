import { useCallback, useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { SaveState } from "../saveState"
import type { UseEnvironmentEditorResult } from "../../hooks/useEnvironmentEditor"

export function useDialogIntercepts(opts: {
  saveState: SaveState
  setSaveState: (s: SaveState) => void
  doSave: () => void
  envDeletePending: string | null
  setEnvDeletePending: (s: string | null) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  collectionSwitchPending: string | null
  setCollectionSwitchPending: (s: string | null) => void
  onCollectionSwitchConfirm: (collectionDir: string) => void
  requestDeletePending: string | null
  setRequestDeletePending: (s: string | null) => void
  onRequestDeleteConfirm: () => void
  folderDeletePending: string | null
  setFolderDeletePending: (s: string | null) => void
  onFolderDeleteConfirm: () => void
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
    saveState,
    setSaveState,
    doSave,
    envDeletePending,
    setEnvDeletePending,
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    collectionSwitchPending,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm,
    requestDeletePending,
    setRequestDeletePending,
    onRequestDeleteConfirm,
    folderDeletePending,
    setFolderDeletePending,
    onFolderDeleteConfirm,
    undoAllPending,
    setUndoAllPending,
    draftRef,
    folderDraftRef,
    initPending,
    setInitPending,
    onInitConfirm,
    updateConfirmVisible,
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

  const onConfirm = useCallback(() => {
    if (saveState.kind === "confirming") doSave()
    else if (envDeletePending) confirmEnvDelete()
    else if (undoAllPending) confirmUndoAll()
    else if (initPending) confirmInit()
    else if (collectionSwitchPending) confirmCollectionSwitch()
    else if (folderDeletePending) onFolderDeleteConfirm()
    else if (requestDeletePending) onRequestDeleteConfirm()
    else if (updateConfirmVisible) onConfirmInstall()
  }, [
    saveState.kind,
    doSave,
    envDeletePending,
    confirmEnvDelete,
    undoAllPending,
    confirmUndoAll,
    initPending,
    confirmInit,
    collectionSwitchPending,
    confirmCollectionSwitch,
    folderDeletePending,
    onFolderDeleteConfirm,
    requestDeletePending,
    onRequestDeleteConfirm,
    updateConfirmVisible,
    onConfirmInstall,
  ])

  const onCancel = useCallback(() => {
    if (saveState.kind === "confirming") setSaveState({ kind: "idle" })
    else if (envDeletePending) setEnvDeletePending(null)
    else if (undoAllPending) setUndoAllPending(false)
    else if (initPending) setInitPending(false)
    else if (collectionSwitchPending) setCollectionSwitchPending(null)
    else if (folderDeletePending) setFolderDeletePending(null)
    else if (requestDeletePending) setRequestDeletePending(null)
    else if (updateConfirmVisible) onCancelUpdate()
  }, [
    saveState.kind,
    setSaveState,
    envDeletePending,
    setEnvDeletePending,
    undoAllPending,
    setUndoAllPending,
    initPending,
    setInitPending,
    collectionSwitchPending,
    setCollectionSwitchPending,
    folderDeletePending,
    setFolderDeletePending,
    requestDeletePending,
    setRequestDeletePending,
    updateConfirmVisible,
    onCancelUpdate,
  ])

  // ── Overlay: Save Confirm ──────────────────────────────────────────
  useEffect(() => {
    if (saveState.kind !== "confirming") return
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
  }, [saveState.kind, keymap, onConfirm, onCancel])

  // ── Overlay: Delete env confirmation ──────────────────────────────
  useEffect(() => {
    if (!envDeletePending) return
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
  }, [envDeletePending, keymap, onConfirm, onCancel])

  // ── Overlay: Collection switch confirmation ──────────────────────
  useEffect(() => {
    if (!collectionSwitchPending) return
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
  }, [collectionSwitchPending, keymap, onConfirm, onCancel])

  // ── Overlay: Delete Request ────────────────────────────────────────
  useEffect(() => {
    if (!requestDeletePending) return
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
  }, [requestDeletePending, keymap, onConfirm, onCancel])

  // ── Overlay: Delete Folder ────────────────────────────────────────
  useEffect(() => {
    if (!folderDeletePending) return
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
  }, [folderDeletePending, keymap, onConfirm, onCancel])

  // ── Overlay: Undo All ──────────────────────────────────────────────
  useEffect(() => {
    if (!undoAllPending) return
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
  }, [undoAllPending, keymap, onConfirm, onCancel])

  // ── Overlay: Init Confirm ─────────────────────────────────────────
  useEffect(() => {
    if (!initPending) return
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
  }, [initPending, keymap, onConfirm, onCancel])

  // ── Overlay: Update confirm ──────────────────────────────────────
  useEffect(() => {
    if (!updateConfirmVisible) return
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
  }, [updateConfirmVisible, keymap, onConfirm, onCancel])

  return { onConfirm, onCancel }
}
