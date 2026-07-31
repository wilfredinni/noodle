import { useCallback, useEffect, useMemo, useState } from "react"
import type { Auth, Folder } from "../schema"
import {
  replaceRow,
  addRow,
  removeRow,
  toggleRow,
  recordsEqual,
  authEqual,
  defaultAuth,
  cacheSet,
} from "./draftUtils"

const authTypeCache = new Map<string, Record<string, Auth>>()

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

export function clearFolderAuthTypeCache(): void {
  authTypeCache.clear()
}

export function applyDraftOp(
  folder: Folder | null,
  op: FolderDraftOp,
  originalFolder: Folder | null = null,
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
    case "setAuthType": {
      const curAuth = draft.overrides?.auth
      if (curAuth && curAuth.type !== "none") {
        const idCache = authTypeCache.get(draft.path) ?? {}
        idCache[curAuth.type] = curAuth
        cacheSet(authTypeCache, draft.path, idCache)
      }
      const cached = authTypeCache.get(draft.path)?.[op.authType]
      if (cached && cached.type === op.authType) {
        draft.overrides = { ...draft.overrides, auth: { ...cached } }
      } else if (originalFolder?.overrides?.auth?.type === op.authType) {
        draft.overrides = {
          ...draft.overrides,
          auth: { ...originalFolder.overrides.auth },
        }
      } else {
        draft.overrides = { ...draft.overrides, auth: defaultAuth(op.authType) }
      }
      break
    }
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
  if (
    !authEqual(a.overrides?.auth, b.overrides?.auth, { treatNoneAsEqual: true })
  )
    return false
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
  markSaved: (folder: Folder) => void
  revertAllFolders: () => void
  clearFolderDraft: (path: string) => void
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
        const original = originalMap.get(key) ?? folder
        const result = applyDraftOp(current, op, original)
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
    [folder, key, originalMap],
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
  const markSaved = useCallback((savedFolder: Folder) => {
    setOriginalMap((prev) => {
      const next = new Map(prev)
      next.set(savedFolder.path, { ...savedFolder })
      return next
    })
    setDraftMap((prev) => {
      const currentDraft = prev.get(savedFolder.path)
      if (!currentDraft || !folderEqual(currentDraft, savedFolder)) return prev
      const next = new Map(prev)
      next.delete(savedFolder.path)
      authTypeCache.delete(savedFolder.path)
      return next
    })
  }, [])
  const revertAllFolders = useCallback(() => {
    authTypeCache.clear()
    setDraftMap(new Map())
  }, [])
  const clearFolderDraft = useCallback((path: string) => {
    authTypeCache.delete(path)
    setDraftMap((prev) => {
      const next = new Map(prev)
      next.delete(path)
      return next
    })
  }, [])

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
      revertAllFolders,
      clearFolderDraft,
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
      revertAllFolders,
      clearFolderDraft,
    ],
  )
}
