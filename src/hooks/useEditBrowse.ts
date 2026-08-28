import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  AssertionOperator,
  BodyType,
  Request,
  ResponseAssertion,
} from "../schema"
import {
  assertionOperatorRequiresValue,
  assertionValueValidationError,
} from "../assertions"
import { parseResponseExpression } from "../response"
import { isValidVariableName } from "../requests/substitute"
import { isValidTag } from "../tags"
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
  cursorForField,
  FIELD_ORDER,
  type EditState,
  type SectionRowCount,
  type FieldKind,
  type FieldSubfield,
} from "../ui/editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"
import { formatBody } from "../ui/formatRequest"
import { syncPathParamsWithUrl } from "../ui/urlParams"
import { authFieldAtRow, authRowCount, authValueAtRow } from "../ui/authRows"
import { formatAssertionValue, parseAssertionValue } from "../ui/assertionValue"

function isTextBodyType(bodyType: BodyType | undefined): boolean {
  return bodyType === undefined || bodyType === "json" || bodyType === "xml"
}

function rowCount(req: Request | null): SectionRowCount {
  if (!req)
    return {
      headers: 0,
      params: 0,
      pathParams: 0,
      body: 0,
      auth: 1,
      assertions: 0,
      captures: 0,
      settings: 6,
    }
  const authRows = authRowCount(req.auth)
  const body =
    req.bodyType === "none"
      ? 1
      : req.bodyType === "urlencoded" || req.bodyType === "multipart"
        ? 1 + (req.formData?.length ?? 0)
        : 2
  return {
    headers: Object.keys(req.headers).length,
    params: req.params.length,
    pathParams: syncPathParamsWithUrl(req.pathParams ?? [], req.url).length,
    body,
    auth: authRows,
    assertions: req.assertions?.length ?? 0,
    captures: Object.keys(req.captures ?? {}).length,
    settings: 6 + (req.tags?.length ?? 0),
  }
}

function assertionEditValues(
  request: Request | null,
  row: number,
): { key: string; operator: AssertionOperator; value: string } {
  const assertion = request?.assertions?.[row]
  return assertion
    ? {
        key: assertion.expression,
        operator: assertion.operator,
        value: Object.hasOwn(assertion, "value")
          ? formatAssertionValue(assertion.value!)
          : "",
      }
    : { key: "", operator: "equals", value: "" }
}

