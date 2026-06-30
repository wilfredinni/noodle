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
  toggleSubfield,
  type EditState,
} from "../src/ui/editMode"

const inactive: EditState = initialEditState()

function c(headers: number, params: number) {
  return { headers, params, body: 0, auth: 0, settings: 3 }
}

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
    const s = enterEditBrowse(inactive, c(2, 0))
    expect(s.mode).toBe("browsing")
    expect(s.cursor).toEqual({ field: "headers", row: 0, addingRow: false })
    expect(s.editingRow).toBe(-1)
  })
  it("inactive → browsing at explicit start field", () => {
    const s = enterEditBrowse(inactive, c(2, 3), "params")
    expect(s.mode).toBe("browsing")
    expect(s.cursor).toEqual({ field: "params", row: 0, addingRow: false })
    expect(s.editingRow).toBe(-1)
  })
  it("no-op from browsing", () => {
    const browsing = enterEditBrowse(inactive, c(2, 0))
    expect(enterEditBrowse(browsing)).toBe(browsing)
  })
  it("no-op from editing", () => {
    const editing = beginEditing(
      enterEditBrowse(inactive, c(2, 0)),
    )
    expect(enterEditBrowse(editing)).toBe(editing)
  })
})

describe("exitEditBrowse", () => {
  it("browsing → inactive", () => {
    const browsing = enterEditBrowse(inactive, c(2, 0))
    const s = exitEditBrowse(browsing)
    expect(s.mode).toBe("inactive")
  })
  it("no-op from editing (must cancel first)", () => {
    const editing = beginEditing(
      enterEditBrowse(inactive, c(2, 0)),
    )
    expect(exitEditBrowse(editing)).toBe(editing)
  })
  it("no-op from inactive", () => {
    expect(exitEditBrowse(inactive)).toBe(inactive)
  })
})

describe("moveFieldCursor", () => {
  it("+1 walks headers → params → body → auth → settings → headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("params")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(-1)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(-1)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("settings")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("headers")
    expect(s.cursor.row).toBe(0)
  })
  it("-1 walks headers → settings → auth → body → params → headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("settings")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("auth")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("body")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("params")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("headers")
  })
  it("+1 from headers (empty) lands on params [+] (addingRow true, row -1)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    expect(s.cursor.field).toBe("headers")
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("params")
    expect(s.cursor.addingRow).toBe(true)
    expect(s.cursor.row).toBe(-1)
  })
  it("no-op when editing", () => {
    const editing = beginEditing(
      enterEditBrowse(inactive, c(2, 0)),
    )
    expect(moveFieldCursor(editing, +1, c(2, 1))).toBe(
      editing,
    )
  })
})

describe("moveRowCursor", () => {
  it("walks rows 0 → 1 → [+] → 0 → 1 within headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, c(2, 0))
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, c(2, 0))
    expect(s.cursor.addingRow).toBe(true)
    expect(s.cursor.row).toBe(-1)
    s = moveRowCursor(s, +1, c(2, 0))
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
    s = moveRowCursor(s, +1, c(2, 0))
    expect(s.cursor.row).toBe(1)
  })
  it("walks up: 0 → [+] → 1 → 0", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, -1, c(2, 0))
    expect(s.cursor.addingRow).toBe(true)
    s = moveRowCursor(s, -1, c(2, 0))
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, -1, c(2, 0))
    expect(s.cursor.row).toBe(0)
  })
  it("single-row section toggles 0 → [+] → 0", () => {
    let s = enterEditBrowse(inactive, c(1, 0))
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, c(1, 0))
    expect(s.cursor.addingRow).toBe(true)
    s = moveRowCursor(s, +1, c(1, 0))
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("empty section is no-op (no rows to navigate)", () => {
    const s = enterEditBrowse(inactive, c(0, 0))
    expect(moveRowCursor(s, +1, c(0, 0))).toBe(s)
    expect(moveRowCursor(s, -1, c(0, 0))).toBe(s)
    expect(s.cursor.addingRow).toBe(true)
  })
  it("scalar field (body) is a no-op", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 1))
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("body")
    expect(moveRowCursor(s, +1, c(2, 1))).toBe(s)
  })
  it("no-op when editing", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    expect(moveRowCursor(editing, +1, c(2, 0))).toBe(editing)
  })
})

