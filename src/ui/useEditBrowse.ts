import { useCallback, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
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
}

export function useEditBrowse(
  draft: Request | null,
  draftMutators: UseRequestDraftResult,
  opts?: {
    enabled?: () => boolean
    onEnterEditBrowse?: () => void
    blocked?: () => boolean
  },
): UseEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialEditState())
  const [editValue, setEditValue] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>("headers")

  const counts = rowCount(draft)

  const activeTab =
    editState.mode !== "inactive" ? editState.cursor.field : inactiveTab

  const onCommit = useCallback(() => {
    if (editState.mode !== "editing") return
    const { field } = editState.cursor
    const addingRow = editState.cursor.addingRow
    if (field === "body") {
      draftMutators.setBody(editValue)
    } else if (field === "headers" || field === "params") {
      const parsed = parseRow(editValue)
      if (parsed.key === "") {
        if (!addingRow && editState.cursor.row >= 0) {
          if (field === "headers")
            draftMutators.removeHeaderRow(editState.cursor.row)
          else draftMutators.removeParamRow(editState.cursor.row)
        }
      } else if (addingRow) {
        if (field === "headers")
          draftMutators.addHeaderRow(parsed.key, parsed.value)
        else draftMutators.addParamRow(parsed.key, parsed.value)
      } else {
        if (field === "headers")
          draftMutators.setHeaderRow(
            editState.cursor.row,
            parsed.key,
            parsed.value,
          )
        else
          draftMutators.setParamRow(
            editState.cursor.row,
            parsed.key,
            parsed.value,
          )
      }
    }
    setEditState((prev) => commitEditing(prev))
  }, [editState, editValue, draftMutators])

  const onCancel = useCallback(() => {
    setEditState((prev) => cancelEditing(prev))
  }, [])

  const onRevertField = useCallback(() => {
    if (editState.mode !== "browsing") return
    const { field, addingRow, row } = editState.cursor
    if (field === "body") {
      draftMutators.revertField(field)
    } else if (field === "headers" || field === "params") {
      if (addingRow) return
      if (field === "headers") draftMutators.removeHeaderRow(row)
      else draftMutators.removeParamRow(row)
    }
  }, [editState, draftMutators])

  useKeyboard((key) => {
    if (opts?.blocked?.()) return
    const enabled = opts?.enabled ?? (() => true)

    if (editState.mode === "inactive") {
      if (key.name === "e") {
        setEditState((prev) => enterEditBrowse(prev))
        opts?.onEnterEditBrowse?.()
      } else if (key.name === "left" && enabled()) {
        setInactiveTab((prev) => cycleField(prev, -1))
      } else if (key.name === "right" && enabled()) {
        setInactiveTab((prev) => cycleField(prev, +1))
      }
      return
    }

    if (!enabled()) return

    if (editState.mode === "editing") {
      if (key.name === "return") {
        onCommit()
      } else if (key.name === "escape") {
        onCancel()
      }
      return
    }
    if (editState.mode === "browsing") {
      if (key.name === "escape") {
        setEditState((prev) => exitEditBrowse(prev))
      } else if (key.name === "e" || key.name === "return") {
        const init = currentValueFor(
          draft,
          editState.cursor.field,
          editState.cursor.row,
          editState.cursor.addingRow,
        )
        setEditValue(init)
        setEditState((prev) => beginEditing(prev))
      } else if (key.name === "up") {
        setEditState((prev) => moveRowCursor(prev, -1, counts))
      } else if (key.name === "down") {
        setEditState((prev) => moveRowCursor(prev, +1, counts))
      } else if (key.name === "left") {
        setEditState((prev) => moveFieldCursor(prev, -1, counts))
      } else if (key.name === "right") {
        setEditState((prev) => moveFieldCursor(prev, +1, counts))
      } else if (key.name === "d") {
        onRevertField()
      } else if (key.name === "R" || (key.shift && key.name === "r")) {
        draftMutators.revertAll()
      }
    }
  })

  return useMemo(
    () => ({
      editState,
      editValue,
      setEditValue,
      isActive: editState.mode !== "inactive",
      activeTab,
    }),
    [editState, editValue, activeTab],
  )
}
