import { describe, it, expect } from "bun:test"
import {
  initialEditState,
  enterEditBrowse,
  exitEditBrowse,
  moveFieldCursor,
  moveRowCursor,
  moveRowFirst,
  moveRowLast,
  beginEditing,
  commitEditing,
  cancelEditing,
  toggleSubfield,
  type EditState,
} from "../src/ui/editMode"
import { applyDraft } from "../src/hooks/useRequestDraft"
import { detectFormType } from "../src/hooks/useEditBrowse"
import type { Request } from "../src/schema"

const inactive: EditState = initialEditState()

function c(headers: number, params: number) {
  return {
    headers,
    params,
    pathParams: 0,
    body: 0,
    auth: 0,
    assertions: 0,
    captures: 0,
    settings: 3,
  }
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
    const editing = beginEditing(enterEditBrowse(inactive, c(2, 0)))
    expect(enterEditBrowse(editing)).toBe(editing)
  })
  it("starts an empty capture section on its add row", () => {
    const s = enterEditBrowse(inactive, c(0, 0), "captures")
    expect(s.cursor).toEqual({
      field: "captures",
      row: -1,
      addingRow: true,
    })
  })
  it("starts an empty assertion section on its add row", () => {
    const s = enterEditBrowse(inactive, c(0, 0), "assertions")
    expect(s.cursor).toEqual({
      field: "assertions",
      row: -1,
      addingRow: true,
    })
  })
})

describe("exitEditBrowse", () => {
  it("browsing → inactive", () => {
    const browsing = enterEditBrowse(inactive, c(2, 0))
    const s = exitEditBrowse(browsing)
    expect(s.mode).toBe("inactive")
  })
  it("no-op from editing (must cancel first)", () => {
    const editing = beginEditing(enterEditBrowse(inactive, c(2, 0)))
    expect(exitEditBrowse(editing)).toBe(editing)
  })
  it("no-op from inactive", () => {
    expect(exitEditBrowse(inactive)).toBe(inactive)
  })
})

