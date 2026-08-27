import type {
  BodyType,
  FormEntry,
  Request,
  Auth,
  ResponseAssertion,
} from "../schema"
import type { FieldKind } from "../ui/editMode"
import { syncParamsWithUrl, syncPathParamsWithUrl } from "../ui/urlParams"
import {
  replaceRow,
  addRow,
  removeRow,
  toggleRow,
  revertRow,
  replaceParam,
  addParam,
  removeParam,
  revertParam,
  toggleParam,
  cacheSet,
  defaultAuth,
} from "./draftUtils"
import type { Method } from "../schema"
import { updateAuthField } from "../ui/authRows"

export type DraftOp =
  | { kind: "setMethod"; method: Method }
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
  | { kind: "setPathParamRow"; index: number; key: string; value: string }
  | { kind: "addPathParamRow"; key: string; value: string }
  | { kind: "removePathParamRow"; index: number }
  | { kind: "togglePathParamRow"; index: number }
  | { kind: "syncUrlParams"; rawUrl: string }
  | { kind: "setTimeout"; timeout: number }
  | { kind: "setFollowRedirects"; followRedirects: boolean }
  | { kind: "setMaxRedirects"; maxRedirects: number }
  | { kind: "setSendCookies"; sendCookies: boolean }
  | { kind: "setTlsVerify"; verify?: boolean }
  | { kind: "revertField"; field: FieldKind; row?: number }
  | { kind: "revertAll" }
  | { kind: "setAuthType"; authType: Auth["type"] }
  | {
      kind: "setAuthField"
      authType: string
      field: string
      value: string | boolean | number
    }
  | { kind: "setApiKeyPlacement"; placement: "header" | "query" }
  | { kind: "setBodyType"; bodyType: BodyType }
  | {
      kind: "setFormRow"
      index: number
      name: string
      value: string
      formType: "text" | "file"
    }
  | {
      kind: "addFormRow"
      name: string
      value: string
      formType: "text" | "file"
    }
  | { kind: "removeFormRow"; index: number }
  | { kind: "toggleFormRow"; index: number }
  | { kind: "setFilePath"; filePath: string }
  | { kind: "setTags"; tags: string[] }
  | { kind: "setCaptures"; captures: Record<string, string> }
  | { kind: "setAssertions"; assertions: ResponseAssertion[] }

const authTypeCache = new Map<string, Record<string, Auth>>()

