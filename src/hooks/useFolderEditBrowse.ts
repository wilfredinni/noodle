import { scriptPhase, scriptText } from "../scriptAuthoring"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Folder } from "../schema"
import {
  initialFolderEditState,
  enterFolderEditBrowse,
  exitEditBrowse,
  moveFolderRowCursor,
  folderCursorForField,
  beginEditing,
  commitEditing,
  cancelEditing,
  toggleSubfield,
  cycleFolderField,
  type EditState,
  type FolderRowCount,
  type FolderFieldKind,
  type FieldKind,
} from "../ui/editMode"
import type { UseFolderDraftResult } from "./useFolderDraft"
import { authFieldAtRow, authRowCount, authValueAtRow } from "../ui/authRows"

export type { FolderFieldKind }

export interface UseFolderEditBrowseResult {
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  editKey: string
  setEditKey: (v: string) => void
  isActive: boolean
  activeTab: FieldKind
  revealedOptionalTabs: readonly FieldKind[]
  revealOptionalTab: (tab: FieldKind) => void
  optionalTabMenuVisible: boolean
  optionalTabMenuActive: boolean
  setOptionalTabMenuActive: (active: boolean) => void
  enterBrowse: () => void
  enterBrowseAt: (field: FolderFieldKind, row?: number) => void
  exitBrowse: () => void
  browseUp: () => void
  browseDown: () => void
  browseLeft: () => void
  browseRight: () => void
  enterAndEdit: () => void
  enterEdit: () => void
  commitEdit: () => void
  cancelEdit: () => void
  browseTab: () => void
  revertField: () => void
  revertAll: () => void
  toggleRow: () => void
  cycleInactiveTab: (delta: 1 | -1) => void
  activateAt: (
    field: FolderFieldKind,
    row: number,
    addingRow?: boolean,
    subfield?: "key" | "value",
  ) => void
  toggleAt: (field: FolderFieldKind, row: number) => void
}

export interface UseFolderEditBrowseOptions {
  initialTab?: FieldKind
  onTabChange?: (tab: FieldKind) => void
  optionalTabMenuEnabled?: boolean
}

function folderRowCount(folder: Folder | null): FolderRowCount {
  if (!folder) return { meta: 1, headers: 0, auth: 1 }
  const authRows = authRowCount(folder.overrides?.auth)
  return {
    meta: 1,
    headers: Object.keys(folder.overrides?.headers ?? {}).length,
    auth: authRows,
    preScript: folder.scripts?.pre ? 1 : 0,
    postScript: folder.scripts?.post ? 1 : 0,
    tests: folder.tests ? 1 : 0,
  }
}

function folderCurrentValueFor(
  folder: Folder | null,
  field: FolderFieldKind,
  row: number,
  addingRow: boolean,
): string {
  if (!folder) return ""
  const phase = scriptPhase(field)
  if (phase) return scriptText(folder, phase)
  if (field === "activity") return ""
  if (field === "meta") {
    if (row === 0) return folder.name ?? ""
    return ""
  }
  if (field === "auth") {
    return authValueAtRow(folder.overrides?.auth, row)
  }
  if (field === "headers") {
    if (addingRow) return ""
    const rec = folder.overrides?.headers ?? {}
    const entries = Object.entries(rec)
    const entry = entries[row]
    return entry ? `${entry[0]}: ${entry[1].value}` : ""
  }
  return ""
}

function folderCurrentKeyValueFor(
  folder: Folder | null,
  field: FolderFieldKind,
  row: number,
  addingRow: boolean,
): { key: string; value: string } {
  if (!folder) return { key: "", value: "" }
  if (field === "activity") return { key: "", value: "" }
  if (addingRow) return { key: "", value: "" }
  if (field === "headers") {
    const rec = folder.overrides?.headers ?? {}
    const entries = Object.entries(rec)
    const entry = entries[row]
    return entry
      ? { key: entry[0], value: entry[1].value }
      : { key: "", value: "" }
  }
  if (field === "meta") {
    if (row === 0) return { key: "", value: folder.name ?? "" }
    return { key: "", value: "" }
  }
  if (field === "auth") {
    const val = folderCurrentValueFor(folder, field, row, false)
    return { key: "", value: val }
  }
  return { key: "", value: "" }
}