describe("moveFieldCursor", () => {
  it("+1 walks headers → params → pathParams → body → auth → assertions → captures → settings → headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("params")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("pathParams")
    expect(s.cursor.addingRow).toBe(false)
    expect(s.cursor.row).toBe(-1)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("assertions")
    expect(s.cursor.row).toBe(-1)
    expect(s.cursor.addingRow).toBe(true)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("captures")
    expect(s.cursor.row).toBe(-1)
    expect(s.cursor.addingRow).toBe(true)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("settings")
    expect(s.cursor.row).toBe(0)
    s = moveFieldCursor(s, +1, c(2, 1))
    expect(s.cursor.field).toBe("headers")
    expect(s.cursor.row).toBe(0)
  })
  it("-1 walks headers → settings → captures → assertions → auth → body → pathParams → params → headers", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("settings")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("captures")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("assertions")
    expect(s.cursor.addingRow).toBe(true)
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("auth")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("body")
    s = moveFieldCursor(s, -1, c(2, 1))
    expect(s.cursor.field).toBe("pathParams")
    expect(s.cursor.addingRow).toBe(false)
    expect(s.cursor.row).toBe(-1)
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
    const editing = beginEditing(enterEditBrowse(inactive, c(2, 0)))
    expect(moveFieldCursor(editing, +1, c(2, 1))).toBe(editing)
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
  it("walks capture rows through the shared add row", () => {
    const counts = { ...c(0, 0), captures: 2 }
    let s = enterEditBrowse(inactive, counts, "captures")
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor).toEqual({
      field: "captures",
      row: -1,
      addingRow: true,
    })
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, -1, counts)
    expect(s.cursor.addingRow).toBe(true)
  })
  it("walks assertion rows through the shared add row", () => {
    const counts = { ...c(0, 0), assertions: 2 }
    let s = enterEditBrowse(inactive, counts, "assertions")
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor).toEqual({
      field: "assertions",
      row: -1,
      addingRow: true,
    })
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, -1, counts)
    expect(s.cursor.addingRow).toBe(true)
  })
  it("empty section is no-op (no rows to navigate)", () => {
    const s = enterEditBrowse(inactive, c(0, 0))
    expect(moveRowCursor(s, +1, c(0, 0))).toBe(s)
    expect(moveRowCursor(s, -1, c(0, 0))).toBe(s)
    expect(s.cursor.addingRow).toBe(true)
  })
  it("body Select row (row 0) clamps on up arrow", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 1))
    s = moveFieldCursor(s, +1, c(2, 1))
    s = moveFieldCursor(s, +1, { ...c(2, 1), body: 2 })
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(0)
    // Enter on row 0 (Select) is handled differently — see enterEdit hook
    // Down goes to row 1 (first content row)
    s = moveRowCursor(s, +1, { ...c(2, 1), body: 2 })
    expect(s.cursor.row).toBe(1)
    expect(s.cursor.addingRow).toBe(false)
    // Up from row 1 goes back to row 0 (Select)
    s = moveRowCursor(s, -1, { ...c(2, 1), body: 2 })
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("body Select row (row 0) to addingRow when count=1 (no entries)", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 1))
    s = moveFieldCursor(s, +1, c(2, 1))
    s = moveFieldCursor(s, +1, { ...c(2, 1), body: 1 })
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(0)
    // Down with no content rows goes to addingRow (for adding first entry)
    s = moveRowCursor(s, +1, { ...c(2, 1), body: 1 })
    expect(s.cursor.addingRow).toBe(true)
    expect(s.cursor.row).toBe(-1)
    // Up from addingRow goes back to row 0 (Select)
    s = moveRowCursor(s, -1, { ...c(2, 1), body: 1 })
    expect(s.cursor.row).toBe(0)
    expect(s.cursor.addingRow).toBe(false)
  })
  it("no-op when editing", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, +1, c(2, 0))
    const editing = beginEditing(s)
    expect(moveRowCursor(editing, +1, c(2, 0))).toBe(editing)
  })
})

describe("moveRowFirst", () => {
  it("jumps to row 0 in headers section", () => {
    let s = enterEditBrowse(inactive, c(3, 0))
    s = moveRowCursor(s, +1, c(3, 0))
    s = moveRowCursor(s, +1, c(3, 0))
    expect(s.cursor.row).toBe(2)
    const first = moveRowFirst(s, c(3, 0))
    expect(first.cursor.row).toBe(0)
    expect(first.cursor.addingRow).toBe(false)
  })

  it("empty headers/params section jumps to addingRow", () => {
    const s = enterEditBrowse(inactive, c(0, 0))
    const first = moveRowFirst(s, c(0, 0))
    expect(first.cursor.addingRow).toBe(true)
    expect(first.cursor.row).toBe(-1)
  })

  it("uses the add row for capture Home and End navigation", () => {
    const counts = { ...c(0, 0), captures: 2 }
    const s = enterEditBrowse(inactive, counts, "captures")
    expect(moveRowFirst(moveRowLast(s, counts), counts).cursor.row).toBe(0)
    expect(moveRowLast(s, counts).cursor).toEqual({
      field: "captures",
      row: -1,
      addingRow: true,
    })
  })

  it("uses the add row for assertion Home and End navigation", () => {
    const counts = { ...c(0, 0), assertions: 2 }
    const s = enterEditBrowse(inactive, counts, "assertions")
    expect(moveRowFirst(moveRowLast(s, counts), counts).cursor.row).toBe(0)
    expect(moveRowLast(s, counts).cursor).toEqual({
      field: "assertions",
      row: -1,
      addingRow: true,
    })
  })

  it("empty settings/auth/body section is no-op", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    // move to settings
    s = moveFieldCursor(s, -1, {
      headers: 2,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 0,
      settings: 0,
    })
    expect(s.cursor.field).toBe("settings")
    const first = moveRowFirst(s, {
      headers: 2,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 0,
      settings: 0,
    })
    // settings with 0 rows is no-op
    expect(first).toBe(s)
  })

  it("no-op when not browsing", () => {
    const first = moveRowFirst(inactive, c(2, 0))
    expect(first).toBe(inactive)
  })
})

