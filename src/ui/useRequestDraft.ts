import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Request, Auth, Method, KvEntry } from "../schema"
import type { FieldKind } from "./editMode"

export type DraftOp =
  | { kind: "setUrl"; url: string }
  | { kind: "setBody"; body: string }
  | { kind: "setHeaderRow"; index: number; key: string; value: string }
  | { kind: "addHeaderRow"; key: string; value: string }
  | { kind: "removeHeaderRow"; index: number }
  | { kind: "toggleHeaderRow"; index: number }
  | { kind: "setParamRow"; index: number; key: string; value: string }
  | { kind: "addParamRow"; key: string; value: string }
  | { kind: "removeParamRow"; index: number }
  | { kind: "toggleParamRow"; index: number }
  | { kind: "revertField"; field: FieldKind; row?: number }
  | { kind: "revertAll" }

export function parseRow(input: string): { key: string; value: string } {
  const trimmed = input.trim()
  if (trimmed === "") return { key: "", value: "" }
  const colonIdx = trimmed.indexOf(":")
  if (colonIdx === -1) return { key: trimmed, value: "" }
  const key = trimmed.slice(0, colonIdx).trim()
  const value = trimmed.slice(colonIdx + 1).trim()
  return { key, value }
}

function recordsEqual(
  a: Record<string, KvEntry>,
  b: Record<string, KvEntry>,
): boolean {
  const ae = Object.entries(a).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  const be = Object.entries(b).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
  if (ae.length !== be.length) return false
  for (let i = 0; i < ae.length; i++) {
    if (
      ae[i]![0] !== be[i]![0] ||
      ae[i]![1].value !== be[i]![1].value ||
      ae[i]![1].enabled !== be[i]![1].enabled
    )
      return false
  }
  return true
}

function authEqual(a: Auth | undefined, b: Auth | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  if (a.type !== b.type) return false
  if (a.type === "none" && b.type === "none") return true
  if (a.type === "bearer" && b.type === "bearer") return a.token === b.token
  if (a.type === "basic" && b.type === "basic") {
    return a.user === b.user && a.pass === b.pass
  }
  return false
}

export function requestEquals(a: Request, b: Request): boolean {
  if (a.url !== b.url) return false
  if (a.method !== b.method) return false
  if (a.body !== b.body) return false
  if (!recordsEqual(a.headers, b.headers)) return false
  if (!recordsEqual(a.params, b.params)) return false
  if (!authEqual(a.auth, b.auth)) return false
  return true
}

function sortedEntries(rec: Record<string, KvEntry>): [string, KvEntry][] {
  return Object.entries(rec)
}

function replaceRow(
  rec: Record<string, KvEntry>,
  index: number,
  key: string,
  value: string,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  if (!entries[index]) return rec
  const out: Record<string, KvEntry> = {}
  for (let i = 0; i < entries.length; i++) {
    const [k, entry] = entries[i]!
    if (i === index) {
      if (key !== "") out[key] = { value, enabled: entry.enabled }
    } else if (k !== key) {
      out[k] = entry
    }
  }
  return out
}

function addRow(
  rec: Record<string, KvEntry>,
  key: string,
  value: string,
): Record<string, KvEntry> {
  if (key === "") return rec
  return { ...rec, [key]: { value, enabled: true } }
}

function removeRow(
  rec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  const target = entries[index]
  if (!target) return rec
  const out: Record<string, KvEntry> = {}
  for (const [k, v] of entries) if (k !== target[0]) out[k] = v
  return out
}

function revertRow(
  rec: Record<string, KvEntry>,
  originalRec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const origEntries = sortedEntries(originalRec)
  const curEntries = sortedEntries(rec)
  if (index >= origEntries.length) {
    return removeRow(rec, index)
  }
  const [origKey, origEntry] = origEntries[index]!
  const out: Record<string, KvEntry> = {}
  let placed = false
  for (let i = 0; i < curEntries.length; i++) {
    if (i === index) {
      out[origKey] = origEntry
      placed = true
    } else {
      const [k, v] = curEntries[i]!
      out[k] = v
    }
  }
  if (!placed) out[origKey] = origEntry
  return out
}

function toggleRow(
  rec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const entries = sortedEntries(rec)
  const target = entries[index]
  if (!target) return rec
  const [k] = target
  const out: Record<string, KvEntry> = {}
  for (const [key, v] of entries) {
    if (key === k) {
      out[key] = { value: v.value, enabled: !v.enabled }
    } else {
      out[key] = v
    }
  }
  return out
}

