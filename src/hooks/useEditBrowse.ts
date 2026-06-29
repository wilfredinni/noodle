import { useCallback, useMemo, useRef, useState } from "react"
import type { Request } from "../schema"
import {
  initialEditState,
  enterEditBrowse,
  exitEditBrowse,
  moveFieldCursor,
  moveRowCursor,
  beginEditing,
  commitEditing,
  cancelEditing,
  toggleSubfield,
  type EditState,
  type SectionRowCount,
  type FieldKind,
} from "../ui/editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"

const FIELD_ORDER: FieldKind[] = [
  "headers",
  "params",
  "body",
  "auth",
  "settings",
]

function rowCount(req: Request | null): SectionRowCount {
  if (!req) return { headers: 0, params: 0 }
  return {
    headers: Object.keys(req.headers).length,
    params: Object.keys(req.params).length,
  }
}

function currentValueFor(
  draft: Request | null,
  field: FieldKind,
  row: number,
  addingRow: boolean,
): string {
  if (!draft) return ""
  if (field === "body") return draft.body ?? ""
  if (field === "settings") return String(draft.timeout)
  if (field === "headers" || field === "params") {
    if (addingRow) return ""
    const rec = field === "headers" ? draft.headers : draft.params
    const entries = Object.entries(rec)
    const entry = entries[row]
    return entry ? `${entry[0]}: ${entry[1].value}` : ""
  }
  return ""
}

function currentKeyValueFor(
  draft: Request | null,
  field: FieldKind,
  row: number,
  addingRow: boolean,
): { key: string; value: string } {
  if (!draft) return { key: "", value: "" }
  if (addingRow) return { key: "", value: "" }
  if (field === "headers" || field === "params") {
    const rec = field === "headers" ? draft.headers : draft.params
    const entries = Object.entries(rec)
    const entry = entries[row]
    return entry
      ? { key: entry[0], value: entry[1].value }
      : { key: "", value: "" }
  }
  if (field === "settings") return { key: "", value: String(draft.timeout) }
  return { key: "", value: "" }
}

function cycleField(current: FieldKind, delta: 1 | -1): FieldKind {
  const idx = FIELD_ORDER.indexOf(current)
  const next = (idx + delta + FIELD_ORDER.length) % FIELD_ORDER.length
  return FIELD_ORDER[next]!
}

export interface UseEditBrowseResult {
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

export function useEditBrowse(
  draft: Request | null,
  draftMutators: UseRequestDraftResult,
): UseEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialEditState())
  const [editValue, setEditValue] = useState("")
  const [editKey, setEditKey] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>("headers")

  const draftRef = useRef(draft)
  draftRef.current = draft

  const editStateRef = useRef(editState)
  editStateRef.current = editState

  const editValueRef = useRef(editValue)
  editValueRef.current = editValue

  const editKeyRef = useRef(editKey)
  editKeyRef.current = editKey

  const activeTab =
    editState.mode !== "inactive" ? editState.cursor.field : inactiveTab

  const enterBrowse = useCallback(() => {
    const c = rowCount(draftRef.current)
    const tab = activeTab
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      return enterEditBrowse(prev, c, tab)
    })
  }, [activeTab])

  const enterAndEdit = useCallback(() => {
    const c = rowCount(draftRef.current)
    const currentDraft = draftRef.current
    const tab = activeTab
    const state = editStateRef.current
    if (state.mode !== "inactive") return

    const browsed = enterEditBrowse(state, c, tab)
    if (browsed.cursor.field === "auth") {
      setEditState(browsed)
      return
    }

    const { field, row, addingRow } = browsed.cursor
    if (field === "body" || field === "settings") {
      const init = currentValueFor(currentDraft, field, row, addingRow)
      setEditValue(init)
    } else if (field === "headers" || field === "params") {
      const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
    }

    setEditState(beginEditing(browsed))
  }, [activeTab])

  const exitBrowse = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return exitEditBrowse(prev)
    })
  }, [])

  const browseUp = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveRowCursor(prev, -1, c)
    })
  }, [])

  const browseDown = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveRowCursor(prev, +1, c)
    })
  }, [])

  const browseLeft = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const next = moveFieldCursor(prev, -1, c)
      setInactiveTab(next.cursor.field)
      return next
    })
  }, [])

  const browseRight = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      const next = moveFieldCursor(prev, +1, c)
      setInactiveTab(next.cursor.field)
      return next
    })
  }, [])

  const enterEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const currentDraft = draftRef.current
    const { field, row, addingRow } = state.cursor
    if (field === "body" || field === "settings") {
      const init = currentValueFor(currentDraft, field, row, addingRow)
      setEditValue(init)
    } else if (field === "headers" || field === "params") {
      const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
    }
    setEditState((prev) => beginEditing(prev))
  }, [])

  const commitEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "editing") return
    const { field } = state.cursor
    const addingRow = state.cursor.addingRow
    const val = editValueRef.current
    if (field === "body") {
      draftMutators.setBody(val)
    } else if (field === "settings") {
      draftMutators.setTimeout(Number(val) || 0)
    } else if (field === "headers" || field === "params") {
      const key = editKeyRef.current.trim()
      const value = editValueRef.current.trim()
      if (key === "") {
        if (!addingRow && state.cursor.row >= 0) {
          if (field === "headers")
            draftMutators.removeHeaderRow(state.cursor.row)
          else draftMutators.removeParamRow(state.cursor.row)
        }
      } else if (addingRow) {
        if (field === "headers") draftMutators.addHeaderRow(key, value)
        else draftMutators.addParamRow(key, value)
      } else {
        if (field === "headers")
          draftMutators.setHeaderRow(state.cursor.row, key, value)
        else draftMutators.setParamRow(state.cursor.row, key, value)
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
    if (field === "body" || field === "settings") {
      draftMutators.revertField(field)
    } else if (field === "headers" || field === "params") {
      if (addingRow) return
      if (field === "headers") draftMutators.removeHeaderRow(row)
      else draftMutators.removeParamRow(row)
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
    else if (field === "params") draftMutators.toggleParamRow(row)
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
