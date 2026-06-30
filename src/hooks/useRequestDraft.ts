import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Request, Auth, Method, KvEntry } from "../schema"
import type { FieldKind } from "../ui/editMode"
import { parseUrlAndParams } from "../ui/urlParams"

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
  | { kind: "syncUrlParams"; rawUrl: string }
  | { kind: "setTimeout"; timeout: number }
  | { kind: "setFollowRedirects"; followRedirects: boolean }
  | { kind: "setMaxRedirects"; maxRedirects: number }
  | { kind: "revertField"; field: FieldKind; row?: number }
  | { kind: "revertAll" }
  | { kind: "setAuthType"; authType: "none" | "bearer" | "basic" | "api_key" }
  | { kind: "setAuthField"; authType: string; field: string; value: string }
  | { kind: "setApiKeyPlacement"; placement: "header" | "query" }

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
  if (a.type === "api_key" && b.type === "api_key") {
    return a.key === b.key && a.value === b.value && a.placement === b.placement
  }
  return false
}

export function requestEquals(a: Request, b: Request): boolean {
  if (a.url !== b.url) return false
  if (a.method !== b.method) return false
  if (a.timeout !== b.timeout) return false
  if (a.followRedirects !== b.followRedirects) return false
  if (a.maxRedirects !== b.maxRedirects) return false
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
    case "syncUrlParams": {
      const parsed = parseUrlAndParams(op.rawUrl)
      draft.url = parsed.baseUrl
      draft.params = parsed.params
      break
    }
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
    case "setTimeout":
      draft.timeout = op.timeout
      break
    case "setFollowRedirects":
      draft.followRedirects = op.followRedirects
      break
    case "setMaxRedirects":
      draft.maxRedirects = op.maxRedirects
      break
    case "setAuthType": {
      if (op.authType === "none") {
        draft.auth = { type: "none" }
      } else if (op.authType === "bearer") {
        draft.auth = { type: "bearer", token: "" }
      } else if (op.authType === "basic") {
        draft.auth = { type: "basic", user: "", pass: "" }
      } else if (op.authType === "api_key") {
        draft.auth = {
          type: "api_key",
          key: "",
          value: "",
          placement: "header",
        }
      }
      break
    }
    case "setAuthField": {
      const currentAuth = draft.auth
      if (!currentAuth || currentAuth.type !== op.authType) break
      if (currentAuth.type === "none") break
      ;(currentAuth as Record<string, unknown>)[op.field] = op.value
      break
    }
    case "setApiKeyPlacement": {
      const currentAuth = draft.auth
      if (currentAuth?.type === "api_key") {
        ;(currentAuth as { placement: "header" | "query" }).placement =
          op.placement
      }
      break
    }
    case "revertField": {
      if (op.field === "body") draft.body = original.body
      else if (op.field === "settings") {
        draft.timeout = original.timeout
        draft.followRedirects = original.followRedirects
        draft.maxRedirects = original.maxRedirects
      } else if (op.field === "headers" && op.row !== undefined) {
        draft.headers = revertRow(current.headers, original.headers, op.row)
      } else if (op.field === "params" && op.row !== undefined) {
        draft.params = revertRow(current.params, original.params, op.row)
      } else if (op.field === "auth") {
        if (op.row === undefined || op.row === 0) {
          draft.auth = original.auth
        }
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
  dirtyRequestIds: Set<string>
  setUrl: (url: string) => void
  syncUrlParams: (rawUrl: string) => void
  setBody: (body: string) => void
  setHeaderRow: (index: number, key: string, value: string) => void
  addHeaderRow: (key: string, value: string) => void
  removeHeaderRow: (index: number) => void
  toggleHeaderRow: (index: number) => void
  setParamRow: (index: number, key: string, value: string) => void
  addParamRow: (key: string, value: string) => void
  removeParamRow: (index: number) => void
  toggleParamRow: (index: number) => void
  setTimeout: (t: number) => void
  setFollowRedirects: (b: boolean) => void
  setMaxRedirects: (n: number) => void
  revertField: (field: FieldKind, row?: number) => void
  revertAll: () => void
  setAuthType: (t: "none" | "bearer" | "basic" | "api_key") => void
  setAuthField: (authType: string, field: string, value: string) => void
  setApiKeyPlacement: (placement: "header" | "query") => void
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
  const syncUrlParams = useCallback(
    (rawUrl: string) => apply({ kind: "syncUrlParams", rawUrl }),
    [apply],
  )
  const setBody = useCallback(
    (body: string) => apply({ kind: "setBody", body }),
    [apply],
  )
  const setTimeoutCb = useCallback(
    (timeout: number) => apply({ kind: "setTimeout", timeout }),
    [apply],
  )
  const setFollowRedirects = useCallback(
    (followRedirects: boolean) =>
      apply({ kind: "setFollowRedirects", followRedirects }),
    [apply],
  )
  const setMaxRedirects = useCallback(
    (maxRedirects: number) => apply({ kind: "setMaxRedirects", maxRedirects }),
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
  const setAuthTypeCb = useCallback(
    (authType: "none" | "bearer" | "basic" | "api_key") =>
      apply({ kind: "setAuthType", authType }),
    [apply],
  )
  const setAuthFieldCb = useCallback(
    (authType: string, field: string, value: string) =>
      apply({ kind: "setAuthField", authType, field, value }),
    [apply],
  )
  const setApiKeyPlacementCb = useCallback(
    (placement: "header" | "query") =>
      apply({ kind: "setApiKeyPlacement", placement }),
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

  const dirtyRequestIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [id, draft] of map) {
      const original = originalMap.get(id)
      if (!original) continue
      if (!requestEquals(draft, original)) {
        ids.add(id)
      }
    }
    return ids
  }, [map, originalMap])

  return useMemo(
    () => ({
      draft,
      isDirty,
      dirtyRequestIds,
      setUrl,
      syncUrlParams,
      setBody,
      setTimeout: setTimeoutCb,
      setFollowRedirects,
      setMaxRedirects,
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
      setAuthType: setAuthTypeCb,
      setAuthField: setAuthFieldCb,
      setApiKeyPlacement: setApiKeyPlacementCb,
      markSaved,
    }),
    [
      draft,
      isDirty,
      dirtyRequestIds,
      setUrl,
      syncUrlParams,
      setBody,
      setTimeoutCb,
      setFollowRedirects,
      setMaxRedirects,
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
      setAuthTypeCb,
      setAuthFieldCb,
      setApiKeyPlacementCb,
      markSaved,
    ],
  )
}
