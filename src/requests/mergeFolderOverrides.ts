import type { Auth, Collection, Folder, KvEntry, Request } from "../schema"
import { findFolderByPath } from "../ui/tree"

function mergeKv(
  base: Record<string, KvEntry>,
  overrides: Record<string, KvEntry>,
  requestKeys: Record<string, KvEntry>,
): Record<string, KvEntry> {
  const result: Record<string, KvEntry> = { ...base }
  for (const [key, entry] of Object.entries(overrides)) {
    if (!(key in requestKeys)) {
      result[key] = entry
    }
  }
  return result
}

export function mergeFolderOverrides(
  request: Request,
  collection: Collection,
  requestPath: string,
): Request {
  const parts = requestPath.split("/")

  if (parts.length <= 1) return request

  const segments: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    segments.push(parts.slice(0, i + 1).join("/"))
  }

  const folders: Folder[] = []
  for (const seg of segments) {
    const folder = findFolderByPath(collection.items, seg)
    if (folder) folders.push(folder)
  }

  if (folders.length === 0) return request

  let mergedHeaders: Record<string, KvEntry> = {}
  let mergedParams: Record<string, KvEntry> = {}

  for (const folder of folders) {
    if (folder.overrides?.headers) {
      mergedHeaders = mergeKv(mergedHeaders, folder.overrides.headers, request.headers)
    }
    if (folder.overrides?.params) {
      mergedParams = mergeKv(mergedParams, folder.overrides.params, request.params)
    }
  }

  let mergedAuth: Auth = { type: "none" }
  for (const folder of folders) {
    if (folder.overrides?.auth && folder.overrides.auth.type !== "none") {
      mergedAuth = folder.overrides.auth
    }
  }

  const requestAuth = request.auth ?? { type: "none" }
  if (requestAuth.type !== "none") {
    mergedAuth = requestAuth
  }

  return {
    ...request,
    headers: { ...mergedHeaders, ...request.headers },
    params: { ...mergedParams, ...request.params },
    auth: mergedAuth,
  }
}
