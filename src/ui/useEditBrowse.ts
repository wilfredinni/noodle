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
  if (field === "url") return draft.url
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

export interface UseEditBrowseResult {
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  isActive: boolean
}

export function useEditBrowse(
  draft: Request | null,
  draftMutators: UseRequestDraftResult,
  opts?: {
    enabled?: () => boolean
    onEnterEditBrowse?: () => void
    blocked?: () => boolean
    initialField?: () => FieldKind
  },
): UseEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialEditState())
  const [editValue, setEditValue] = useState("")

  const counts = rowCount(draft)

  const onCommit = useCallback(() => {
    if (editState.mode !== "editing") return
    const { field } = editState.cursor
    const addingRow = editState.cursor.addingRow
    if (field === "url") {
      draftMutators.setUrl(editValue)
    } else if (field === "body") {
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
    if (field === "url" || field === "body") {
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
        const initField = opts?.initialField?.() ?? "headers"
        setEditState((prev) => enterEditBrowse(prev, initField, counts))
        opts?.onEnterEditBrowse?.()
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
        if (editState.cursor.field === "auth") return
        const init = currentValueFor(
          draft,
          editState.cursor.field,
          editState.cursor.row,
          editState.cursor.addingRow,
        )
        setEditValue(init)
        setEditState((prev) => beginEditing(prev))
      } else if (key.name === "left") {
        setEditState((prev) => moveFieldCursor(prev, -1, counts))
      } else if (key.name === "right") {
        setEditState((prev) => moveFieldCursor(prev, +1, counts))
      } else if (key.name === "up") {
        setEditState((prev) => moveRowCursor(prev, -1, counts))
      } else if (key.name === "down") {
        setEditState((prev) => moveRowCursor(prev, +1, counts))
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
    }),
    [editState, editValue],
  )
}
