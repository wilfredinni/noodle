import { useEffect } from "react"
import type { RefObject } from "react"
import { useKeymap } from "@opentui/keymap/react"
import type { SaveState } from "./saveState"
import type { Focus } from "./focus"
import type { UseEnvironmentEditorResult } from "../hooks/useEnvironmentEditor"
import type { EnvHeaderPaneHandle } from "./EnvHeaderPane"
import type { NewRequestOverlayHandle } from "./NewRequestOverlay"
import type { CloneRequestOverlayHandle } from "./CloneRequestOverlay"
import type { NewFolderOverlayHandle } from "./NewFolderOverlay"

export function useOverlayIntercepts(opts: {
  cancelSendRef: RefObject<() => void>
  saveState: SaveState
  confirmSelection: number
  setConfirmSelection: (n: number) => void
  setSaveState: (s: SaveState) => void
  doSave: () => void
  envDeletePending: string | null
  envDeletePendingRef: RefObject<string | null>
  setEnvDeletePending: (s: string | null) => void
  deleteConfirmSelection: number
  setDeleteConfirmSelection: (n: number) => void
  envEditorRef: RefObject<UseEnvironmentEditorResult>
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  helpVisible: boolean
  setHelpVisible: (v: boolean) => void
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
}): void {
  const keymap = useKeymap()
  const {
    cancelSendRef,
    saveState,
    confirmSelection,
    setConfirmSelection,
    setSaveState,
    doSave,
    envDeletePending,
    envDeletePendingRef,
    setEnvDeletePending,
    deleteConfirmSelection,
    setDeleteConfirmSelection,
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    helpVisible,
    setHelpVisible,
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
  } = opts

  // ── Cancel send on ESC ──────────────────────────────────────────────
  useEffect(() => {
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape" && ctx.event.eventType === "press") {
          cancelSendRef.current()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [keymap, cancelSendRef])

  // ── Overlay: Save Confirm ──────────────────────────────────────────
  useEffect(() => {
    if (saveState.kind !== "confirming") return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (name === "y" || (name === "return" && confirmSelection === 0)) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          doSave()
        } else if (
          name === "n" ||
          name === "escape" ||
          (name === "return" && confirmSelection === 1)
        ) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setSaveState({ kind: "idle" })
        } else if (name === "left" || name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setConfirmSelection(0)
        } else if (name === "right" || name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setConfirmSelection(1)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    saveState.kind,
    confirmSelection,
    doSave,
    keymap,
    setConfirmSelection,
    setSaveState,
  ])

  // ── Overlay: Delete env confirmation ──────────────────────────────
  useEffect(() => {
    if (!envDeletePending) return
    const ee = envEditorRef.current
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const name = ctx.event.name
        if (
          name === "y" ||
          (name === "return" && deleteConfirmSelection === 0)
        ) {
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
        } else if (
          name === "n" ||
          name === "escape" ||
          (name === "return" && deleteConfirmSelection === 1)
        ) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setEnvDeletePending(null)
        } else if (name === "left" || name === "up") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setDeleteConfirmSelection(0)
        } else if (name === "right" || name === "down") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          setDeleteConfirmSelection(1)
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    envDeletePending,
    deleteConfirmSelection,
    keymap,
    setEnvDeletePending,
    setDeleteConfirmSelection,
    setSaveState,
    clearSaveTimer,
    saveTimerRef,
    envEditorRef,
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
          } else if (handle.getFocus() === "method" || handle.getFocus() === "folder") {
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
    if (view !== "env-editor" || keymap.getData("app.overlay") !== "none")
      return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        const e = ctx.event
        const ee = envEditorRef.current

        const f = focusRef.current

        if (f === "env-sidebar") {
          if (e.name === "up" && ee.editingField === null) {
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
          if (e.name === "down" && ee.editingField === null) {
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

        if (f === "env-vars") {
          const inEdit = ee.editingField !== null
          const rows = ee.draft?.varRows.length ?? 0

          if (e.name === "up" && !inEdit) {
            e.preventDefault()
            e.stopPropagation()
            const prev = Math.max(0, ee.selectedRowIndex - 1)
            ee.selectRow(prev)
            return
          }
          if (e.name === "down" && !inEdit) {
            e.preventDefault()
            e.stopPropagation()
            if (ee.selectedRowIndex >= rows - 1) {
              if (ee.selectedRowIndex >= rows) {
                ee.addVar()
              } else {
                ee.selectRow(rows)
              }
            } else {
              ee.selectRow(ee.selectedRowIndex + 1)
            }
            return
          }

          if (e.name === "return") {
            e.preventDefault()
            e.stopPropagation()
            if (rows === 0) {
              ee.addVar()
              return
            }
            if (ee.selectedRowIndex >= rows) {
              ee.addVar()
              return
            }
            if (ee.editingField === null) {
              ee.editField("key")
            } else if (ee.editingField === "key") {
              ee.editField("value")
            } else {
              const next = ee.selectedRowIndex + 1
              if (next < rows) {
                ee.selectRow(next)
                ee.editField("key")
              } else {
                ee.editField(null)
              }
            }
            return
          }

          if (e.name === "tab" && !e.shift && inEdit) {
            e.preventDefault()
            e.stopPropagation()
            if (ee.editingField === "key") {
              ee.editField("value")
            } else {
              ee.editField("key")
            }
            return
          }

          if (e.name === "escape") {
            if (inEdit) {
              e.preventDefault()
              e.stopPropagation()
              ee.editField(null)
              return
            }
            if (ee.selectedRowIndex >= rows) {
              e.preventDefault()
              e.stopPropagation()
              ee.selectRow(Math.max(0, rows - 1))
              return
            }
          }

          if (
            e.name === "d" &&
            e.ctrl &&
            !inEdit &&
            ee.selectedRowIndex < rows
          ) {
            e.preventDefault()
            e.stopPropagation()
            ee.deleteVar(ee.selectedRowIndex)
            return
          }

          if (e.name === "space" && !inEdit && ee.selectedRowIndex < rows) {
            e.preventDefault()
            e.stopPropagation()
            ee.toggleVar(ee.selectedRowIndex)
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
