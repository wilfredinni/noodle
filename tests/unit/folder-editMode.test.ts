import { describe, it, expect } from "bun:test"
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
  folderFieldIndex,
  folderCursorForField,
  type EditState,
  type FolderRowCount,
  type FolderFieldKind,
} from "../../src/ui/editMode"

function folderInactive(): EditState {
  return initialFolderEditState()
}

function folderBrowsing(
  field: FolderFieldKind = "meta",
  row = 0,
  addingRow = false,
): EditState {
  return {
    mode: "browsing",
    cursor: { field, row, addingRow },
    editingRow: -1,
  }
}

function folderEditing(
  field: FolderFieldKind = "meta",
  row = 0,
  subfield: "key" | "value" = "key",
  editingRow = 0,
): EditState {
  return {
    mode: "editing",
    cursor: { field, row, addingRow: false, subfield },
    editingRow,
  }
}

const defaultCounts: FolderRowCount = {
  meta: 3,
  headers: 3,
  params: 3,
  auth: 3,
}

const emptyCounts: FolderRowCount = {
  meta: 0,
  headers: 0,
  params: 0,
  auth: 0,
}

describe("initialFolderEditState", () => {
  it("starts inactive with meta cursor", () => {
    const state = initialFolderEditState()
    expect(state.mode).toBe("inactive")
    expect(state.cursor.field).toBe("meta")
    expect(state.cursor.row).toBe(-1)
    expect(state.cursor.addingRow).toBe(false)
    expect(state.editingRow).toBe(-1)
  })
})

describe("FOLDER_FIELD_ORDER", () => {
  it("has correct order", () => {
    expect(FOLDER_FIELD_ORDER).toEqual(["meta", "headers", "params", "auth"])
  })
})

describe("folderFieldIndex", () => {
  it("maps field to index based on FOLDER_FIELD_ORDER", () => {
    expect(folderFieldIndex("meta")).toBe(0)
    expect(folderFieldIndex("headers")).toBe(1)
    expect(folderFieldIndex("params")).toBe(2)
    expect(folderFieldIndex("auth")).toBe(3)
  })

  it("returns -1 for unknown field", () => {
    expect(folderFieldIndex("body" as FolderFieldKind)).toBe(-1)
  })
})

describe("folderCursorForField", () => {
  it("meta returns row 0, addingRow false", () => {
    const c = folderCursorForField("meta", emptyCounts)
    expect(c).toEqual({ field: "meta", row: 0, addingRow: false })
  })

  it("auth returns row 0, addingRow false", () => {
    const c = folderCursorForField("auth", emptyCounts)
    expect(c).toEqual({ field: "auth", row: 0, addingRow: false })
  })

  it("empty headers returns addingRow true, row -1", () => {
    const c = folderCursorForField("headers", emptyCounts)
    expect(c).toEqual({ field: "headers", row: -1, addingRow: true })
  })

  it("non-empty headers returns row 0, addingRow false", () => {
    const c = folderCursorForField("headers", defaultCounts)
    expect(c).toEqual({ field: "headers", row: 0, addingRow: false })
  })

  it("non-empty params returns row 0, addingRow false", () => {
    const c = folderCursorForField("params", defaultCounts)
    expect(c).toEqual({ field: "params", row: 0, addingRow: false })
  })
})

describe("enterFolderEditBrowse", () => {
  it("inactive → browsing at meta", () => {
    const result = enterFolderEditBrowse(folderInactive(), emptyCounts)
    expect(result.mode).toBe("browsing")
    expect(result.cursor.field).toBe("meta")
    expect(result.cursor.row).toBe(0)
    expect(result.editingRow).toBe(-1)
  })

  it("inactive → browsing at explicit start field", () => {
    const result = enterFolderEditBrowse(
      folderInactive(),
      defaultCounts,
      "params",
    )
    expect(result.mode).toBe("browsing")
    expect(result.cursor.field).toBe("params")
    expect(result.cursor.row).toBe(0)
  })

  it("no-op from browsing", () => {
    const browsing = folderBrowsing()
    const result = enterFolderEditBrowse(browsing, defaultCounts)
    expect(result).toBe(browsing)
  })

  it("no-op from editing", () => {
    const editing = folderEditing()
    const result = enterFolderEditBrowse(editing, defaultCounts)
    expect(result).toBe(editing)
  })
})

