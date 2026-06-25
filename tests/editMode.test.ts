import { describe, it, expect } from "bun:test"
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
} from "../src/ui/editMode"

const inactive: EditState = initialEditState()

describe("initialEditState", () => {
  it("starts inactive with headers cursor", () => {
    expect(initialEditState()).toEqual({
      mode: "inactive",
      cursor: { field: "headers", row: -1, addingRow: false },
      editingRow: -1,
    })
  })
})

describe("enterEditBrowse", () => {
  it("inactive → browsing at headers", () => {
    const s = enterEditBrowse(inactive)
    expect(s.mode).toBe("browsing")
    expect(s.cursor).toEqual({ field: "headers", row: -1, addingRow: false })
    expect(s.editingRow).toBe(-1)
  })
  it("no-op from browsing", () => {
    const browsing = enterEditBrowse(inactive)
    expect(enterEditBrowse(browsing)).toBe(browsing)
  })
  it("no-op from editing", () => {
    const editing = beginEditing(enterEditBrowse(inactive))
    expect(enterEditBrowse(editing)).toBe(editing)
  })
})

describe("exitEditBrowse", () => {
  it("browsing → inactive", () => {
    const browsing = enterEditBrowse(inactive)
    const s = exitEditBrowse(browsing)
    expect(s.mode).toBe("inactive")
  })
  it("no-op from editing (must cancel first)", () => {
    const editing = beginEditing(enterEditBrowse(inactive))
    expect(exitEditBrowse(editing)).toBe(editing)
  })
  it("no-op from inactive", () => {
    expect(exitEditBrowse(inactive)).toBe(inactive)
  })
})

describe("moveFieldCursor", () => {
  it("+1 walks headers → params → body → auth → headers", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("params")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(-1)
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(-1)
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("headers")
    expect(s.cursor.row).toBe(0)
  })
  it("-1 walks headers → auth → body → params → headers", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, -1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("auth")
    s = moveFieldCursor(s, -1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("body")
    s = moveFieldCursor(s, -1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("params")
    s = moveFieldCursor(s, -1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("headers")
  })
  it("+1 from headers (empty) lands on params [+] (addingRow true, row -1)", () => {
    let s = enterEditBrowse(inactive)
    expect(s.cursor.field).toBe("headers")
    s = moveFieldCursor(s, +1, { headers: 0, params: 0 })
    expect(s.cursor.field).toBe("params")
    expect(s.cursor.addingRow).toBe(true)
    expect(s.cursor.row).toBe(-1)
  })
  it("no-op when editing", () => {
    const editing = beginEditing(enterEditBrowse(inactive))
    expect(moveFieldCursor(editing, +1, { headers: 2, params: 1 })).toBe(
      editing,
    )
  })
})

describe("moveRowCursor", () => {
  it("walks rows -1 → 0 → 1 → [+] → wraps to 0 within headers", () => {
    let s = enterEditBrowse(inactive)
    expect(s.cursor.row).toBe(-1)
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    expect(s.cursor.addingRow).toBe(true)
    expect(s.cursor.row).toBe(-1)
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("walks up: -1 → [+] → 1 → 0", () => {
    let s = enterEditBrowse(inactive)
    expect(s.cursor.row).toBe(-1)
    s = moveRowCursor(s, -1, { headers: 2, params: 0 })
    expect(s.cursor.addingRow).toBe(true)
    s = moveRowCursor(s, -1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, -1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(0)
  })
  it("single-row section toggles -1 → 0 → [+] → 0", () => {
    let s = enterEditBrowse(inactive)
    expect(s.cursor.row).toBe(-1)
    s = moveRowCursor(s, +1, { headers: 1, params: 0 })
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, { headers: 1, params: 0 })
    expect(s.cursor.addingRow).toBe(true)
    s = moveRowCursor(s, +1, { headers: 1, params: 0 })
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("empty section is no-op (no rows to navigate)", () => {
    const s = enterEditBrowse(inactive)
    expect(moveRowCursor(s, +1, { headers: 0, params: 0 })).toBe(s)
    expect(moveRowCursor(s, -1, { headers: 0, params: 0 })).toBe(s)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("scalar field (body) is a no-op", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    s = moveFieldCursor(s, +1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("body")
    expect(moveRowCursor(s, +1, { headers: 2, params: 1 })).toBe(s)
  })
  it("no-op when editing", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 2, params: 0 })
    const editing = beginEditing(s)
    expect(moveRowCursor(editing, +1, { headers: 2, params: 0 })).toBe(editing)
  })
})

describe("beginEditing", () => {
  it("browsing → editing, captures editingRow for header row", () => {
    let s = enterEditBrowse(inactive)
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    s = moveRowCursor(s, +1, { headers: 2, params: 0 })
    expect(s.cursor.row).toBe(1)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(1)
  })
  it("browsing → editing, editingRow -1 for scalar field (headers empty)", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 0, params: 0 })
    expect(s.cursor.field).toBe("params")
    s = moveFieldCursor(s, +1, { headers: 0, params: 0 })
    expect(s.cursor.field).toBe("body")
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(-1)
  })
  it("no-op for auth (browse-only field)", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, -1, { headers: 2, params: 1 })
    expect(s.cursor.field).toBe("auth")
    expect(beginEditing(s)).toBe(s)
  })
  it("browsing → editing on [+] line keeps editingRow -1 (caller adds row)", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 0, params: 0 })
    expect(s.cursor.addingRow).toBe(true)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(-1)
  })
  it("no-op when inactive", () => {
    expect(beginEditing(inactive)).toBe(inactive)
  })
  it("no-op when already editing", () => {
    const editing = beginEditing(enterEditBrowse(inactive))
    expect(beginEditing(editing)).toBe(editing)
  })
})

describe("commitEditing", () => {
  it("editing → browsing, editingRow reset to -1", () => {
    const editing = beginEditing(enterEditBrowse(inactive))
    const s = commitEditing(editing)
    expect(s.mode).toBe("browsing")
    expect(s.editingRow).toBe(-1)
  })
  it("no-op when not editing", () => {
    expect(commitEditing(inactive)).toBe(inactive)
    const browsing = enterEditBrowse(inactive)
    expect(commitEditing(browsing)).toBe(browsing)
  })
})

describe("cancelEditing", () => {
  it("editing → browsing, editingRow reset to -1, cursor preserved", () => {
    let s = enterEditBrowse(inactive)
    s = moveFieldCursor(s, +1, { headers: 2, params: 0 })
    const editing = beginEditing(s)
    const cancelled = cancelEditing(editing)
    expect(cancelled.mode).toBe("browsing")
    expect(cancelled.editingRow).toBe(-1)
    expect(cancelled.cursor).toEqual(s.cursor)
  })
  it("no-op when not editing", () => {
    expect(cancelEditing(inactive)).toBe(inactive)
  })
})