export function useFolderEditBrowse(
  folder: Folder | null,
  draftMutators: UseFolderDraftResult,
  options?: UseFolderEditBrowseOptions,
): UseFolderEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(
    initialFolderEditState(),
  )
  const [editValue, setEditValue] = useState("")
  const [editKey, setEditKey] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>(
    options?.initialTab ?? "meta",
  )
  const [revealedOptionalTabsByFolder, setRevealedOptionalTabsByFolder] =
    useState(() => new Map<string, FieldKind[]>())
  const [optionalTabMenuActive, setOptionalTabMenuActiveState] = useState(false)

  const draftRef = useRef(folder)
  draftRef.current = folder
  const revealedOptionalTabs = folder
    ? (revealedOptionalTabsByFolder.get(folder.path) ?? [])
    : []
  const revealedOptionalTabsRef = useRef(revealedOptionalTabs)
  revealedOptionalTabsRef.current = revealedOptionalTabs

  const setOptionalTabMenuActive = useCallback((active: boolean) => {
    setOptionalTabMenuActiveState(active)
    if (active) setEditState((prev) => exitEditBrowse(prev))
  }, [])

  const revealOptionalTab = useCallback((tab: FieldKind) => {
    const path = draftRef.current?.path
    if (path === undefined || !scriptPhase(tab)) return
    setRevealedOptionalTabsByFolder((revealed) => {
      const tabs = revealed.get(path) ?? []
      if (tabs.includes(tab)) return revealed
      const next = new Map(revealed)
      next.set(path, [...tabs, tab])
      return next
    })
  }, [])

  const editStateRef = useRef(editState)
  editStateRef.current = editState

  const editValueRef = useRef(editValue)
  editValueRef.current = editValue

  const editKeyRef = useRef(editKey)
  editKeyRef.current = editKey

  const onTabChangeRef = useRef(options?.onTabChange)
  onTabChangeRef.current = options?.onTabChange

  useEffect(() => {
    setInactiveTab(options?.initialTab ?? "meta")
    setOptionalTabMenuActive(false)
  }, [folder?.path, options?.initialTab])

  useEffect(() => {
    setEditState(initialFolderEditState())
  }, [folder?.path])

  const isFirstTabChange = useRef(true)
  useEffect(() => {
    if (isFirstTabChange.current) {
      isFirstTabChange.current = false
      return
    }
    onTabChangeRef.current?.(inactiveTab)
  }, [inactiveTab])

  const requestedTab = options?.initialTab ?? inactiveTab
  const phase = scriptPhase(requestedTab)
  const activeTab: FieldKind =
    editState.mode !== "inactive"
      ? editState.cursor.field
      : phase &&
          !scriptText(folder ?? {}, phase) &&
          !revealedOptionalTabs.includes(requestedTab)
        ? "meta"
        : requestedTab
  const tabNavigationRef = useRef({
    tab: activeTab,
    menuActive: optionalTabMenuActive,
  })
  tabNavigationRef.current = {
    tab: activeTab,
    menuActive: optionalTabMenuActive,
  }

  useEffect(() => {
    if (editState.mode === "inactive" || !scriptPhase(editState.cursor.field))
      return
    revealOptionalTab(editState.cursor.field)
  }, [editState.cursor.field, editState.mode, revealOptionalTab])

  const optionalTabMenuVisible =
    (options?.optionalTabMenuEnabled ?? true) && folder !== null
  useEffect(() => {
    if (!optionalTabMenuVisible) setOptionalTabMenuActive(false)
  }, [optionalTabMenuVisible])

  const enterBrowse = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    const tab = activeTab as FolderFieldKind
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      return enterFolderEditBrowse(prev, c, tab)
    })
  }, [activeTab])

  const enterBrowseAt = useCallback((field: FolderFieldKind, row?: number) => {
    setOptionalTabMenuActive(false)
    setInactiveTab(field)
    const c = folderRowCount(draftRef.current)
    setEditKey("")
    setEditState((prev) => {
      if (prev.mode !== "inactive") {
        const canceled = prev.mode === "editing" ? cancelEditing(prev) : prev
        const cursor = folderCursorForField(field, c)
        return {
          ...canceled,
          cursor:
            row === undefined ? cursor : { ...cursor, row, addingRow: false },
          editingRow: -1,
        }
      }
      const next = enterFolderEditBrowse(prev, c, field)
      if (row === undefined) return next
      return { ...next, cursor: { ...next.cursor, row, addingRow: false } }
    })
  }, [])

  const activateAt = useCallback(
    (
      field: FolderFieldKind,
      row: number,
      addingRow = false,
      subfield?: "key" | "value",
    ) => {
      if (field === "auth" && row === 0) return
      setOptionalTabMenuActive(false)
      setInactiveTab(field)
      const currentFolder = draftRef.current
      const kv = folderCurrentKeyValueFor(currentFolder, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
      setEditState((prev) => {
        const browsed =
          prev.mode === "inactive"
            ? enterFolderEditBrowse(prev, folderRowCount(currentFolder), field)
            : cancelEditing(prev)
        const next = beginEditing({
          ...browsed,
          mode: "browsing",
          editingRow: -1,
          cursor: { field, row, addingRow },
        })
        return subfield
          ? { ...next, cursor: { ...next.cursor, subfield } }
          : next
      })
    },
    [],
  )

  const toggleAt = useCallback(
    (field: FolderFieldKind, row: number) => {
      setOptionalTabMenuActive(false)
      setInactiveTab(field)
      setEditState((prev) => {
        const browsed =
          prev.mode === "inactive"
            ? enterFolderEditBrowse(
                prev,
                folderRowCount(draftRef.current),
                field,
              )
            : cancelEditing(prev)
        return {
          ...browsed,
          mode: "browsing",
          editingRow: -1,
          cursor: { field, row, addingRow: false },
        }
      })
      if (field === "headers" && row >= 0) draftMutators.toggleHeaderRow(row)
    },
    [draftMutators],
  )

  const enterAndEdit = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    const currentFolder = draftRef.current
    const tab = activeTab as FolderFieldKind
    const state = editStateRef.current
    if (state.mode !== "inactive") return

    const browsed = enterFolderEditBrowse(state, c, tab)
    if (browsed.cursor.field === "auth" && browsed.cursor.row === 0) {
      setEditState(browsed)
      return
    }
    if (browsed.cursor.field === "auth") {
      const init = folderCurrentValueFor(
        currentFolder,
        browsed.cursor.field as FolderFieldKind,
        browsed.cursor.row,
        false,
      )
      setEditValue(init)
      setEditState(beginEditing(browsed))
      return
    }

    const { field, row, addingRow } = browsed.cursor
    const kv = folderCurrentKeyValueFor(
      currentFolder,
      field as FolderFieldKind,
      row,
      addingRow,
    )
    setEditKey(kv.key)
    setEditValue(kv.value)
    setEditState(beginEditing(browsed))
  }, [activeTab])

  const exitBrowse = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return exitEditBrowse(prev)
    })
  }, [])

  const browseUp = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveFolderRowCursor(prev, -1, c)
    })
  }, [])

  const browseDown = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveFolderRowCursor(prev, +1, c)
    })
  }, [])

  const cycleInactiveTab = useCallback(
    (delta: 1 | -1) => {
      const current = tabNavigationRef.current
      const counts = folderRowCount(draftRef.current)
      const menuActive =
        optionalTabMenuVisible &&
        !current.menuActive &&
        ((current.tab === "activity" && delta === 1) ||
          (current.tab === "meta" && delta === -1))
      const tab = menuActive
        ? current.tab
        : current.menuActive
          ? delta === 1
            ? "meta"
            : "activity"
          : cycleFolderField(
              current.tab,
              delta,
              counts,
              revealedOptionalTabsRef.current,
            )
      // Advance buffered key events before React commits the next render.
      tabNavigationRef.current = { tab, menuActive }
      setInactiveTab(tab)
      setOptionalTabMenuActiveState(menuActive)
      setEditState((prev) => {
        if (prev.mode !== "browsing") return prev
        return menuActive
          ? exitEditBrowse(prev)
          : {
              ...prev,
              cursor: folderCursorForField(tab as FolderFieldKind, counts),
            }
      })
    },
    [optionalTabMenuVisible],
  )

  const browseLeft = useCallback(() => {
    if (editStateRef.current.mode === "browsing") cycleInactiveTab(-1)
  }, [cycleInactiveTab])

  const browseRight = useCallback(() => {
    if (editStateRef.current.mode === "browsing") cycleInactiveTab(1)
  }, [cycleInactiveTab])

  const enterEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, row } = state.cursor
    const currentFolder = draftRef.current
    if (field === "auth") {
      if (row === 0) return
      const auth = currentFolder?.overrides?.auth
      const definition = authFieldAtRow(auth, row)
      if (!definition || definition.kind === "select") return
      if (definition.kind === "boolean" && auth) {
        draftMutators.setAuthField(
          auth.type,
          definition.field,
          authValueAtRow(auth, row) !== "true",
        )
        return
      }
      const init = folderCurrentValueFor(currentFolder, "auth", row, false)
      setEditValue(init)
      setEditState((prev) => beginEditing(prev))
      return
    }
    const { addingRow } = state.cursor
    const kv = folderCurrentKeyValueFor(
      currentFolder,
      field as FolderFieldKind,
      row,
      addingRow,
    )
    setEditKey(kv.key)
    setEditValue(kv.value)
    setEditState((prev) => beginEditing(prev))
  }, [draftMutators.setAuthField])

  const commitEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "editing") return
    const { field, row } = state.cursor
    const addingRow = state.cursor.addingRow
    const val = editValueRef.current
    if (field === "meta") {
      draftMutators.setName(val)
    } else if (field === "auth") {
      const currentAuth = draftRef.current?.overrides?.auth
      const definition = authFieldAtRow(currentAuth, row)
      if (currentAuth && definition) {
        draftMutators.setAuthField(currentAuth.type, definition.field, val)
      }
    } else if (field === "headers") {
      const key = editKeyRef.current.trim()
      const value = editValueRef.current.trim()
      if (key === "") {
        if (!addingRow && row >= 0) {
          draftMutators.removeHeaderRow(row)
        }
      } else if (addingRow) {
        draftMutators.addHeaderRow(key, value)
      } else {
        draftMutators.setHeaderRow(row, key, value)
      }
    }
    setEditState((prev) => commitEditing(prev))
  }, [draftMutators])

  const cancelEdit = useCallback(() => {
    setEditKey("")
    setEditState((prev) => cancelEditing(prev))
  }, [])

  const browseTab = useCallback(() => {
    setEditState((prev) => toggleSubfield(prev))
  }, [])

  const revertFieldHandler = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, addingRow, row } = state.cursor
    if (addingRow) return
    const phase = scriptPhase(field)
    if (phase) {
      draftMutators.setScript(
        phase,
        scriptText(draftMutators.originalFolder ?? {}, phase),
      )
      return
    }
    if (field === "auth") {
      draftMutators.setAuthType("none")
      return
    }
    if (field === "headers") {
      draftMutators.removeHeaderRow(row)
    }
  }, [draftMutators])

  const revertAllHandler = useCallback(() => {
    draftMutators.revertAll()
  }, [draftMutators])

  const toggleRow = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, addingRow, row } = state.cursor
    if (addingRow) return
    if (field === "auth") {
      const auth = draftRef.current?.overrides?.auth
      const definition = authFieldAtRow(auth, row)
      if (auth && definition?.kind === "boolean") {
        draftMutators.setAuthField(
          auth.type,
          definition.field,
          authValueAtRow(auth, row) !== "true",
        )
      }
    } else if (field === "headers") draftMutators.toggleHeaderRow(row)
  }, [draftMutators])

  return useMemo(
    () => ({
      editState,
      editValue,
      setEditValue,
      editKey,
      setEditKey,
      isActive: editState.mode !== "inactive",
      activeTab,
      revealedOptionalTabs,
      revealOptionalTab,
      optionalTabMenuVisible,
      optionalTabMenuActive,
      setOptionalTabMenuActive,
      enterBrowse,
      enterBrowseAt,
      activateAt,
      toggleAt,
      exitBrowse,
      browseUp,
      browseDown,
      browseLeft,
      browseRight,
      enterAndEdit,
      enterEdit,
      commitEdit,
      cancelEdit,
      browseTab,
      revertField: revertFieldHandler,
      revertAll: revertAllHandler,
      toggleRow,
      cycleInactiveTab,
    }),
    [
      editState,
      editValue,
      editKey,
      activeTab,
      revealedOptionalTabs,
      revealOptionalTab,
      optionalTabMenuVisible,
      optionalTabMenuActive,
      setOptionalTabMenuActive,
      enterBrowse,
      enterBrowseAt,
      activateAt,
      toggleAt,
      exitBrowse,
      browseUp,
      browseDown,
      browseLeft,
      browseRight,
      enterAndEdit,
      enterEdit,
      commitEdit,
      cancelEdit,
      browseTab,
      revertFieldHandler,
      revertAllHandler,
      toggleRow,
      cycleInactiveTab,
    ],
  )
}
