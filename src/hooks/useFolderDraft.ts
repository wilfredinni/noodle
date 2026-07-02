import { useCallback, useEffect, useMemo, useState } from "react"
import type { Auth, Folder, KvEntry } from "../schema"

export type FolderDraftOp =
  | { kind: "setName"; name: string }
  | { kind: "setSeq"; seq: number }
  | { kind: "setHeaderRow"; index: number; key: string; value: string }
  | { kind: "addHeaderRow"; key: string; value: string }
  | { kind: "removeHeaderRow"; index: number }
  | { kind: "toggleHeaderRow"; index: number }
  | { kind: "setAuthType"; authType: Auth["type"] }
  | { kind: "setAuthField"; authType: string; field: string; value: string }
  | { kind: "setApiKeyPlacement"; placement: "header" | "query" }
  | { kind: "revert" }
  | { kind: "markSaved" }

function replaceRow(
  rec: Record<string, KvEntry>,
  index: number,
  key: string,
  value: string,
): Record<string, KvEntry> {
  const entries = Object.entries(rec)
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
  const entries = Object.entries(rec)
  const target = entries[index]
  if (!target) return rec
  const out: Record<string, KvEntry> = {}
  for (const [k, v] of entries) if (k !== target[0]) out[k] = v
  return out
}

