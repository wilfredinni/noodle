import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { SaveState } from "./saveState"
import type { Focus } from "./focus"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"
import type { NewRequestOverlayHandle } from "./overlays/NewRequestOverlay"
import type { CloneRequestOverlayHandle } from "./overlays/CloneRequestOverlay"
import type { NewFolderOverlayHandle } from "./overlays/NewFolderOverlay"
import type { ImportCurlOverlayHandle } from "./overlays/ImportCurlOverlay"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"

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
  activeOverlay: string
  cancelSendRef: RefObject<() => void>
  saveState: SaveState
  setSaveState: (s: SaveState) => void
  doSave: () => void
  envDeletePending: string | null
  envDeletePendingRef: RefObject<string | null>
  setEnvDeletePending: (s: string | null) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  helpVisible: boolean
  setHelpVisible: (v: boolean) => void
  aboutVisible: boolean
  setAboutVisible: (v: boolean) => void
  view: "main" | "env-editor"
  setView: (v: "main" | "env-editor") => void
  focusRef: RefObject<Focus>
  setFocus: (f: Focus) => void
  envHeaderRef: RefObject<EnvHeaderPaneHandle | null>
  headerFieldRef: RefObject<"name" | "color">
  newRequestVisible: boolean
  newRequestRef: RefObject<NewRequestOverlayHandle | null>
  setNewRequestVisible: (v: boolean) => void
  onNewRequestConfirm: (values: {
    name: string
    method: string
    url: string
  }) => void
  importCurlVisible: boolean
  importCurlRef: RefObject<ImportCurlOverlayHandle | null>
  setImportCurlVisible: (v: boolean) => void
  onImportCurlConfirm: (values: {
    command: string
    name: string
    folderPath: string
  }) => void
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
}): void {
  const keymap = useKeymap()
  const {
    activeOverlay,
    cancelSendRef,
    saveState,
    setSaveState,
    doSave,
    envDeletePending,
    envDeletePendingRef,
    setEnvDeletePending,
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
    view,
    setView,
    focusRef,
    setFocus,
    envHeaderRef,
    headerFieldRef,
    newRequestVisible,
    newRequestRef,
    setNewRequestVisible,
    onNewRequestConfirm,
    importCurlVisible,
    importCurlRef,
    setImportCurlVisible,
    onImportCurlConfirm,
    editRequestVisible,
    editRequestRef,
    setEditRequestVisible,
    onEditRequestConfirm,
    cloneRequestVisible,
    cloneRequestRef,
    setCloneRequestVisible,
    onCloneRequestConfirm,
    requestDeletePending,
    setRequestDeletePending,
    onRequestDeleteConfirm,
    newFolderVisible,
    newFolderRef,
    setNewFolderVisible,
    onNewFolderConfirm,
    folderDeletePending,
    setFolderDeletePending,
    onFolderDeleteConfirm,
    collectionSwitchPending,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm,
    undoAllPending,
    setUndoAllPending,
    initPending,
    setInitPending,
    onInitConfirm,
    draftRef,
    folderDraftRef,
    updateConfirmVisible,
    onConfirmInstall,
    onCancelUpdate,
  } = opts

  // ── Cancel send on ESC ──────────────────────────────────────────────
  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (shouldCancelSend(activeOverlay, ctx.event)) {
          cancelSendRef.current()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [activeOverlay, keymap, cancelSendRef])

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
    const ee = envEditorRef.current
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
          ee.deleteEnv()
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

  // ── Overlay: Help ──────────────────────────────────────────────────
  useEffect(() => {
    if (!helpVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setHelpVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [helpVisible, keymap, setHelpVisible])

  // ── Overlay: About ─────────────────────────────────────────────────
  useEffect(() => {
    if (!aboutVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setAboutVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [aboutVisible, keymap, setAboutVisible])

  // ── Overlay: New Request ──────────────────────────────────────────
  useEffect(() => {
    if (!newRequestVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = newRequestRef.current
        if (!handle) return

        if (e.name === "tab" && !e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus(1)
          return
        }
        if (e.name === "tab" && e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus(-1)
          return
        }
        if (e.name === "return") {
          if (handle.getFocus() === "url") {
            e.preventDefault()
            e.stopPropagation()
            const result = handle.confirm()
            if (result) onNewRequestConfirm(result)
          } else if (handle.getFocus() === "method") {
            return
          } else {
            e.preventDefault()
            e.stopPropagation()
            handle.commitField()
          }
          return
        }
        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onNewRequestConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          setNewRequestVisible(false)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    newRequestVisible,
    newRequestRef,
    setNewRequestVisible,
    onNewRequestConfirm,
    keymap,
  ])

  // ── Overlay: Import cURL ─────────────────────────────────────────
  useEffect(() => {
    if (!importCurlVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const event = ctx.event
        const handle = importCurlRef.current
        if (!handle) return
        if (event.name === "tab") {
          event.preventDefault()
          event.stopPropagation()
          handle.cycleFocus(event.shift ? -1 : 1)
          return
        }
        if (event.name === "s" && event.ctrl) {
          event.preventDefault()
          event.stopPropagation()
          const result = handle.confirm()
          if (result) onImportCurlConfirm(result)
          return
        }
        if (event.name === "escape") {
          event.preventDefault()
          event.stopPropagation()
          setImportCurlVisible(false)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    importCurlVisible,
    importCurlRef,
    keymap,
    onImportCurlConfirm,
    setImportCurlVisible,
  ])

  // ── Overlay: Edit Request ──────────────────────────────────────────
  useEffect(() => {
    if (!editRequestVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = editRequestRef.current
        if (!handle) return

        if (e.name === "tab" && !e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus(1)
          return
        }
        if (e.name === "tab" && e.shift) {
          e.preventDefault()
          e.stopPropagation()
          handle.cycleFocus(-1)
          return
        }
        if (e.name === "return") {
          if (handle.getFocus() === "url") {
            e.preventDefault()
            e.stopPropagation()
            const result = handle.confirm()
            if (result) onEditRequestConfirm(result)
          } else if (
            handle.getFocus() === "method" ||
            handle.getFocus() === "folder"
          ) {
            return
          } else {
            e.preventDefault()
            e.stopPropagation()
            handle.commitField()
          }
          return
        }
        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onEditRequestConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          setEditRequestVisible(false)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    editRequestVisible,
    editRequestRef,
    setEditRequestVisible,
    onEditRequestConfirm,
    keymap,
  ])

  // ── Overlay: Clone Request ─────────────────────────────────────────
  useEffect(() => {
    if (!cloneRequestVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = cloneRequestRef.current
        if (!handle) return

        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onCloneRequestConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          setCloneRequestVisible(false)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    cloneRequestVisible,
    cloneRequestRef,
    setCloneRequestVisible,
    onCloneRequestConfirm,
    keymap,
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

  // ── Overlay: New Folder ───────────────────────────────────────────
  useEffect(() => {
    if (!newFolderVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const handle = newFolderRef.current
        if (!handle) return

        if (e.name === "s" && e.ctrl) {
          e.preventDefault()
          e.stopPropagation()
          const result = handle.confirm()
          if (result) onNewFolderConfirm(result)
          return
        }
        if (e.name === "escape") {
          e.preventDefault()
          e.stopPropagation()
          setNewFolderVisible(false)
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    newFolderVisible,
    newFolderRef,
    setNewFolderVisible,
    onNewFolderConfirm,
    keymap,
  ])

  // ── Env Editor Mode ───────────────────────────────────────────────
  useEffect(() => {
    if (view !== "env-editor") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const ee = envEditorRef.current

        if (keymap.getData("app.overlay") !== "none") return

        const f = focusRef.current

        if (f === "env-sidebar") {
          if (e.name === "up" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const idx = ee.selectedEnvName
              ? names.indexOf(ee.selectedEnvName)
              : -1
            const prev = idx > 0 ? idx - 1 : names.length - 1
            if (names[prev]) ee.selectEnv(names[prev]!)
            return
          }
          if (e.name === "down" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const idx = ee.selectedEnvName
              ? names.indexOf(ee.selectedEnvName)
              : -1
            const next = idx < names.length - 1 ? idx + 1 : 0
            if (names[next]) ee.selectEnv(names[next]!)
            return
          }
          if (e.name === "home" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            if (names[0]) ee.selectEnv(names[0])
            return
          }
          if (e.name === "end" && ee.draft !== null) {
            e.preventDefault()
            e.stopPropagation()
            const names = ee.envNames
            const last = names[names.length - 1]
            if (last) ee.selectEnv(last)
            return
          }
        }

        if (f === "env-header") {
          if (e.name === "tab" && !e.shift) {
            e.preventDefault()
            e.stopPropagation()
            if (headerFieldRef.current === "name") {
              headerFieldRef.current = "color"
              envHeaderRef.current?.focusColor()
            } else {
              headerFieldRef.current = "name"
              setFocus("env-vars")
              ee.enterBrowse()
            }
            return
          }
          if (e.name === "tab" && e.shift) {
            e.preventDefault()
            e.stopPropagation()
            if (headerFieldRef.current === "color") {
              headerFieldRef.current = "name"
              envHeaderRef.current?.focusName()
            } else {
              headerFieldRef.current = "color"
              setFocus("env-sidebar")
            }
            return
          }
        }

        if (e.name === "escape" && envDeletePendingRef.current === null) {
          e.preventDefault()
          e.stopPropagation()
          ee.closeEditor()
          setView("main")
          setFocus("sidebar")
          return
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    view,
    keymap,
    focusRef,
    envEditorRef,
    envHeaderRef,
    headerFieldRef,
    setFocus,
    envDeletePendingRef,
    setView,
  ])
}
