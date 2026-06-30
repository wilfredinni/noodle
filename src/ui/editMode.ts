export type FieldKind = "headers" | "params" | "body" | "auth" | "settings"
export type Mode = "inactive" | "browsing" | "editing"

export interface FieldCursor {
  field: FieldKind
  row: number
  addingRow: boolean
  subfield?: "key" | "value"
}

export interface EditState {
  mode: Mode
  cursor: FieldCursor
  editingRow: number
}

export interface SectionRowCount {
  headers: number
  params: number
  body: number
  auth: number
  settings: number
}

const FIELD_ORDER: FieldKind[] = [
  "headers",
  "params",
  "body",
  "auth",
  "settings",
]

export function initialEditState(): EditState {
  return {
    mode: "inactive",
    cursor: { field: "headers", row: -1, addingRow: false },
    editingRow: -1,
  }
}

export function enterEditBrowse(
  prev: EditState,
  counts: SectionRowCount = { headers: 0, params: 0, body: 0, auth: 0, settings: 0 },
  startField: FieldKind = "headers",
): EditState {
  if (prev.mode !== "inactive") return prev
  return {
    mode: "browsing",
    cursor: cursorForField(startField, counts),
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
  switch (field) {
    case "body":
      return { field, row: -1, addingRow: false }
    case "auth":
      return { field, row: 0, addingRow: false }
    case "settings":
      return { field, row: 0, addingRow: false }
  }
  const count = field === "headers" ? counts.headers : counts.params
  if (count === 0) {
    return { field, row: -1, addingRow: true }
  }
  return { field, row: 0, addingRow: false }
}

export function toggleSubfield(prev: EditState): EditState {
  if (prev.mode !== "editing") return prev
  const { field } = prev.cursor
  if (field !== "headers" && field !== "params") return prev
  const current = prev.cursor.subfield ?? "key"
  const next: "key" | "value" = current === "key" ? "value" : "key"
  return {
    ...prev,
    cursor: { ...prev.cursor, subfield: next },
  }
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
  if (field !== "headers" && field !== "params" && field !== "settings" && field !== "auth") return prev
  let count = 0
  if (field === "headers") count = counts.headers
  else if (field === "params") count = counts.params
  else if (field === "settings") count = counts.settings
  else if (field === "auth") count = counts.auth
  
  if (count === 0) return prev

  if (prev.cursor.addingRow) {
    return {
      ...prev,
      cursor: { field, row: delta > 0 ? 0 : count - 1, addingRow: false },
    }
  }

  const row = prev.cursor.row
  const next = row + delta
  
  if (field === "settings" || field === "auth") {
    // settings has no addingRow state, clamp to bounds
    if (next < 0) return { ...prev, cursor: { field, row: 0, addingRow: false } }
    if (next > count - 1) return { ...prev, cursor: { field, row: count - 1, addingRow: false } }
    return { ...prev, cursor: { field, row: next, addingRow: false } }
  }

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
  if (prev.cursor.field === "settings" && prev.cursor.row === 1) return prev
  const subfield: "key" | "value" | undefined =
    prev.cursor.field === "headers" || prev.cursor.field === "params"
      ? "key"
      : undefined
  return {
    ...prev,
    mode: "editing",
    editingRow: prev.cursor.addingRow ? -1 : prev.cursor.row,
    cursor: { ...prev.cursor, subfield },
  }
}

export function commitEditing(prev: EditState): EditState {
  if (prev.mode !== "editing") return prev
  return {
    ...prev,
    mode: "browsing",
    editingRow: -1,
    cursor: { ...prev.cursor, subfield: undefined },
  }
}

export function cancelEditing(prev: EditState): EditState {
  if (prev.mode !== "editing") return prev
  return {
    ...prev,
    mode: "browsing",
    editingRow: -1,
    cursor: { ...prev.cursor, subfield: undefined },
  }
}