function toggleRow(
  rec: Record<string, KvEntry>,
  index: number,
): Record<string, KvEntry> {
  const entries = Object.entries(rec)
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

function authEqual(a: Auth | undefined, b: Auth | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) {
    const defined = a ?? b
    return defined!.type === "none"
  }
  if (a.type !== b.type) return false
  if (a.type === "none" && b.type === "none") return true
  if (a.type === "inherit" && b.type === "inherit") return true
  if (a.type === "bearer" && b.type === "bearer") return a.token === b.token
  if (a.type === "basic" && b.type === "basic") {
    return a.user === b.user && a.pass === b.pass
  }
  if (a.type === "api_key" && b.type === "api_key") {
    return a.key === b.key && a.value === b.value && a.placement === b.placement
  }
  return false
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

function defaultAuth(authType: Auth["type"]): Auth {
  switch (authType) {
    case "none":
      return { type: "none" }
    case "inherit":
      return { type: "inherit" }
    case "bearer":
      return { type: "bearer", token: "" }
    case "basic":
      return { type: "basic", user: "", pass: "" }
    case "api_key":
      return { type: "api_key", key: "", value: "", placement: "header" }
  }
}

export function applyDraftOp(
  folder: Folder | null,
  op: FolderDraftOp,
): Folder | null {
  if (!folder) return null
  if (op.kind === "revert") return null

  const draft: Folder = { ...folder }

  switch (op.kind) {
    case "setName":
      draft.name = op.name
      break
    case "setSeq":
      draft.seq = op.seq
      break
    case "addHeaderRow":
      draft.overrides = {
        ...draft.overrides,
        headers: addRow(draft.overrides?.headers ?? {}, op.key, op.value),
      }
      break
    case "removeHeaderRow":
      draft.overrides = {
        ...draft.overrides,
        headers: removeRow(draft.overrides?.headers ?? {}, op.index),
      }
      break
    case "toggleHeaderRow":
      draft.overrides = {
        ...draft.overrides,
        headers: toggleRow(draft.overrides?.headers ?? {}, op.index),
      }
      break
    case "setHeaderRow": {
      const { key, value } = op
      if (key === "") {
        draft.overrides = {
          ...draft.overrides,
          headers: removeRow(draft.overrides?.headers ?? {}, op.index),
        }
      } else {
        draft.overrides = {
          ...draft.overrides,
          headers: replaceRow(
            draft.overrides?.headers ?? {},
            op.index,
            key,
            value,
          ),
        }
      }
      break
    }
    case "setAuthType":
      draft.overrides = {
        ...draft.overrides,
        auth: defaultAuth(op.authType),
      }
      break
    case "setAuthField": {
      const currentAuth = draft.overrides?.auth
      if (!currentAuth || currentAuth.type !== op.authType) break
      if (currentAuth.type === "none") break
      draft.overrides = {
        ...draft.overrides,
        auth: { ...currentAuth, [op.field]: op.value },
      }
      break
    }
    case "setApiKeyPlacement": {
      const currentAuth = draft.overrides?.auth
      if (currentAuth?.type === "api_key") {
        draft.overrides = {
          ...draft.overrides,
          auth: { ...currentAuth, placement: op.placement },
        }
      }
      break
    }
    case "markSaved":
      return folder
  }

  return draft
}

export function folderEqual(a: Folder, b: Folder): boolean {
  if (a.name !== b.name) return false
  if (a.seq !== b.seq) return false
  if (!recordsEqual(a.overrides?.headers ?? {}, b.overrides?.headers ?? {}))
    return false
  if (!authEqual(a.overrides?.auth, b.overrides?.auth)) return false
  return true
}

export interface UseFolderDraftResult {
  folderDraft: Folder | null
  isDirty: boolean
  dirtyPaths: Set<string>
  originalFolder: Folder | null
  setName: (name: string) => void
  setSeq: (seq: number) => void
  setHeaderRow: (index: number, key: string, value: string) => void
  addHeaderRow: (key: string, value: string) => void
  removeHeaderRow: (index: number) => void
  toggleHeaderRow: (index: number) => void
  setAuthType: (authType: Auth["type"]) => void
  setAuthField: (authType: string, field: string, value: string) => void
  setApiKeyPlacement: (placement: "header" | "query") => void
  revertAll: () => void
  markSaved: () => void
}

export function useFolderDraft(folder: Folder | null): UseFolderDraftResult {
  const [draftMap, setDraftMap] = useState<Map<string, Folder>>(new Map())
  const [originalMap, setOriginalMap] = useState<Map<string, Folder>>(new Map())

  useEffect(() => {
    if (!folder) return
    setOriginalMap((prev) => {
      if (prev.has(folder.path)) return prev
      const next = new Map(prev)
      next.set(folder.path, folder)
      return next
    })
  }, [folder])

  const key = folder?.path ?? ""

  const folderDraft = folder ? (draftMap.get(key) ?? folder) : null

  const isDirty = folderDraft
    ? !folderEqual(folderDraft, originalMap.get(key) ?? folderDraft)
    : false

  const dirtyPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const [path, draft] of draftMap) {
      const orig = originalMap.get(path)
      if (!orig) continue
      if (!folderEqual(draft, orig)) {
        paths.add(path)
      }
    }
    return paths
  }, [draftMap, originalMap])

  const dispatch = useCallback(
    (op: FolderDraftOp) => {
      setDraftMap((prev) => {
        if (!folder) return prev
        const current = prev.get(key) ?? folder
        const result = applyDraftOp(current, op)
        if (result === null) {
          const next = new Map(prev)
          next.delete(key)
          return next
        }
        const next = new Map(prev)
        next.set(key, result)
        return next
      })
    },
    [folder, key],
  )

  const setName = useCallback(
    (name: string) => dispatch({ kind: "setName", name }),
    [dispatch],
  )
  const setSeq = useCallback(
    (seq: number) => dispatch({ kind: "setSeq", seq }),
    [dispatch],
  )
  const setHeaderRow = useCallback(
    (index: number, key: string, value: string) =>
      dispatch({ kind: "setHeaderRow", index, key, value }),
    [dispatch],
  )
  const addHeaderRow = useCallback(
    (key: string, value: string) =>
      dispatch({ kind: "addHeaderRow", key, value }),
    [dispatch],
  )
  const removeHeaderRow = useCallback(
    (index: number) => dispatch({ kind: "removeHeaderRow", index }),
    [dispatch],
  )
  const toggleHeaderRow = useCallback(
    (index: number) => dispatch({ kind: "toggleHeaderRow", index }),
    [dispatch],
  )
  const setAuthType = useCallback(
    (authType: Auth["type"]) => dispatch({ kind: "setAuthType", authType }),
    [dispatch],
  )
  const setAuthField = useCallback(
    (authType: string, field: string, value: string) =>
      dispatch({ kind: "setAuthField", authType, field, value }),
    [dispatch],
  )
  const setApiKeyPlacement = useCallback(
    (placement: "header" | "query") =>
      dispatch({ kind: "setApiKeyPlacement", placement }),
    [dispatch],
  )
  const revertAll = useCallback(() => dispatch({ kind: "revert" }), [dispatch])
  const markSaved = useCallback(() => {
    if (!folderDraft || !folder) return
    setOriginalMap((prev) => {
      const next = new Map(prev)
      next.set(key, { ...folderDraft })
      return next
    })
    setDraftMap((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [folderDraft, folder, key])

  return useMemo(
    () => ({
      folderDraft,
      isDirty,
      dirtyPaths,
      originalFolder: originalMap.get(key) ?? null,
      setName,
      setSeq,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setAuthType,
      setAuthField,
      setApiKeyPlacement,
      revertAll,
      markSaved,
    }),
    [
      folderDraft,
      isDirty,
      dirtyPaths,
      originalMap,
      key,
      setName,
      setSeq,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setAuthType,
      setAuthField,
      setApiKeyPlacement,
      revertAll,
      markSaved,
    ],
  )
}