describe("beginEditing", () => {
  it("browsing → editing, captures editingRow for header row", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveRowCursor(s, +1, c(2, 0))
    expect(s.cursor.row).toBe(1)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(1)
  })
  it("browsing → editing, editingRow -1 for scalar field (headers empty)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("params")
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("body")
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(-1)
  })
  it("no-op for auth (browse-only field)", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, -1, c(2, 1))
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("auth")
    expect(beginEditing(s)).toBe(s)
  })
  it("browsing → editing on [+] line keeps editingRow -1 (caller adds row)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.addingRow).toBe(true)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(-1)
  })
  it("no-op when inactive", () => {
    expect(beginEditing(inactive)).toBe(inactive)
  })
  it("no-op when already editing", () => {
    const editing = beginEditing(
      enterEditBrowse(inactive, c(2, 0)),
    )
    expect(beginEditing(editing)).toBe(editing)
  })

  it("sets subfield to 'key' for headers row", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveRowCursor(s, +1, c(2, 0))
    const e = beginEditing(s)
    expect(e.cursor.subfield).toBe("key")
  })

  it("sets subfield to 'key' for params row", () => {
    let s = enterEditBrowse(inactive, c(0, 2))
    s = moveFieldCursor(s, +1, c(0, 2))
    s = moveRowCursor(s, +1, c(0, 2))
    expect(s.cursor.field).toBe("params")
    const e = beginEditing(s)
    expect(e.cursor.subfield).toBe("key")
  })

  it("does not set subfield for body (scalar)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("body")
    const e = beginEditing(s)
    expect(e.cursor.subfield).toBeUndefined()
  })
})

describe("commitEditing", () => {
  it("editing → browsing, editingRow reset to -1", () => {
    const editing = beginEditing(
      enterEditBrowse(inactive, c(2, 0)),
    )
    const s = commitEditing(editing)
    expect(s.mode).toBe("browsing")
    expect(s.editingRow).toBe(-1)
  })
  it("no-op when not editing", () => {
    expect(commitEditing(inactive)).toBe(inactive)
    const browsing = enterEditBrowse(inactive, c(2, 0))
    expect(commitEditing(browsing)).toBe(browsing)
  })

  it("clears subfield after commit", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveRowCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    expect(editing.cursor.subfield).toBe("key")
    const committed = commitEditing(editing)
    expect(committed.cursor.subfield).toBeUndefined()
  })
})

describe("cancelEditing", () => {
  it("editing → browsing, editingRow reset to -1, cursor preserved", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    const cancelled = cancelEditing(editing)
    expect(cancelled.mode).toBe("browsing")
    expect(cancelled.editingRow).toBe(-1)
    expect(cancelled.cursor).toEqual(s.cursor)
  })
  it("no-op when not editing", () => {
    expect(cancelEditing(inactive)).toBe(inactive)
  })

  it("clears subfield after cancel", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveRowCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    const cancelled = cancelEditing(editing)
    expect(cancelled.cursor.subfield).toBeUndefined()
  })
})

describe("toggleSubfield", () => {
  it("toggles key → value in edit mode for headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveRowCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    expect(editing.cursor.subfield).toBe("key")
    const toggled = toggleSubfield(editing)
    expect(toggled.cursor.subfield).toBe("value")
    const back = toggleSubfield(toggled)
    expect(back.cursor.subfield).toBe("key")
  })

  it("toggles key → value for params", () => {
    let s = enterEditBrowse(inactive, c(0, 1))
    expect(s.cursor.field).toBe("headers")
    s = moveFieldCursor(s, +1, c(0, 1))
    expect(s.cursor.field).toBe("params")
    const editing = beginEditing(s)
    expect(editing.cursor.subfield).toBe("key")
    expect(toggleSubfield(editing).cursor.subfield).toBe("value")
  })

  it("no-op when not in edit mode", () => {
    const browsing = enterEditBrowse(inactive, c(2, 0))
    expect(toggleSubfield(browsing)).toBe(browsing)
  })

  it("no-op for body field (no subfield)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("body")
    const editing = beginEditing(s)
    expect(editing.cursor.subfield).toBeUndefined()
    expect(toggleSubfield(editing)).toBe(editing)
  })

  it("no-op for auth field (cannot enter edit)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    expect(s.cursor.field).toBe("auth")
    expect(toggleSubfield(s)).toBe(s)
  })
})

describe("moveRowCursor — settings", () => {
  it("walks settings rows 0 → 1 → 2 → clamped at 2", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    expect(s.cursor.field).toBe("settings")
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.row).toBe(2)
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.row).toBe(2)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("walks settings rows up: 0 → clamped → 2 → 1 → 0", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, -1, c(0, 0))
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, c(0, 0))
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.row).toBe(2)
    s = moveRowCursor(s, -1, c(0, 0))
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, -1, c(0, 0))
    expect(s.cursor.row).toBe(0)
  })
  it("settings has no addingRow state", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    expect(s.cursor.addingRow).toBe(false)
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.addingRow).toBe(false)
    s = moveRowCursor(s, +1, c(0, 0))
    expect(s.cursor.addingRow).toBe(false)
  })
})