function captureEditValues(
  request: Request | null,
  row: number,
): { key: string; value: string } {
  const capture = Object.entries(request?.captures ?? {})[row]
  return capture
    ? { key: capture[0], value: capture[1] }
    : { key: "", value: "" }
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
    return authValueAtRow(draft.auth, row)
  }
  if (field === "settings") {
    if (row === 0) return String(draft.timeout)
    if (row === 1) return String(draft.followRedirects ?? true)
    if (row === 2) return String(draft.maxRedirects ?? 5)
    if (row === 3) {
      return draft.tls?.verify === undefined
        ? "inherit"
        : String(draft.tls.verify)
    }
    if (row >= 5) return draft.tags?.[row - 5] ?? ""
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
  if (field === "pathParams") {
    if (addingRow) return ""
    const entry = syncPathParamsWithUrl(draft.pathParams ?? [], draft.url)[row]
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
  if (field === "pathParams") {
    if (addingRow) return { key: "", value: "" }
    const entry = syncPathParamsWithUrl(draft.pathParams ?? [], draft.url)[row]
    return entry
      ? { key: entry.name, value: entry.value }
      : { key: "", value: "" }
  }
  if (field === "settings") {
    if (row === 0) return { key: "", value: String(draft.timeout) }
    if (row === 1)
      return { key: "", value: String(draft.followRedirects ?? true) }
    if (row === 2) return { key: "", value: String(draft.maxRedirects ?? 5) }
    if (row === 3)
      return { key: "", value: currentValueFor(draft, field, row, false) }
    if (row >= 5)
      return { key: "", value: currentValueFor(draft, field, row, false) }
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

export function detectFormType(value: string): {
  formType: "text" | "file"
  cleanValue: string
} {
  const fileMatch = value.match(/^@file\((.+)\)$/)
  if (fileMatch) {
    return { formType: "file", cleanValue: fileMatch[1]! }
  }
  return { formType: "text", cleanValue: value }
}

export interface UseEditBrowseResult {
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  editKey: string
  setEditKey: (v: string) => void
  editOperator: AssertionOperator
  setEditOperator: (operator: AssertionOperator) => void
  editError: string | null
  isActive: boolean
  activeTab: FieldKind
  enterBrowse: () => void
  exitBrowse: () => void
  browseUp: () => void
  browseDown: () => void
  browseFirst: () => void
  browseLast: () => void
  browseLeft: () => void
  browseRight: () => void
  enterAndEdit: () => void
  enterEdit: () => void
  commitEdit: () => boolean
  cancelEdit: () => void
  browseTab: () => void
  revertField: () => void
  revertAll: () => void
  toggleRow: () => void
  toggleFormRowType: () => void
  cycleInactiveTab: (delta: 1 | -1) => void
  enterBrowseAt: (field: FieldKind, row?: number) => void
  activateAt: (
    field: FieldKind,
    row: number,
    addingRow?: boolean,
    subfield?: FieldSubfield,
  ) => void
  focusSubfield: (subfield: FieldSubfield) => void
  toggleAt: (field: FieldKind, row: number) => void
  canEnterTextBodyEditor: boolean
  isEditingTextBody: boolean
  enterTextBodyEditor: () => void
  leaveTextBodyEditor: () => void
  returnToTextBodyTypeSelect: () => void
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
  const [editOperator, setEditOperator] = useState<AssertionOperator>("equals")
  const [editError, setEditError] = useState<string | null>(null)
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

  const editOperatorRef = useRef(editOperator)
  useLayoutEffect(() => {
    editOperatorRef.current = editOperator
  }, [editOperator])

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

  const enterBrowseAt = useCallback((field: FieldKind, row?: number) => {
    setInactiveTab(field)
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "inactive") {
        const cursor = cursorForField(field, c)
        return {
          ...prev,
          cursor:
            row === undefined ? cursor : { ...cursor, row, addingRow: false },
          mode: "browsing" as const,
          editingRow: -1,
        }
      }
      const next = enterEditBrowse(prev, c, field)
      if (row === undefined) return next
      return { ...next, cursor: { ...next.cursor, row, addingRow: false } }
    })
  }, [])

  const activateAt = useCallback(
    (
      field: FieldKind,
      row: number,
      addingRow = false,
      subfield?: FieldSubfield,
    ) => {
      setInactiveTab(field)
      const currentDraft = draftRef.current
      setEditError(null)

      if (field === "assertions") {
        const values = assertionEditValues(currentDraft, row)
        setEditKey(values.key)
        setEditOperator(values.operator)
        setEditValue(values.value)
      } else if (field === "captures") {
        const values = captureEditValues(currentDraft, row)
        setEditKey(values.key)
        setEditValue(values.value)
      } else if (
        field === "body" &&
        (currentDraft?.bodyType === "multipart" ||
          currentDraft?.bodyType === "urlencoded")
      ) {
        const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
        setEditKey(kv.key)
        setEditValue(kv.value)
      } else if (
        field === "headers" ||
        field === "params" ||
        field === "pathParams"
      ) {
        const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
        setEditKey(kv.key)
        setEditValue(kv.value)
      } else {
        setEditValue(currentValueFor(currentDraft, field, row, addingRow))
      }

      setEditState((prev) => {
        const browsed =
          prev.mode === "inactive"
            ? enterEditBrowse(prev, rowCount(currentDraft), field)
            : cancelEditing(prev)
        const next = beginEditing({
          ...browsed,
          mode: "browsing",
          editingRow: -1,
          cursor: { field, row, addingRow },
        })
        return subfield
          ? { ...next, cursor: { ...next.cursor, subfield } }
          : next
      })
    },
    [],
  )

  const toggleAt = useCallback(
    (field: FieldKind, row: number) => {
      setInactiveTab(field)
      setEditState((prev) => {
        const browsed =
          prev.mode === "inactive"
            ? enterEditBrowse(prev, rowCount(draftRef.current), field)
            : cancelEditing(prev)
        return {
          ...browsed,
          mode: "browsing",
          editingRow: -1,
          cursor: { field, row, addingRow: false },
        }
      })

      if (field === "headers") draftMutators.toggleHeaderRow(row)
      else if (field === "params") draftMutators.toggleParamRow(row)
      else if (field === "body") draftMutators.toggleFormRow(row - 1)
      else if (field === "settings" && row === 1) {
        const current = draftRef.current?.followRedirects ?? true
        draftMutators.setFollowRedirects(!current)
      } else if (field === "settings" && row === 4) {
        const current = draftRef.current?.sendCookies ?? true
        draftMutators.setSendCookies(!current)
      }
    },
    [draftMutators],
  )

  const focusSubfield = useCallback((subfield: FieldSubfield) => {
    setEditState((prev) =>
      prev.mode === "editing"
        ? { ...prev, cursor: { ...prev.cursor, subfield } }
        : prev,
    )
  }, [])

  const enterAndEdit = useCallback(() => {
    if (activeTab === "activity") return
    const c = rowCount(draftRef.current)
    const currentDraft = draftRef.current
    const tab = activeTab
    const state = editStateRef.current
    if (state.mode !== "inactive") return

    const browsed = enterEditBrowse(state, c, tab)
    setEditError(null)
    if (browsed.cursor.field === "assertions") {
      const values = assertionEditValues(currentDraft, browsed.cursor.row)
      setEditKey(values.key)
      setEditOperator(values.operator)
      setEditValue(values.value)
      setEditState(beginEditing(browsed))
      return
    }
    if (browsed.cursor.field === "captures") {
      const values = captureEditValues(currentDraft, browsed.cursor.row)
      setEditKey(values.key)
      setEditValue(values.value)
      setEditState(beginEditing(browsed))
      return
    }
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
    if (browsed.cursor.field === "settings" && browsed.cursor.row === 4) {
      const current = currentDraft?.sendCookies ?? true
      draftMutators.setSendCookies(!current)
      setEditState(browsed)
      return
    }
    if (browsed.cursor.field === "settings" && browsed.cursor.row === 3) {
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
    } else if (
      field === "headers" ||
      field === "params" ||
      field === "pathParams"
    ) {
      const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
    }

    setEditState(beginEditing(browsed))
  }, [
    activeTab,
    draftMutators.setFollowRedirects,
    draftMutators.setSendCookies,
  ])

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
      if (
        prev.cursor.field === "body" &&
        prev.cursor.row === 0 &&
        isTextBodyType(draftRef.current?.bodyType)
      ) {
        setEditValue(
          formatBody(draftRef.current?.body, draftRef.current?.bodyType),
        )
        return beginEditing({
          ...prev,
          cursor: { field: "body", row: 1, addingRow: false },
        })
      }
      return moveRowCursor(prev, -1, c)
    })
  }, [])

  const browseDown = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      if (
        prev.cursor.field === "body" &&
        prev.cursor.row === 0 &&
        isTextBodyType(draftRef.current?.bodyType)
      ) {
        setEditValue(
          formatBody(draftRef.current?.body, draftRef.current?.bodyType),
        )
        return beginEditing({
          ...prev,
          cursor: { field: "body", row: 1, addingRow: false },
        })
      }
      return moveRowCursor(prev, +1, c)
    })
  }, [])

  const enterTextBodyEditor = useCallback(() => {
    setEditState((prev) => {
      if (
        prev.mode !== "browsing" ||
        prev.cursor.field !== "body" ||
        prev.cursor.row !== 0 ||
        !isTextBodyType(draftRef.current?.bodyType)
      )
        return prev
      setEditValue(
        formatBody(draftRef.current?.body, draftRef.current?.bodyType),
      )
      return beginEditing({
        ...prev,
        cursor: { field: "body", row: 1, addingRow: false },
      })
    })
  }, [])

  const leaveTextBodyEditor = useCallback(() => {
    setEditState((prev) => {
      if (
        prev.mode !== "editing" ||
        prev.cursor.field !== "body" ||
        prev.cursor.row !== 1 ||
        !isTextBodyType(draftRef.current?.bodyType)
      )
        return prev
      return commitEditing(prev)
    })
  }, [])

  const returnToTextBodyTypeSelect = useCallback(() => {
    setEditState((prev) => {
      if (
        prev.mode !== "editing" ||
        prev.cursor.field !== "body" ||
        prev.cursor.row !== 1 ||
        !isTextBodyType(draftRef.current?.bodyType)
      )
        return prev
      return {
        ...commitEditing(prev),
        cursor: { field: "body", row: 0, addingRow: false },
      }
    })
  }, [])

  const browseFirst = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveRowFirst(prev, c)
    })
  }, [])

  const browseLast = useCallback(() => {
    const c = rowCount(draftRef.current)
    setEditState((prev) => {
      if (prev.mode !== "browsing") return prev
      return moveRowLast(prev, c)
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
    setEditError(null)
    if (field === "settings" && row === 1) {
      const current = draftRef.current?.followRedirects ?? true
      draftMutators.setFollowRedirects(!current)
      return
    }
    if (field === "settings" && row === 4) {
      const current = draftRef.current?.sendCookies ?? true
      draftMutators.setSendCookies(!current)
      return
    }
    if (field === "settings" && row === 3) return
    const currentDraft = draftRef.current
    if (field === "assertions") {
      const values = assertionEditValues(currentDraft, row)
      setEditKey(values.key)
      setEditOperator(values.operator)
      setEditValue(values.value)
      setEditState((prev) => beginEditing(prev))
      return
    }
    if (field === "captures") {
      const values = captureEditValues(currentDraft, row)
      setEditKey(values.key)
      setEditValue(values.value)
      setEditState((prev) => beginEditing(prev))
      return
    }
    if (field === "auth") {
      if (row === 0) {
        return
      }
      const definition = authFieldAtRow(currentDraft?.auth, row)
      if (!definition || definition.kind === "select") return
      if (definition.kind === "boolean" && currentDraft?.auth) {
        draftMutators.setAuthField(
          currentDraft.auth.type,
          definition.field,
          authValueAtRow(currentDraft.auth, row) !== "true",
        )
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
    } else if (
      field === "headers" ||
      field === "params" ||
      field === "pathParams"
    ) {
      const kv = currentKeyValueFor(currentDraft, field, row, addingRow)
      setEditKey(kv.key)
      setEditValue(kv.value)
    }
    setEditState((prev) => beginEditing(prev))
  }, [
    draftMutators.setAuthField,
    draftMutators.setFollowRedirects,
    draftMutators.setSendCookies,
  ])

  const commitEdit = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "editing") return true
    const { field } = state.cursor
    const addingRow = state.cursor.addingRow
    const val = editValueRef.current
    if (field === "captures") {
      const current = draftRef.current
      if (!current) return false
      const key = editKeyRef.current
      const value = editValueRef.current
      const fail = (message: string) => {
        setEditError(message)
        return false
      }
      const entries = Object.entries(current.captures ?? {})
      if (key === "") {
        if (!addingRow && state.cursor.row >= 0) {
          entries.splice(state.cursor.row, 1)
          const captures = Object.fromEntries(entries)
          draftMutators.setCaptures(captures)
          draftRef.current = {
            ...current,
            captures: entries.length > 0 ? captures : undefined,
          }
        }
      } else {
        if (!isValidVariableName(key)) return fail("Invalid variable name")
        try {
          parseResponseExpression(value)
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error))
        }
        const replacedIndex =
          !addingRow &&
          state.cursor.row >= 0 &&
          state.cursor.row < entries.length
            ? state.cursor.row
            : -1
        if (
          entries.some(
            ([name], index) => name === key && index !== replacedIndex,
          )
        ) {
          return fail(`Capture variable "${key}" already exists`)
        }
        if (replacedIndex >= 0) entries[replacedIndex] = [key, value]
        else entries.push([key, value])
        const captures = Object.fromEntries(entries)
        draftMutators.setCaptures(captures)
        draftRef.current = { ...current, captures }
      }
      setEditError(null)
    } else if (field === "assertions") {
      const current = draftRef.current
      if (!current) return false
      const key = editKeyRef.current
      const fail = (message: string) => {
        setEditError(message)
        return false
      }
      const assertions = [...(current.assertions ?? [])]
      if (key === "") {
        if (!addingRow && state.cursor.row >= 0) {
          assertions.splice(state.cursor.row, 1)
          draftMutators.setAssertions(assertions)
          draftRef.current = {
            ...current,
            assertions: assertions.length > 0 ? assertions : undefined,
          }
        }
      } else {
        try {
          parseResponseExpression(key)
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error))
        }
        const operator = editOperatorRef.current
        let assertion: ResponseAssertion
        if (assertionOperatorRequiresValue(operator)) {
          const expected = parseAssertionValue(val)
          const valueError = assertionValueValidationError(
            operator,
            expected,
            "Expected value",
          )
          if (valueError) return fail(valueError)
          assertion = { expression: key, operator, value: expected }
        } else {
          assertion = { expression: key, operator }
        }
        if (!addingRow && state.cursor.row < assertions.length)
          assertions[state.cursor.row] = assertion
        else assertions.push(assertion)
        draftMutators.setAssertions(assertions)
        draftRef.current = { ...current, assertions }
      }
      setEditError(null)
    } else if (field === "body") {
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
      const definition = authFieldAtRow(currentAuth, row)
      if (currentAuth && definition) {
        draftMutators.setAuthField(currentAuth.type, definition.field, val)
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
      } else if (row >= 5) {
        const current = draftRef.current
        if (!current) return false
        if (!isValidTag(val)) {
          setEditError("Tag must be a non-empty trimmed string")
          return false
        }
        const tags = [...(current.tags ?? [])]
        const tagIndex = row - 5
        if (tagIndex < tags.length) tags[tagIndex] = val
        else tags.push(val)
        draftMutators.setTags(tags)
        draftRef.current = { ...current, tags }
        setEditError(null)
      }
    } else if (field === "pathParams") {
      const key = editKeyRef.current.trim()
      const value = editValueRef.current.trim()
      if (key !== "" && !addingRow) {
        draftMutators.setPathParamRow(state.cursor.row, key, value)
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
    editStateRef.current = commitEditing(state)
    setEditState((prev) => commitEditing(prev))
    return true
  }, [draftMutators])

  const cancelEdit = useCallback(() => {
    setEditKey("")
    setEditError(null)
    setEditState((prev) => cancelEditing(prev))
  }, [])

  const browseTab = useCallback(() => {
    setEditState((prev) => {
      if (prev.mode !== "editing") {
        return toggleSubfield(prev)
      }
      if (prev.cursor.field === "captures") {
        return {
          ...prev,
          cursor: {
            ...prev.cursor,
            subfield: prev.cursor.subfield === "key" ? "value" : "key",
          },
        }
      }
      if (prev.cursor.field !== "assertions") return toggleSubfield(prev)
      const subfield = prev.cursor.subfield ?? "key"
      const next =
        subfield === "key"
          ? "operator"
          : subfield === "operator" &&
              assertionOperatorRequiresValue(editOperatorRef.current)
            ? "value"
            : "key"
      return { ...prev, cursor: { ...prev.cursor, subfield: next } }
    })
  }, [])

  const revertFieldHandler = useCallback(() => {
    const state = editStateRef.current
    if (state.mode !== "browsing") return
    const { field, addingRow, row } = state.cursor
    if (field === "auth") {
      draftMutators.revertField(field, row)
      return
    }
    if (field === "captures") {
      const entries = Object.entries(draftRef.current?.captures ?? {})
      if (addingRow || row < 0 || row >= entries.length) return
      entries.splice(row, 1)
      draftMutators.setCaptures(Object.fromEntries(entries))
      return
    }
    if (field === "assertions") {
      const assertions = [...(draftRef.current?.assertions ?? [])]
      if (addingRow || row < 0 || row >= assertions.length) return
      assertions.splice(row, 1)
      draftMutators.setAssertions(assertions)
      return
    }
    if (field === "body") {
      if (row === 0) {
        draftMutators.revertField(field)
        return
      }
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
      if (row >= 5) {
        const tags = [...(draftRef.current?.tags ?? [])]
        const tagIndex = row - 5
        if (tagIndex >= tags.length) return
        tags.splice(tagIndex, 1)
        draftMutators.setTags(tags)
      } else {
        draftMutators.revertField(field)
      }
    } else if (field === "pathParams") {
      if (addingRow) return
      draftMutators.revertField(field, row)
    } else if (field === "headers" || field === "params") {
      if (addingRow) return
      if (field === "headers") draftMutators.removeHeaderRow(row)
      else if (field === "params") draftMutators.removeParamRow(row)
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
    if (field === "auth") {
      const auth = draftRef.current?.auth
      const definition = authFieldAtRow(auth, row)
      if (auth && definition?.kind === "boolean") {
        draftMutators.setAuthField(
          auth.type,
          definition.field,
          authValueAtRow(auth, row) !== "true",
        )
      }
      return
    }
    if (field === "body") {
      if (row === 0) return
      const bodyType = draftRef.current?.bodyType
      if (bodyType === "urlencoded" || bodyType === "multipart") {
        draftMutators.toggleFormRow(row - 1)
      }
      return
    }
    if (field === "pathParams") return
    if (field === "headers") draftMutators.toggleHeaderRow(row)
    else if (field === "params") draftMutators.toggleParamRow(row)
    else if (field === "settings" && row === 1) {
      const current = draftRef.current?.followRedirects ?? true
      draftMutators.setFollowRedirects(!current)
    } else if (field === "settings" && row === 4) {
      const current = draftRef.current?.sendCookies ?? true
      draftMutators.setSendCookies(!current)
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

  const canEnterTextBodyEditor =
    editState.mode === "browsing" &&
    editState.cursor.field === "body" &&
    editState.cursor.row === 0 &&
    isTextBodyType(draft?.bodyType)
  const isEditingTextBody =
    editState.mode === "editing" &&
    editState.cursor.field === "body" &&
    editState.cursor.row === 1 &&
    isTextBodyType(draft?.bodyType)

  return useMemo(
    () => ({
      editState,
      editValue,
      setEditValue,
      editKey,
      setEditKey,
      editOperator,
      setEditOperator,
      editError,
      isActive: editState.mode !== "inactive",
      activeTab,
      enterBrowse,
      exitBrowse,
      browseUp,
      browseDown,
      browseFirst,
      browseLast,
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
      enterBrowseAt,
      activateAt,
      focusSubfield,
      toggleAt,
      canEnterTextBodyEditor,
      isEditingTextBody,
      enterTextBodyEditor,
      leaveTextBodyEditor,
      returnToTextBodyTypeSelect,
    }),
    [
      editState,
      editValue,
      editKey,
      editOperator,
      editError,
      activeTab,
      enterBrowse,
      enterBrowseAt,
      activateAt,
      focusSubfield,
      toggleAt,
      exitBrowse,
      browseUp,
      browseDown,
      browseFirst,
      browseLast,
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
      canEnterTextBodyEditor,
      isEditingTextBody,
      enterTextBodyEditor,
      leaveTextBodyEditor,
      returnToTextBodyTypeSelect,
    ],
  )
}