describe("moveRowLast", () => {
  it("jumps to last row in headers section", () => {
    const s = enterEditBrowse(inactive, c(3, 0))
    const last = moveRowLast(s, c(3, 0))
    expect(last.cursor.addingRow).toBe(true)
    expect(last.cursor.row).toBe(-1)
  })

  it("for params, last goes to addingRow", () => {
    let s = enterEditBrowse(inactive, c(0, 2))
    s = moveFieldCursor(s, +1, c(0, 2))
    expect(s.cursor.field).toBe("params")
    const last = moveRowLast(s, c(0, 2))
    expect(last.cursor.addingRow).toBe(true)
    expect(last.cursor.row).toBe(-1)
  })

  it("for settings, last goes to row N-1", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, -1, c(0, 0))
    expect(s.cursor.field).toBe("settings")
    const last = moveRowLast(s, c(0, 0))
    expect(last.cursor.row).toBe(2) // settings default count is 3, so row 2
    expect(last.cursor.addingRow).toBe(false)
  })

  it("for auth, last goes to row N-1", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 4,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.field).toBe("auth")
    const last = moveRowLast(s, counts)
    expect(last.cursor.row).toBe(3)
    expect(last.cursor.addingRow).toBe(false)
  })

  it("empty settings/auth/body section is no-op", () => {
    let s = enterEditBrowse(inactive, c(2, 0))
    s = moveFieldCursor(s, -1, {
      headers: 2,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 0,
      settings: 0,
    })
    expect(s.cursor.field).toBe("settings")
    const last = moveRowLast(s, {
      headers: 2,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 0,
      settings: 0,
    })
    expect(last).toBe(s)
  })

  it("no-op when not browsing", () => {
    const last = moveRowLast(inactive, c(2, 0))
    expect(last).toBe(inactive)
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
  it("browsing → editing, editingRow follows cursor.row for body (no longer addingRow)", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("params")
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("pathParams")
    s = moveFieldCursor(s, +1, { ...c(0, 0), body: 0 })
    expect(s.cursor.field).toBe("body")
    expect(s.cursor.row).toBe(0)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.editingRow).toBe(0)
  })
  it("enters edit mode for auth (type selector row)", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 2,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(0)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
  })

  it("navigates auth rows for bearer (2 rows)", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 2,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1) // clamped
    expect(s.cursor.addingRow).toBe(false)
  })

  it("navigates auth rows for basic (3 rows)", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 3,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(2)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(2) // clamped
  })

  it("navigates auth rows for api_key (4 rows)", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 4,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.row).toBe(0)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(1)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(2)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(3)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(3) // clamped
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
    const editing = beginEditing(enterEditBrowse(inactive, c(2, 0)))
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

  it("sets subfield to 'key' for body row", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("body")
    const e = beginEditing(s)
    expect(e.cursor.subfield).toBe("key")
  })
})