interface CachedBody {
  body?: string
  formData?: FormEntry[]
  filePath?: string
}
const bodyCache = new Map<string, Record<string, CachedBody>>()

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
    case "setMethod":
      draft.method = op.method
      break
    case "setUrl": {
      const synced = syncParamsWithUrl(current.params, op.url)
      draft.url = synced.baseUrl
      draft.params = synced.params
      draft.pathParams = syncPathParamsWithUrl(current.pathParams ?? [], op.url)
      break
    }
    case "syncUrlParams": {
      const synced = syncParamsWithUrl(current.params, op.rawUrl)
      draft.url = synced.baseUrl
      draft.params = synced.params
      draft.pathParams = syncPathParamsWithUrl(
        current.pathParams ?? [],
        op.rawUrl,
      )
      break
    }
    case "setBody":
      draft.body = op.body
      break
    case "setBodyType": {
      const normalizedCurrent = draft.bodyType ?? "json"
      const normalizedOp = op.bodyType ?? "json"
      if (normalizedOp !== normalizedCurrent) {
        const curBodyType = draft.bodyType ?? "json"
        const idCache = bodyCache.get(id) ?? {}
        idCache[curBodyType] = {
          body: draft.body,
          formData: draft.formData,
          filePath: draft.filePath,
        }
        cacheSet(bodyCache, id, idCache)

        draft.bodyType = op.bodyType
        const cached = bodyCache.get(id)?.[normalizedOp]
        if (cached) {
          draft.body = cached.body
          draft.formData = cached.formData
          draft.filePath = cached.filePath
        } else {
          draft.body = undefined
          draft.formData = undefined
          draft.filePath = undefined
        }
      }
      break
    }
    case "setFormRow":
      draft.formData = current.formData ?? []
      if (draft.formData[op.index]) {
        draft.formData = draft.formData.map((e, i) =>
          i === op.index
            ? {
                name: op.name,
                value: op.value,
                enabled: e.enabled,
                type: op.formType,
              }
            : e,
        )
      }
      break
    case "addFormRow":
      draft.formData = [
        ...(current.formData ?? []),
        { name: op.name, value: op.value, enabled: true, type: op.formType },
      ]
      break
    case "removeFormRow":
      draft.formData = (current.formData ?? []).filter((_, i) => i !== op.index)
      break
    case "toggleFormRow":
      draft.formData = (current.formData ?? []).map((e, i) =>
        i === op.index ? { ...e, enabled: !e.enabled } : e,
      )
      break
    case "setFilePath":
      draft.filePath = op.filePath
      break
    case "setTags":
      draft.tags = op.tags.length > 0 ? op.tags : undefined
      break
    case "setCaptures":
      draft.captures =
        Object.keys(op.captures).length > 0 ? op.captures : undefined
      break
    case "setAssertions":
      draft.assertions = op.assertions.length > 0 ? op.assertions : undefined
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
      draft.params = replaceParam(current.params, op.index, key, value)
      break
    }
    case "addParamRow":
      draft.params = addParam(current.params, op.key, op.value)
      break
    case "removeParamRow":
      draft.params = removeParam(current.params, op.index)
      break
    case "toggleParamRow":
      draft.params = toggleParam(current.params, op.index)
      break
    case "setPathParamRow": {
      const pathParams = syncPathParamsWithUrl(
        current.pathParams ?? [],
        current.url,
      )
      draft.pathParams = replaceParam(pathParams, op.index, op.key, op.value)
      break
    }
    case "addPathParamRow":
      draft.pathParams = addParam(current.pathParams ?? [], op.key, op.value)
      break
    case "removePathParamRow":
      draft.pathParams = removeParam(current.pathParams ?? [], op.index)
      break
    case "togglePathParamRow":
      draft.pathParams = toggleParam(current.pathParams ?? [], op.index)
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
    case "setSendCookies":
      draft.sendCookies = op.sendCookies
      break
    case "setTlsVerify":
      draft.tls = op.verify === undefined ? undefined : { verify: op.verify }
      break
    case "setAuthType": {
      const curAuth = current.auth
      if (curAuth && curAuth.type !== "none") {
        const idCache = authTypeCache.get(id) ?? {}
        idCache[curAuth.type] = curAuth
        cacheSet(authTypeCache, id, idCache)
      }
      const cached = authTypeCache.get(id)?.[op.authType]
      if (cached && cached.type === op.authType) {
        draft.auth = { ...cached }
      } else if (original.auth?.type === op.authType) {
        draft.auth = { ...original.auth }
      } else {
        draft.auth = defaultAuth(op.authType)
      }
      break
    }
    case "setAuthField": {
      const currentAuth = draft.auth
      if (!currentAuth || currentAuth.type !== op.authType) break
      if (currentAuth.type === "none") break
      draft.auth = updateAuthField(currentAuth, op.field, op.value)
      break
    }
    case "setApiKeyPlacement": {
      const currentAuth = draft.auth
      if (currentAuth?.type === "api_key") {
        draft.auth = { ...currentAuth, placement: op.placement }
      }
      break
    }
    case "revertField": {
      if (op.field === "body") {
        draft.body = original.body
        draft.bodyType = original.bodyType
        draft.formData = original.formData
        draft.filePath = original.filePath
      } else if (op.field === "settings") {
        draft.timeout = original.timeout
        draft.followRedirects = original.followRedirects
        draft.maxRedirects = original.maxRedirects
        draft.sendCookies = original.sendCookies
        draft.tls = original.tls
      } else if (op.field === "headers" && op.row !== undefined) {
        draft.headers = revertRow(current.headers, original.headers, op.row)
      } else if (op.field === "params" && op.row !== undefined) {
        draft.params = revertParam(current.params, original.params, op.row)
      } else if (op.field === "pathParams" && op.row !== undefined) {
        const pathParams = syncPathParamsWithUrl(
          current.pathParams ?? [],
          current.url,
        )
        const entry = pathParams[op.row]
        if (entry) {
          const originalEntry = (original.pathParams ?? []).find(
            (param) => param.name === entry.name,
          )
          draft.pathParams = originalEntry
            ? pathParams.map((param, i) =>
                i === op.row
                  ? { ...originalEntry, name: entry.name, enabled: true }
                  : param,
              )
            : pathParams.filter((param) => param.name !== entry.name)
        }
      } else if (op.field === "auth") {
        if (op.row === undefined || op.row === 0) {
          draft.auth = original.auth
        }
      } else if (op.field === "assertions") {
        draft.assertions = original.assertions
      } else if (op.field === "captures") {
        draft.captures = original.captures
      }
      break
    }
  }
  next.set(id, draft)
  return next
}

export function clearRequestDraftCaches(id?: string): void {
  if (id !== undefined) {
    authTypeCache.delete(id)
    bodyCache.delete(id)
  } else {
    authTypeCache.clear()
    bodyCache.clear()
  }
}