describe("exitEditBrowse", () => {
  it("browsing → inactive", () => {
    const result = exitEditBrowse(folderBrowsing())
    expect(result.mode).toBe("inactive")
    expect(result.cursor.field).toBe("meta")
  })

  it("no-op from editing", () => {
    const editing = folderEditing()
    const result = exitEditBrowse(editing)
    expect(result).toBe(editing)
  })

  it("no-op from inactive", () => {
    const inactive = folderInactive()
    const result = exitEditBrowse(inactive)
    expect(result).toBe(inactive)
  })
})

describe("moveFolderFieldCursor", () => {
  it("+1 walks meta → headers → params → auth → meta", () => {
    const counts = emptyCounts
    const atMeta = enterFolderEditBrowse(folderInactive(), counts, "meta")
    const atHeaders = moveFolderFieldCursor(atMeta, 1, counts)
    expect(atHeaders.cursor.field).toBe("headers")
    const atParams = moveFolderFieldCursor(atHeaders, 1, counts)
    expect(atParams.cursor.field).toBe("params")
    const atAuth = moveFolderFieldCursor(atParams, 1, counts)
    expect(atAuth.cursor.field).toBe("auth")
    const backToMeta = moveFolderFieldCursor(atAuth, 1, counts)
    expect(backToMeta.cursor.field).toBe("meta")
  })

  it("-1 walks meta → auth → params → headers → meta", () => {
    const counts = emptyCounts
    const atMeta = enterFolderEditBrowse(folderInactive(), counts, "meta")
    const atAuth = moveFolderFieldCursor(atMeta, -1, counts)
    expect(atAuth.cursor.field).toBe("auth")
    const atParams = moveFolderFieldCursor(atAuth, -1, counts)
    expect(atParams.cursor.field).toBe("params")
    const atHeaders = moveFolderFieldCursor(atParams, -1, counts)
    expect(atHeaders.cursor.field).toBe("headers")
    const backToMeta = moveFolderFieldCursor(atHeaders, -1, counts)
    expect(backToMeta.cursor.field).toBe("meta")
  })

  it("no-op when editing", () => {
    const editing = folderEditing()
    const result = moveFolderFieldCursor(editing, 1, emptyCounts)
    expect(result).toBe(editing)
  })
})

