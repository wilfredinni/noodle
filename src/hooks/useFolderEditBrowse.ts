import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Folder } from "../schema"
import {
  initialFolderEditState,
  enterFolderEditBrowse,
  exitEditBrowse,
  moveFolderFieldCursor,
  moveFolderRowCursor,
  beginEditing,
  commitEditing,
  cancelEditing,
  toggleSubfield,
  FOLDER_FIELD_ORDER,
  type EditState,
  type FolderRowCount,
  type FolderFieldKind,
  type FieldKind,
} from "../ui/editMode"
import type { UseFolderDraftResult } from "./useFolderDraft"

const FIELD_ORDER: FolderFieldKind[] = FOLDER_FIELD_ORDER

export type { FolderFieldKind }

export interface UseFolderEditBrowseResult {
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  editKey: string
  setEditKey: (v: string) => void
  isActive: boolean
  activeTab: FieldKind
  enterBrowse: () => void
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
}

export interface UseFolderEditBrowseOptions {
  initialTab?: FieldKind
  onTabChange?: (tab: FieldKind) => void
}

function folderRowCount(folder: Folder | null): FolderRowCount {
  if (!folder) return { meta: 1, headers: 0, auth: 1 }
  let authRows = 1
  const a = folder.overrides?.auth
  if (a) {
    if (a.type === "bearer") authRows = 2
    else if (a.type === "basic") authRows = 3
    else if (a.type === "api_key") authRows = 4
  }
  return {
    meta: 1,
    headers: Object.keys(folder.overrides?.headers ?? {}).length,

    auth: authRows,
  }
}

function folderCurrentValueFor(
  folder: Folder | null,
  field: FolderFieldKind,
  row: number,
  addingRow: boolean,
): string {
  if (!folder) return ""
  if (field === "meta") {
    if (row === 0) return folder.name ?? ""
    return ""
  }
  if (field === "auth") {
    const a = folder.overrides?.auth
    if (!a || a.type === "none") return ""
    if (a.type === "bearer") {
      if (row === 0) return ""
      if (row === 1) return a.token
    }
    if (a.type === "basic") {
      if (row === 0) return ""
      if (row === 1) return a.user
      if (row === 2) return a.pass
    }
    if (a.type === "api_key") {
      if (row === 0) return ""
      if (row === 1) return a.key
      if (row === 2) return a.value
      if (row === 3) return a.placement
    }
    return ""
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

function cycleField(current: FieldKind, delta: 1 | -1): FieldKind {
  const idx = FIELD_ORDER.indexOf(current as FolderFieldKind)
  if (idx === -1) return current
  const next = (idx + delta + FIELD_ORDER.length) % FIELD_ORDER.length
  return FIELD_ORDER[next]!
}

export function useFolderEditBrowse(
  folder: Folder | null,
  draftMutators: UseFolderDraftResult,
  options?: UseFolderEditBrowseOptions,
): UseFolderEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialFolderEditState())
  const [editValue, setEditValue] = useState("")
  const [editKey, setEditKey] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>(
    options?.initialTab ?? "meta",
  )

  const draftRef = useRef(folder)
  draftRef.current = folder

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
  }, [options?.initialTab])

  const isFirstTabChange = useRef(true)
  useEffect(() => {
    if (isFirstTabChange.current) {
      isFirstTabChange.current = false
      return
    }
    onTabChangeRef.current?.(inactiveTab)
  }, [inactiveTab])

  const activeTab: FieldKind =
    editState.mode !== "inactive"
      ? editState.cursor.field
      : (options?.initialTab ?? inactiveTab)

  const enterBrowse = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    const tab = activeTab as FolderFieldKind
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      return enterFolderEditBrowse(prev, c, tab)
    })
  }, [activeTab])

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

  const browseLeft = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const next = moveFolderFieldCursor(prev, -1, c)
      setInactiveTab(next.cursor.field)
      return next
    })
  }, [])

  const browseRight = useCallback(() => {
    const c = folderRowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const next = moveFolderFieldCursor(prev, +1, c)
      setInactiveTab(next.cursor.field)
      return next
    })
  }, [])

  const enterEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, row } = state.cursor
    const currentFolder = draftRef.current
    if (field === "auth") {
      if (row === 0) return
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
  }, [])

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
      if (currentAuth) {
        if (currentAuth.type === "bearer" && row === 1) {
          draftMutators.setAuthField("bearer", "token", val)
        } else if (currentAuth.type === "basic") {
          if (row === 1) draftMutators.setAuthField("basic", "user", val)
          else if (row === 2) draftMutators.setAuthField("basic", "pass", val)
        } else if (currentAuth.type === "api_key") {
          if (row === 1) draftMutators.setAuthField("api_key", "key", val)
          else if (row === 2)
            draftMutators.setAuthField("api_key", "value", val)
        }
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
    if (field === "headers") draftMutators.toggleHeaderRow(row)
  }, [draftMutators])

  const cycleInactiveTab = useCallback((delta: 1 | -1) => {
    setInactiveTab((prev) => cycleField(prev, delta))
  }, [])

  return useMemo(
    () => ({
      editState,
      editValue,
      setEditValue,
      editKey,
      setEditKey,
      isActive: editState.mode !== "inactive",
      activeTab,
      enterBrowse,
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
      enterBrowse,
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
