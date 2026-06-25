export type FieldKind = "headers" | "params" | "body"
export type Mode = "inactive" | "browsing" | "editing"

export interface FieldCursor {
  field: FieldKind
  row: number
  addingRow: boolean
}

export interface EditState {
  mode: Mode
  cursor: FieldCursor
  editingRow: number
}

export interface SectionRowCount {
  headers: number
  params: number
}

const FIELD_ORDER: FieldKind[] = ["headers", "params", "body"]

export function initialEditState(): EditState {
  return {
    mode: "inactive",
    cursor: { field: "headers", row: -1, addingRow: false },
    editingRow: -1,
  }
}

export function enterEditBrowse(prev: EditState): EditState {
  if (prev.mode !== "inactive") return prev
  return {
    mode: "browsing",
    cursor: { field: "headers", row: -1, addingRow: false },
    editingRow: -1,
  }
}

export function exitEditBrowse(prev: EditState): EditState {
  if (prev.mode !== "browsing") return prev
  return { ...prev, mode: "inactive" }
}

function fieldIndex(field: FieldKind): number {
  return FIELD_ORDER.indexOf(field)
}

function cursorForField(
  field: FieldKind,
  counts: SectionRowCount,
): FieldCursor {
  if (field === "body") {
    return { field, row: -1, addingRow: false }
  }
  const count = field === "headers" ? counts.headers : counts.params
  if (count === 0) {
    return { field, row: -1, addingRow: true }
  }
  return { field, row: 0, addingRow: false }
}

export function moveFieldCursor(
  prev: EditState,
  delta: 1 | -1,
  counts: SectionRowCount,
): EditState {
  if (prev.mode !== "browsing") return prev
  const idx = fieldIndex(prev.cursor.field)
  const nextIdx = (idx + delta + FIELD_ORDER.length) % FIELD_ORDER.length
  const nextField = FIELD_ORDER[nextIdx]!
  return {
    ...prev,
    cursor: cursorForField(nextField, counts),
  }
}

export function moveRowCursor(
  prev: EditState,
  delta: 1 | -1,
  counts: SectionRowCount,
): EditState {
  if (prev.mode !== "browsing") return prev
  const { field } = prev.cursor
  if (field !== "headers" && field !== "params") return prev
  const count = field === "headers" ? counts.headers : counts.params
  if (count === 0) return prev

  if (prev.cursor.addingRow) {
    return {
      ...prev,
      cursor: { field, row: delta > 0 ? 0 : count - 1, addingRow: false },
    }
  }

  const row = prev.cursor.row
  const next = row + delta
  if (next < 0) {
    return { ...prev, cursor: { field, row: -1, addingRow: true } }
  }
  if (next > count - 1) {
    return { ...prev, cursor: { field, row: -1, addingRow: true } }
  }
  return { ...prev, cursor: { field, row: next, addingRow: false } }
}

export function beginEditing(prev: EditState): EditState {
  if (prev.mode !== "browsing") return prev
  return {
    ...prev,
    mode: "editing",
    editingRow: prev.cursor.addingRow ? -1 : prev.cursor.row,
  }
}

export function commitEditing(prev: EditState): EditState {
  if (prev.mode !== "editing") return prev
  return { ...prev, mode: "browsing", editingRow: -1 }
}

export function cancelEditing(prev: EditState): EditState {
  if (prev.mode !== "editing") return prev
  return { ...prev, mode: "browsing", editingRow: -1 }
}