describe("moveFolderRowCursor", () => {
  it("meta rows clamp: 0 → clamped at 0", () => {
    const counts: FolderRowCount = { meta: 1, headers: 0, params: 0, auth: 0 }
    const browsing = folderBrowsing("meta", 0)
    const step = moveFolderRowCursor(browsing, 1, counts)
    expect(step.cursor.row).toBe(0)
  })

  it("auth rows clamp", () => {
    const counts: FolderRowCount = { meta: 0, headers: 0, params: 0, auth: 2 }
    const browsing = folderBrowsing("auth", 1)
    const stepDown = moveFolderRowCursor(browsing, 1, counts)
    expect(stepDown.cursor.row).toBe(1)
  })

  it("headers addingRow wrap: 0 → 1 → [+] → 0 → 1", () => {
    const counts: FolderRowCount = { meta: 0, headers: 2, params: 0, auth: 0 }
    const at0 = folderBrowsing("headers", 0)
    const at1 = moveFolderRowCursor(at0, 1, counts)
    expect(at1.cursor.row).toBe(1)
    expect(at1.cursor.addingRow).toBe(false)
    const atPlus = moveFolderRowCursor(at1, 1, counts)
    expect(atPlus.cursor.row).toBe(-1)
    expect(atPlus.cursor.addingRow).toBe(true)
    const backTo0 = moveFolderRowCursor(atPlus, 1, counts)
    expect(backTo0.cursor.row).toBe(0)
    expect(backTo0.cursor.addingRow).toBe(false)
    const backTo1 = moveFolderRowCursor(backTo0, 1, counts)
    expect(backTo1.cursor.row).toBe(1)
  })

  it("params addingRow wrap similar to headers", () => {
    const counts: FolderRowCount = { meta: 0, headers: 0, params: 1, auth: 0 }
    const browsing = folderBrowsing("params", 0)
    const atPlus = moveFolderRowCursor(browsing, 1, counts)
    expect(atPlus.cursor.addingRow).toBe(true)
    const backTo0 = moveFolderRowCursor(atPlus, 1, counts)
    expect(backTo0.cursor.row).toBe(0)
    expect(backTo0.cursor.addingRow).toBe(false)
  })

  it("headers backward wrap: [+] → last row, 0 → [+]", () => {
    const counts: FolderRowCount = { meta: 0, headers: 3, params: 0, auth: 0 }
    const at0 = folderBrowsing("headers", 0)
    const toPlus = moveFolderRowCursor(at0, -1, counts)
    expect(toPlus.cursor.addingRow).toBe(true)
    expect(toPlus.cursor.row).toBe(-1)
    const toLast = moveFolderRowCursor(toPlus, -1, counts)
    expect(toLast.cursor.row).toBe(counts.headers - 1)
    expect(toLast.cursor.addingRow).toBe(false)
  })

  it("empty section is no-op", () => {
    const browsing = folderBrowsing("headers", 0)
    const result = moveFolderRowCursor(browsing, 1, emptyCounts)
    expect(result).toBe(browsing)
  })

  it("no-op when editing", () => {
    const editing = folderEditing()
    const result = moveFolderRowCursor(editing, 1, defaultCounts)
    expect(result).toBe(editing)
  })
})

describe("beginEditing for meta", () => {
  it("sets subfield to 'key' for meta", () => {
    const browsing = folderBrowsing("meta", 0)
    const result = beginEditing(browsing)
    expect(result.mode).toBe("editing")
    expect(result.cursor.subfield).toBe("key")
    expect(result.editingRow).toBe(0)
  })
})

describe("toggleSubfield for meta", () => {
  it("toggles key → value for meta", () => {
    const editing = folderEditing("meta", 0, "key", 0)
    const toggled = toggleSubfield(editing)
    expect(toggled.cursor.subfield).toBe("value")
    const toggledBack = toggleSubfield(toggled)
    expect(toggledBack.cursor.subfield).toBe("key")
  })
})

describe("commitEditing", () => {
  it("editing → browsing, editingRow reset to -1", () => {
    const editing = folderEditing("meta", 0, "key", 0)
    const result = commitEditing(editing)
    expect(result.mode).toBe("browsing")
    expect(result.editingRow).toBe(-1)
  })

  it("no-op when not editing", () => {
    const browsing = folderBrowsing()
    const result = commitEditing(browsing)
    expect(result).toBe(browsing)
  })

  it("clears subfield after commit", () => {
    const editing = folderEditing("meta", 0, "key", 0)
    const result = commitEditing(editing)
    expect(result.cursor.subfield).toBeUndefined()
  })
})

describe("cancelEditing", () => {
  it("editing → browsing, editingRow reset to -1, cursor preserved", () => {
    const editing = folderEditing("meta", 0, "key", 0)
    const result = cancelEditing(editing)
    expect(result.mode).toBe("browsing")
    expect(result.editingRow).toBe(-1)
    expect(result.cursor.field).toBe("meta")
    expect(result.cursor.row).toBe(0)
  })

  it("no-op when not editing", () => {
    const browsing = folderBrowsing()
    const result = cancelEditing(browsing)
    expect(result).toBe(browsing)
  })

  it("clears subfield after cancel", () => {
    const editing = folderEditing("meta", 0, "key", 0)
    const result = cancelEditing(editing)
    expect(result.cursor.subfield).toBeUndefined()
  })
})