export function applyDraft(
  map: Map<string, Request>,
  id: string,
  original: Request,
  op: DraftOp,
): Map<string, Request> {
  const current = map.get(id) ?? original
  const next = new Map(map)
  if (op.kind === "revertAll") {
    next.delete(id)
    return next
  }
  const draft: Request = { ...current }
  switch (op.kind) {
    case "setUrl":
      draft.url = op.url
      break
    case "setBody":
      draft.body = op.body
      break
    case "setHeaderRow": {
      const { key, value } = op
      if (key === "") {
        draft.headers = removeRow(current.headers, op.index)
      } else {
        draft.headers = replaceRow(current.headers, op.index, key, value)
      }
      break
    }
    case "addHeaderRow":
      draft.headers = addRow(current.headers, op.key, op.value)
      break
    case "removeHeaderRow":
      draft.headers = removeRow(current.headers, op.index)
      break
    case "toggleHeaderRow":
      draft.headers = toggleRow(current.headers, op.index)
      break
    case "setParamRow": {
      const { key, value } = op
      if (key === "") {
        draft.params = removeRow(current.params, op.index)
      } else {
        draft.params = replaceRow(current.params, op.index, key, value)
      }
      break
    }
    case "addParamRow":
      draft.params = addRow(current.params, op.key, op.value)
      break
    case "removeParamRow":
      draft.params = removeRow(current.params, op.index)
      break
    case "toggleParamRow":
      draft.params = toggleRow(current.params, op.index)
      break
    case "revertField": {
      if (op.field === "body") draft.body = original.body
      else if (op.field === "headers" && op.row !== undefined) {
        draft.headers = revertRow(current.headers, original.headers, op.row)
      } else if (op.field === "params" && op.row !== undefined) {
        draft.params = revertRow(current.params, original.params, op.row)
      }
      break
    }
  }
  next.set(id, draft)
  return next
}

export type { Method, Request }

export interface UseRequestDraftResult {
  draft: Request | null
  isDirty: boolean
  setUrl: (url: string) => void
  setBody: (body: string) => void
  setHeaderRow: (index: number, key: string, value: string) => void
  addHeaderRow: (key: string, value: string) => void
  removeHeaderRow: (index: number) => void
  toggleHeaderRow: (index: number) => void
  setParamRow: (index: number, key: string, value: string) => void
  addParamRow: (key: string, value: string) => void
  removeParamRow: (index: number) => void
  toggleParamRow: (index: number) => void
  revertField: (field: FieldKind, row?: number) => void
  revertAll: () => void
  markSaved: () => void
}

export function useRequestDraft(
  selectedRequest: Request | null,
): UseRequestDraftResult {
  const [map, setMap] = useState<Map<string, Request>>(new Map())
  const [originalMap, setOriginalMap] = useState<Map<string, Request>>(
    new Map(),
  )

  useEffect(() => {
    if (!selectedRequest) return
    setOriginalMap((prev) => {
      if (prev.has(selectedRequest.id)) return prev
      const next = new Map(prev)
      next.set(selectedRequest.id, selectedRequest)
      return next
    })
  }, [selectedRequest])

  const apply = useCallback(
    (op: DraftOp) => {
      setMap((prev) => {
        if (!selectedRequest) return prev
        return applyDraft(prev, selectedRequest.id, selectedRequest, op)
      })
    },
    [selectedRequest],
  )

  const setUrl = useCallback(
    (url: string) => apply({ kind: "setUrl", url }),
    [apply],
  )
  const setBody = useCallback(
    (body: string) => apply({ kind: "setBody", body }),
    [apply],
  )
  const setHeaderRow = useCallback(
    (index: number, key: string, value: string) =>
      apply({ kind: "setHeaderRow", index, key, value }),
    [apply],
  )
  const addHeaderRow = useCallback(
    (key: string, value: string) => apply({ kind: "addHeaderRow", key, value }),
    [apply],
  )
  const removeHeaderRow = useCallback(
    (index: number) => apply({ kind: "removeHeaderRow", index }),
    [apply],
  )
  const toggleHeaderRow = useCallback(
    (index: number) => apply({ kind: "toggleHeaderRow", index }),
    [apply],
  )
  const setParamRow = useCallback(
    (index: number, key: string, value: string) =>
      apply({ kind: "setParamRow", index, key, value }),
    [apply],
  )
  const addParamRow = useCallback(
    (key: string, value: string) => apply({ kind: "addParamRow", key, value }),
    [apply],
  )
  const removeParamRow = useCallback(
    (index: number) => apply({ kind: "removeParamRow", index }),
    [apply],
  )
  const toggleParamRow = useCallback(
    (index: number) => apply({ kind: "toggleParamRow", index }),
    [apply],
  )
  const revertField = useCallback(
    (field: FieldKind, row?: number) =>
      apply({ kind: "revertField", field, row }),
    [apply],
  )
  const revertAll = useCallback(() => apply({ kind: "revertAll" }), [apply])

  const mapRef = useRef(map)
  mapRef.current = map

  const markSaved = useCallback(() => {
    if (!selectedRequest) return
    const currentDraft =
      mapRef.current.get(selectedRequest.id) ?? selectedRequest
    setOriginalMap((prev) => {
      const next = new Map(prev)
      next.set(selectedRequest.id, { ...currentDraft })
      return next
    })
  }, [selectedRequest])

  const draft = selectedRequest
    ? (map.get(selectedRequest.id) ?? selectedRequest)
    : null
  const isDirty = selectedRequest
    ? !requestEquals(
        map.get(selectedRequest.id) ?? selectedRequest,
        originalMap.get(selectedRequest.id) ?? selectedRequest,
      )
    : false

  return useMemo(
    () => ({
      draft,
      isDirty,
      setUrl,
      setBody,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setParamRow,
      addParamRow,
      removeParamRow,
      toggleParamRow,
      revertField,
      revertAll,
      markSaved,
    }),
    [
      draft,
      isDirty,
      setUrl,
      setBody,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setParamRow,
      addParamRow,
      removeParamRow,
      toggleParamRow,
      revertField,
      revertAll,
      markSaved,
    ],
  )
}