describe("commitEditing", () => {
  it("editing → browsing, editingRow reset to -1", () => {
    const editing = beginEditing(enterEditBrowse(inactive, c(2, 0)))
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

  it("cycles key → value → persist for captures", () => {
    const counts = { ...c(0, 0), captures: 1 }
    let state = enterEditBrowse(inactive, counts, "captures")
    state = beginEditing(state)
    expect(state.cursor.subfield).toBe("key")
    state = toggleSubfield(state)
    expect(state.cursor.subfield).toBe("value")
    state = toggleSubfield(state)
    expect(state.cursor.subfield).toBe("persist")
    expect(toggleSubfield(state).cursor.subfield).toBe("key")
  })

  it("no-op when not in edit mode", () => {
    const browsing = enterEditBrowse(inactive, c(2, 0))
    expect(toggleSubfield(browsing)).toBe(browsing)
  })

  it("toggles key → value for body field", () => {
    let s = enterEditBrowse(inactive, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    s = moveFieldCursor(s, +1, c(0, 0))
    expect(s.cursor.field).toBe("body")
    const editing = beginEditing(s)
    expect(editing.cursor.subfield).toBe("key")
    expect(toggleSubfield(editing).cursor.subfield).toBe("value")
  })

  it("beginEditing on auth row 0 (type selector) enters edit mode", () => {
    const counts = {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 2,
      settings: 3,
    }
    let s = enterEditBrowse(inactive, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    s = moveFieldCursor(s, -1, counts)
    expect(s.cursor.field).toBe("auth")
    expect(s.cursor.row).toBe(0)
    const e = beginEditing(s)
    expect(e.mode).toBe("editing")
    expect(e.cursor.subfield).toBeUndefined()
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

  it("follows the visual tags-first order", () => {
    const counts = { ...c(0, 0), settings: 8 }
    let s = enterEditBrowse(inactive, counts, "settings")
    expect(s.cursor.row).toBe(5)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(6)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(7)
    s = moveRowCursor(s, +1, counts)
    expect(s.cursor.row).toBe(0)
    expect(moveRowFirst(s, counts).cursor.row).toBe(5)
    expect(moveRowLast(s, counts).cursor.row).toBe(4)
  })
})

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "r1",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("toggleFormRowType — applyDraft setFormRow", () => {
  it("toggles form entry from text to file", () => {
    const original = makeReq({
      bodyType: "multipart",
      formData: [
        {
          name: "avatar",
          value: "/path/to/photo.png",
          enabled: true,
          type: "text",
        },
      ],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setFormRow",
      index: 0,
      name: "avatar",
      value: "/path/to/photo.png",
      formType: "file",
    })
    expect(next.get("r1")!.formData![0]!.type).toBe("file")
    expect(next.get("r1")!.formData![0]!.name).toBe("avatar")
    expect(next.get("r1")!.formData![0]!.value).toBe("/path/to/photo.png")
  })

  it("toggles form entry from file to text", () => {
    const original = makeReq({
      bodyType: "multipart",
      formData: [
        {
          name: "avatar",
          value: "/path/to/photo.png",
          enabled: true,
          type: "file",
        },
      ],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setFormRow",
      index: 0,
      name: "avatar",
      value: "/path/to/photo.png",
      formType: "text",
    })
    expect(next.get("r1")!.formData![0]!.type).toBe("text")
    expect(next.get("r1")!.formData![0]!.name).toBe("avatar")
    expect(next.get("r1")!.formData![0]!.value).toBe("/path/to/photo.png")
  })

  it("preserves value when toggling type", () => {
    const original = makeReq({
      bodyType: "multipart",
      formData: [
        { name: "data", value: "some/path.txt", enabled: true, type: "text" },
      ],
    })
    const map = new Map<string, Request>()
    const next = applyDraft(map, "r1", original, {
      kind: "setFormRow",
      index: 0,
      name: "data",
      value: "some/path.txt",
      formType: "file",
    })
    expect(next.get("r1")!.formData![0]!.type).toBe("file")
    expect(next.get("r1")!.formData![0]!.value).toBe("some/path.txt")
  })

  it("detects file-typed entries in new rows via @file() syntax", () => {
    expect(detectFormType("@file(/tmp/upload.bin)")).toEqual({
      formType: "file",
      cleanValue: "/tmp/upload.bin",
    })
  })

  it("keeps home-relative values as text unless explicitly file-typed", () => {
    expect(detectFormType("@/Documents/upload.bin")).toEqual({
      formType: "text",
      cleanValue: "@/Documents/upload.bin",
    })
  })

  it("does not flag non-@file values as file type", () => {
    expect(detectFormType("plain text")).toEqual({
      formType: "text",
      cleanValue: "plain text",
    })
  })
})
