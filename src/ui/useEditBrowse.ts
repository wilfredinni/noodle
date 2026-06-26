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
  type EditState,
  type SectionRowCount,
  type FieldKind,
} from "./editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"
import { parseRow } from "./useRequestDraft"

const FIELD_ORDER: FieldKind[] = ["headers", "params", "body", "auth"]

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
  if (field === "headers" || field === "params") {
    if (addingRow) return ""
    const rec = field === "headers" ? draft.headers : draft.params
    const entries = Object.entries(rec).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    const entry = entries[row]
    return entry ? `${entry[0]}: ${entry[1]}` : ""
  }
  return ""
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
  isActive: boolean
  activeTab: FieldKind
  enterBrowse: () => void
  exitBrowse: () => void
  browseUp: () => void
  browseDown: () => void
  browseLeft: () => void
  browseRight: () => void
  enterEdit: () => void
  commitEdit: () => void
  cancelEdit: () => void
  revertField: () => void
  revertAll: () => void
  cycleInactiveTab: (delta: 1 | -1) => void
}

export function useEditBrowse(
  draft: Request | null,
  draftMutators: UseRequestDraftResult,
): UseEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialEditState())
  const [editValue, setEditValue] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>("headers")

  const draftRef = useRef(draft)
  draftRef.current = draft

  const editStateRef = useRef(editState)
  editStateRef.current = editState

  const editValueRef = useRef(editValue)
  editValueRef.current = editValue

  const activeTab =
    editState.mode !== "inactive" ? editState.cursor.field : inactiveTab

  const enterBrowse = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      return enterEditBrowse(prev, c)
    })
  }, [])

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
      return moveFieldCursor(prev, -1, c)
    })
  }, [])

  const browseRight = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveFieldCursor(prev, +1, c)
    })
  }, [])

  const enterEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const currentDraft = draftRef.current
    const init = currentValueFor(
      currentDraft,
      state.cursor.field,
      state.cursor.row,
      state.cursor.addingRow,
    )
    setEditValue(init)
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
    } else if (field === "headers" || field === "params") {
      const parsed = parseRow(val)
      if (parsed.key === "") {
        if (!addingRow && state.cursor.row >= 0) {
          if (field === "headers")
            draftMutators.removeHeaderRow(state.cursor.row)
          else draftMutators.removeParamRow(state.cursor.row)
        }
      } else if (addingRow) {
        if (field === "headers")
          draftMutators.addHeaderRow(parsed.key, parsed.value)
        else draftMutators.addParamRow(parsed.key, parsed.value)
      } else {
        if (field === "headers")
          draftMutators.setHeaderRow(
            state.cursor.row,
            parsed.key,
            parsed.value,
          )
        else
          draftMutators.setParamRow(
            state.cursor.row,
            parsed.key,
            parsed.value,
          )
      }
    }
    setEditState((prev) => commitEditing(prev))
  }, [draftMutators])

  const cancelEdit = useCallback(() => {
    setEditState((prev) => cancelEditing(prev))
  }, [])

  const revertFieldHandler = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, addingRow, row } = state.cursor
    if (field === "body") {
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

  const cycleInactiveTab = useCallback((delta: 1 | -1) => {
    setInactiveTab((prev) => cycleField(prev, delta))
  }, [])

  return useMemo(
    () => ({
      editState,
      editValue,
      setEditValue,
      isActive: editState.mode !== "inactive",
      activeTab,
      enterBrowse,
      exitBrowse,
      browseUp,
      browseDown,
      browseLeft,
      browseRight,
      enterEdit,
      commitEdit,
      cancelEdit,
      revertField: revertFieldHandler,
      revertAll: revertAllHandler,
      cycleInactiveTab,
    }),
    [
      editState,
      editValue,
      activeTab,
      enterBrowse,
      exitBrowse,
      browseUp,
      browseDown,
      browseLeft,
      browseRight,
      enterEdit,
      commitEdit,
      cancelEdit,
      revertFieldHandler,
      revertAllHandler,
      cycleInactiveTab,
    ],
  )
}
