import { useEffect } from "react"
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
}): void {
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
          doSave()
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setSaveState({ kind: "idle" })
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [saveState.kind, doSave, keymap, setSaveState])

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
          const envName = envDeletePending
          if (!envName) return
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
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setEnvDeletePending(null)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    envDeletePending,
    keymap,
    setEnvDeletePending,
    setSaveState,
    clearSaveTimer,
    saveTimerRef,
    envEditorRef,
  ])

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
          const nextDir = collectionSwitchPending
          setCollectionSwitchPending(null)
          onCollectionSwitchConfirm(nextDir)
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setCollectionSwitchPending(null)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    collectionSwitchPending,
    keymap,
    onCollectionSwitchConfirm,
    setCollectionSwitchPending,
  ])

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
          onRequestDeleteConfirm()
          return
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setRequestDeletePending(null)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    requestDeletePending,
    onRequestDeleteConfirm,
    setRequestDeletePending,
    keymap,
  ])

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
          onFolderDeleteConfirm()
          return
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setFolderDeletePending(null)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    folderDeletePending,
    onFolderDeleteConfirm,
    setFolderDeletePending,
    keymap,
  ])

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
          draftRef.current.revertAllRequests()
          folderDraftRef.current.revertAllFolders()
          envEditorRef.current?.revertDraft()
          setUndoAllPending(false)
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setUndoAllPending(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    undoAllPending,
    keymap,
    setUndoAllPending,
    draftRef,
    folderDraftRef,
    envEditorRef,
  ])

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
          onInitConfirm()
          setInitPending(false)
        } else if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setInitPending(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [initPending, keymap, onInitConfirm, setInitPending])

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
          onConfirmInstall()
        }
        if (name === "n" || name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          onCancelUpdate()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [updateConfirmVisible, keymap, onConfirmInstall, onCancelUpdate])
}
