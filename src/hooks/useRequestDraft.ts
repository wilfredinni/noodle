import { useCallback, useEffect, useMemo, useState } from "react"
import type { Auth, Method, Request } from "../schema"
import type { BodyType } from "../schema"
import type { FieldKind } from "../ui/editMode"
import { requestEquals, removeRequestDraftEntry } from "./draftUtils"
import { applyDraft, clearRequestDraftCaches } from "./requestDraftReducer"
import type { DraftOp } from "./requestDraftReducer"

export type { DraftOp, Method, Request }

export { parseRow, requestEquals, removeRequestDraftEntry } from "./draftUtils"
export { applyDraft, clearRequestDraftCaches } from "./requestDraftReducer"

export interface UseRequestDraftResult {
  draft: Request | null
  isDirty: boolean
  dirtyRequestIds: Set<string>
  setMethod: (method: Method) => void
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
  setPathParamRow: (index: number, key: string, value: string) => void
  addPathParamRow: (key: string, value: string) => void
  removePathParamRow: (index: number) => void
  togglePathParamRow: (index: number) => void
  setTimeout: (t: number) => void
  setFollowRedirects: (b: boolean) => void
  setMaxRedirects: (n: number) => void
  setTlsVerify: (verify?: boolean) => void
  revertField: (field: FieldKind, row?: number) => void
  revertAll: () => void
  setAuthType: (t: Auth["type"]) => void
  setAuthField: (authType: string, field: string, value: string) => void
  setApiKeyPlacement: (placement: "header" | "query") => void
  setBodyType: (t: BodyType) => void
  setFormRow: (
    index: number,
    name: string,
    value: string,
    formType: "text" | "file",
  ) => void
  addFormRow: (name: string, value: string, formType: "text" | "file") => void
  removeFormRow: (index: number) => void
  toggleFormRow: (index: number) => void
  setFilePath: (path: string) => void
  markSaved: (request: Request) => void
  moveRequestDraft: (oldId: string, request: Request) => void
  resetRequestDraft: (id: string) => void
  revertAllRequests: () => void
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
      if (!selectedRequest) return
      setOriginalMap((prev) => {
        if (prev.has(selectedRequest.id)) return prev
        const next = new Map(prev)
        next.set(selectedRequest.id, selectedRequest)
        return next
      })
      setMap((prev) => {
        return applyDraft(prev, selectedRequest.id, selectedRequest, op)
      })
    },
    [selectedRequest],
  )

  const setUrl = useCallback(
    (url: string) => apply({ kind: "setUrl", url }),
    [apply],
  )
  const setMethod = useCallback(
    (method: Method) => apply({ kind: "setMethod", method }),
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
  const setTlsVerify = useCallback(
    (verify?: boolean) => apply({ kind: "setTlsVerify", verify }),
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
  const setPathParamRow = useCallback(
    (index: number, key: string, value: string) =>
      apply({ kind: "setPathParamRow", index, key, value }),
    [apply],
  )
  const addPathParamRow = useCallback(
    (key: string, value: string) =>
      apply({ kind: "addPathParamRow", key, value }),
    [apply],
  )
  const removePathParamRow = useCallback(
    (index: number) => apply({ kind: "removePathParamRow", index }),
    [apply],
  )
  const togglePathParamRow = useCallback(
    (index: number) => apply({ kind: "togglePathParamRow", index }),
    [apply],
  )
  const setAuthTypeCb = useCallback(
    (authType: Auth["type"]) => apply({ kind: "setAuthType", authType }),
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
  const setBodyTypeCb = useCallback(
    (bodyType: BodyType) => apply({ kind: "setBodyType", bodyType }),
    [apply],
  )
  const setFormRowCb = useCallback(
    (index: number, name: string, value: string, formType: "text" | "file") =>
      apply({ kind: "setFormRow", index, name, value, formType }),
    [apply],
  )
  const addFormRowCb = useCallback(
    (name: string, value: string, formType: "text" | "file") =>
      apply({ kind: "addFormRow", name, value, formType }),
    [apply],
  )
  const removeFormRowCb = useCallback(
    (index: number) => apply({ kind: "removeFormRow", index }),
    [apply],
  )
  const toggleFormRowCb = useCallback(
    (index: number) => apply({ kind: "toggleFormRow", index }),
    [apply],
  )
  const setFilePathCb = useCallback(
    (filePath: string) => apply({ kind: "setFilePath", filePath }),
    [apply],
  )
  const revertField = useCallback(
    (field: FieldKind, row?: number) =>
      apply({ kind: "revertField", field, row }),
    [apply],
  )
  const revertAll = useCallback(() => apply({ kind: "revertAll" }), [apply])

  const revertAllRequests = useCallback(() => {
    clearRequestDraftCaches()
    setMap(new Map())
    setOriginalMap(new Map())
  }, [])

  const markSaved = useCallback((request: Request) => {
    setOriginalMap((prev) => {
      const next = new Map(prev)
      next.set(request.id, { ...request })
      return next
    })
    setMap((prev) => {
      const currentDraft = prev.get(request.id)
      if (!currentDraft || !requestEquals(currentDraft, request)) return prev
      clearRequestDraftCaches(request.id)
      return removeRequestDraftEntry(prev, request.id)
    })
  }, [])

  const moveRequestDraft = useCallback(
    (oldId: string, request: Request) => {
      clearRequestDraftCaches(oldId)
      clearRequestDraftCaches(request.id)
      const original = originalMap.get(oldId)
      setMap((prev) => {
        const draft = prev.get(oldId)
        const next = new Map(prev)
        next.delete(oldId)
        if (draft) {
          next.set(request.id, {
            ...draft,
            id: request.id,
            name: request.name,
            method:
              original && draft.method === original.method
                ? request.method
                : draft.method,
            url:
              original && draft.url === original.url ? request.url : draft.url,
          })
        }
        return next
      })
      setOriginalMap((prev) => {
        const next = new Map(prev)
        next.delete(oldId)
        next.set(request.id, { ...request })
        return next
      })
    },
    [originalMap],
  )

  const resetRequestDraft = useCallback((id: string) => {
    clearRequestDraftCaches(id)
    setMap((prev) => removeRequestDraftEntry(prev, id))
    setOriginalMap((prev) => removeRequestDraftEntry(prev, id))
  }, [])

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
      setMethod,
      setUrl,
      syncUrlParams,
      setBody,
      setTimeout: setTimeoutCb,
      setFollowRedirects,
      setMaxRedirects,
      setTlsVerify,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setParamRow,
      addParamRow,
      removeParamRow,
      toggleParamRow,
      setPathParamRow,
      addPathParamRow,
      removePathParamRow,
      togglePathParamRow,
      revertField,
      revertAll,
      revertAllRequests,
      setAuthType: setAuthTypeCb,
      setAuthField: setAuthFieldCb,
      setApiKeyPlacement: setApiKeyPlacementCb,
      setBodyType: setBodyTypeCb,
      setFormRow: setFormRowCb,
      addFormRow: addFormRowCb,
      removeFormRow: removeFormRowCb,
      toggleFormRow: toggleFormRowCb,
      setFilePath: setFilePathCb,
      markSaved,
      moveRequestDraft,
      resetRequestDraft,
    }),
    [
      draft,
      isDirty,
      dirtyRequestIds,
      setMethod,
      setUrl,
      syncUrlParams,
      setBody,
      setTimeoutCb,
      setFollowRedirects,
      setMaxRedirects,
      setTlsVerify,
      setHeaderRow,
      addHeaderRow,
      removeHeaderRow,
      toggleHeaderRow,
      setParamRow,
      addParamRow,
      removeParamRow,
      toggleParamRow,
      setPathParamRow,
      addPathParamRow,
      removePathParamRow,
      togglePathParamRow,
      revertField,
      revertAll,
      revertAllRequests,
      setAuthTypeCb,
      setAuthFieldCb,
      setApiKeyPlacementCb,
      setBodyTypeCb,
      setFormRowCb,
      addFormRowCb,
      removeFormRowCb,
      toggleFormRowCb,
      setFilePathCb,
      markSaved,
      moveRequestDraft,
      resetRequestDraft,
    ],
  )
}
