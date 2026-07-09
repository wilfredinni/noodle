import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  FIELD_ORDER,
  type EditState,
  type SectionRowCount,
  type FieldKind,
} from "../ui/editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"

function rowCount(req: Request | null): SectionRowCount {
  if (!req) return { headers: 0, params: 0, body: 0, auth: 1, settings: 3 }
  let authRows = 1 // type selector row always present
  const a = req.auth
  if (a) {
    if (a.type === "bearer") authRows = 2
    else if (a.type === "basic") authRows = 3
    else if (a.type === "api_key") authRows = 4
  }
  const body =
    req.bodyType === "none"
      ? 1
      : req.bodyType === "urlencoded" || req.bodyType === "multipart"
        ? 1 + (req.formData?.length ?? 0)
        : 2
  return {
    headers: Object.keys(req.headers).length,
    params: req.params.length,
    body,
    auth: authRows,
    settings: 3,
  }
}

function currentValueFor(
  draft: Request | null,
  field: FieldKind,
  row: number,
  addingRow: boolean,
): string {
  if (!draft) return ""
  if (field === "body") {
    if (row === 0) return ""
    if (addingRow) {
      const bt = draft.bodyType
      if (bt === "urlencoded" || bt === "multipart") return ""
      if (bt === "binary") return draft.filePath ?? ""
      return draft.body ?? ""
    }
    const formData = draft.formData
    const formIdx = row - 1
    if (formData && formIdx >= 0 && formIdx < formData.length) {
      const entry = formData[formIdx]!
      return `${entry.name}: ${entry.value}`
    }
    if (draft.bodyType === "binary") {
      return draft.filePath ?? ""
    }
    if (draft.bodyType === "none") return ""
    return draft.body ?? ""
  }
  if (field === "auth") {
    const a = draft.auth
    if (!a || a.type === "none") return ""
    if (a.type === "bearer") {
      if (row === 0) return ""
      if (row === 1) return a.token
    }
    if (a.type === "basic") {
      if (row === 0) return ""
      if (row === 1) return a.user
      if (row === 2) return a.pass
    }
    if (a.type === "api_key") {
      if (row === 0) return ""
      if (row === 1) return a.key
      if (row === 2) return a.value
      if (row === 3) return a.placement
    }
    return ""
  }
  if (field === "settings") {
    if (row === 0) return String(draft.timeout)
    if (row === 1) return String(draft.followRedirects ?? true)
    if (row === 2) return String(draft.maxRedirects ?? 5)
    return ""
  }
  if (field === "headers") {
    if (addingRow) return ""
    const entries = Object.entries(draft.headers)
    const entry = entries[row]
    return entry ? `${entry[0]}: ${entry[1].value}` : ""
  }
  if (field === "params") {
    if (addingRow) return ""
    const entry = draft.params[row]
    return entry ? `${entry.name}: ${entry.value}` : ""
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
  if (field === "headers") {
    if (addingRow) return { key: "", value: "" }
    const entries = Object.entries(draft.headers)
    const entry = entries[row]
    return entry
      ? { key: entry[0], value: entry[1].value }
      : { key: "", value: "" }
  }
  if (field === "params") {
    if (addingRow) return { key: "", value: "" }
    const entry = draft.params[row]
    return entry
      ? { key: entry.name, value: entry.value }
      : { key: "", value: "" }
  }
  if (field === "settings") {
    if (row === 0) return { key: "", value: String(draft.timeout) }
    if (row === 1)
      return { key: "", value: String(draft.followRedirects ?? true) }
    if (row === 2) return { key: "", value: String(draft.maxRedirects ?? 5) }
    return { key: "", value: "" }
  }
  if (field === "body") {
    if (row === 0) return { key: "", value: "" }
    const formData = draft.formData
    const formIdx = row - 1
    if (formData && formIdx >= 0 && formIdx < formData.length) {
      const entry = formData[formIdx]!
      return { key: entry.name, value: entry.value }
    }
    if (draft.bodyType === "binary") {
      return { key: "", value: draft.filePath ?? "" }
    }
    return { key: "", value: draft.body ?? "" }
  }
  if (field === "auth") {
    const val = currentValueFor(draft, field, row, false)
    return { key: "", value: val }
  }
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
  toggleFormRowType: () => void
  cycleInactiveTab: (delta: 1 | -1) => void
}

export interface UseEditBrowseOptions {
  initialTab?: FieldKind
  onTabChange?: (tab: FieldKind) => void
}

export function useEditBrowse(
  draft: Request | null,
  draftMutators: UseRequestDraftResult,
  options?: UseEditBrowseOptions,
): UseEditBrowseResult {
  const [editState, setEditState] = useState<EditState>(initialEditState())
  const [editValue, setEditValue] = useState("")
  const [editKey, setEditKey] = useState("")
  const [inactiveTab, setInactiveTab] = useState<FieldKind>(
    options?.initialTab ?? "headers",
  )

  const draftRef = useRef(draft)
  draftRef.current = draft

  const editStateRef = useRef(editState)
  editStateRef.current = editState

  const editValueRef = useRef(editValue)
  editValueRef.current = editValue

  const editKeyRef = useRef(editKey)
  editKeyRef.current = editKey

  const onTabChangeRef = useRef(options?.onTabChange)
  onTabChangeRef.current = options?.onTabChange

  // Sync inactiveTab when initialTab prop changes (request switch)
  useEffect(() => {
    setInactiveTab(options?.initialTab ?? "headers")
  }, [options?.initialTab])

  const isFirstTabChange = useRef(true)
  useEffect(() => {
    if (isFirstTabChange.current) {
      isFirstTabChange.current = false
      return
    }
    onTabChangeRef.current?.(inactiveTab)
  }, [inactiveTab])

  const activeTab =
    editState.mode !== "inactive"
      ? editState.cursor.field
      : (options?.initialTab ?? inactiveTab)

  const enterBrowse = useCallback(() => {
    const c = rowCount(draftRef.current)
    const tab = activeTab
    setEditState((prev) => {
      if (prev.mode !== "inactive") return prev
      return enterEditBrowse(prev, c, tab)
    })
  }, [activeTab])

  const enterAndEdit = useCallback(() => {
    if (activeTab === "activity") return
    const c = rowCount(draftRef.current)
    const currentDraft = draftRef.current
    const tab = activeTab
    const state = editStateRef.current
    if (state.mode !== "inactive") return

    const browsed = enterEditBrowse(state, c, tab)
    if (browsed.cursor.field === "auth" && browsed.cursor.row === 0) {
      setEditState(browsed)
      return
    }
    if (browsed.cursor.field === "auth") {
      const init = currentValueFor(
        currentDraft,
        browsed.cursor.field,
        browsed.cursor.row,
        false,
      )
      setEditValue(init)
      setEditState(beginEditing(browsed))
      return
    }
    if (browsed.cursor.field === "settings" && browsed.cursor.row === 1) {
      const current = currentDraft?.followRedirects ?? true
      draftMutators.setFollowRedirects(!current)
      setEditState(browsed)
      return
    }

    const { field, row, addingRow } = browsed.cursor
    if (field === "body" && row === 0) {
      setEditState(browsed)
      return
    }
    if (field === "body" || field === "settings") {
      const bodyType = currentDraft?.bodyType
      if (field === "body" && bodyType === "none") {
        setEditState(browsed)
        return
      }
      if (
        field === "body" &&
        (bodyType === "multipart" || bodyType === "urlencoded") &&
        !addingRow
      ) {
        const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
        setEditKey(kv.key)
        setEditValue(kv.value)
      } else if (field === "body" && bodyType === "binary") {
        setEditValue(currentDraft?.filePath ?? "")
      } else {
        const init = currentValueFor(currentDraft, field, row, addingRow)
        setEditValue(init)
      }
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
    const { field, row } = state.cursor
    if (field === "settings" && row === 1) {
      const current = draftRef.current?.followRedirects ?? true
      draftMutators.setFollowRedirects(!current)
      return
    }
    const currentDraft = draftRef.current
    if (field === "auth") {
      if (row === 0) {
        return
      }
      const init = currentValueFor(currentDraft, field, row, false)
      setEditValue(init)
      setEditState((prev) => beginEditing(prev))
      return
    }
    const { addingRow } = state.cursor
    if (field === "body" && row === 0) {
      return
    }
    if (field === "body" || field === "settings") {
      const bodyType = currentDraft?.bodyType
      if (field === "body" && bodyType === "none") {
        return
      }
      if (
        field === "body" &&
        (bodyType === "multipart" || bodyType === "urlencoded") &&
        !addingRow
      ) {
        const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
        setEditKey(kv.key)
        setEditValue(kv.value)
      } else {
        const init = currentValueFor(currentDraft, field, row, addingRow)
        setEditValue(init)
      }
    } else if (field === "headers" || field === "params") {
      const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
    }
    setEditState((prev) => beginEditing(prev))
  }, [])

  function detectFormType(value: string): {
    formType: "text" | "file"
    cleanValue: string
  } {
    const fileMatch = value.match(/^@file\((.+)\)$/)
    if (fileMatch) {
      return { formType: "file", cleanValue: fileMatch[1]! }
    }
    return { formType: "text", cleanValue: value }
  }

  const commitEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "editing") return
    const { field } = state.cursor
    const addingRow = state.cursor.addingRow
    const val = editValueRef.current
    if (field === "body") {
      const currentBody = draftRef.current
      const bodyType = currentBody?.bodyType
      if (bodyType === "multipart" || bodyType === "urlencoded") {
        const key = editKeyRef.current.trim()
        const value = editValueRef.current.trim()
        if (key === "") {
          const formIdx = state.cursor.row - 1
          if (!addingRow && formIdx >= 0) {
            draftMutators.removeFormRow(formIdx)
          }
        } else if (addingRow) {
          const { formType, cleanValue } = detectFormType(value)
          draftMutators.addFormRow(key, cleanValue, formType)
        } else {
          const formIdx = state.cursor.row - 1
          const existing = currentBody?.formData?.[formIdx]
          const formType = existing?.type ?? "text"
          draftMutators.setFormRow(formIdx, key, value, formType)
        }
      } else if (bodyType === "binary") {
        draftMutators.setFilePath(val)
      } else {
        draftMutators.setBody(val)
      }
    } else if (field === "auth") {
      const row = state.cursor.row
      const currentAuth = draftRef.current?.auth
      if (currentAuth) {
        if (currentAuth.type === "bearer" && row === 1) {
          draftMutators.setAuthField("bearer", "token", val)
        } else if (currentAuth.type === "basic") {
          if (row === 1) draftMutators.setAuthField("basic", "user", val)
          else if (row === 2) draftMutators.setAuthField("basic", "pass", val)
        } else if (currentAuth.type === "api_key") {
          if (row === 1) draftMutators.setAuthField("api_key", "key", val)
          else if (row === 2)
            draftMutators.setAuthField("api_key", "value", val)
        }
      }
    } else if (field === "settings") {
      const row = state.cursor.row
      if (row === 0) {
        draftMutators.setTimeout(Number(val) || 0)
      } else if (row === 1) {
        draftMutators.setFollowRedirects(val.trim().toLowerCase() !== "false")
      } else if (row === 2) {
        const n = Number(val)
        draftMutators.setMaxRedirects(
          Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 5,
        )
      }
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
    if (field === "auth") {
      draftMutators.revertField(field, row)
      return
    }
    if (field === "body") {
      if (row === 0) return
      const bodyType = draftRef.current?.bodyType
      if (bodyType === "urlencoded" || bodyType === "multipart") {
        if (addingRow) return
        const formIdx = row - 1
        if (formIdx >= 0) {
          draftMutators.removeFormRow(formIdx)
        }
      } else {
        draftMutators.revertField(field)
      }
      return
    }
    if (field === "settings") {
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
    if (field === "body") {
      if (row === 0) return
      const bodyType = draftRef.current?.bodyType
      if (bodyType === "urlencoded" || bodyType === "multipart") {
        draftMutators.toggleFormRow(row - 1)
      }
      return
    }
    if (field === "headers") draftMutators.toggleHeaderRow(row)
    else if (field === "params") draftMutators.toggleParamRow(row)
    else if (field === "settings" && row === 1) {
      const current = draftRef.current?.followRedirects ?? true
      draftMutators.setFollowRedirects(!current)
    }
  }, [draftMutators])

  const toggleFormRowType = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, addingRow, row } = state.cursor
    if (field !== "body" || addingRow || row === 0) return
    const bodyType = draftRef.current?.bodyType
    if (bodyType !== "multipart" && bodyType !== "urlencoded") return
    const formIdx = row - 1
    const entry = draftRef.current?.formData?.[formIdx]
    if (!entry) return
    const newType = entry.type === "file" ? "text" : "file"
    draftMutators.setFormRow(formIdx, entry.name, entry.value, newType)
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
      toggleFormRowType,
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
      toggleFormRowType,
      cycleInactiveTab,
    ],
  )
}
