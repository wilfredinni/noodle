import type { CollectionItem, Environment, Folder, Request } from "../schema"
import { flattenRequests } from "./tree"
import { effectiveRequestTags } from "../tags"

const VAR_RE = /\$(\w+)/g

export type FinderItem =
  | {
      type: "request"
      id: string
      name: string
      folderPath: string
      request: Request
      resolvedUrl: string
      tags: string[]
    }
  | {
      type: "folder"
      id: string
      name: string
      folderPath: string
      folder: Folder
      requestCount: number
    }

export type RequestFinderItem = FinderItem

export function resolveFinderUrl(
  url: string,
  activeEnv: Environment | null,
): string {
  if (activeEnv === null) return url
  return url.replace(VAR_RE, (match, name: string) => {
    if (Object.hasOwn(activeEnv.secretVars ?? {}, name)) return match
    return Object.hasOwn(activeEnv.vars, name) ? activeEnv.vars[name]! : match
  })
}

function fuzzyMatch(value: string, token: string): boolean {
  let tokenIndex = 0
  for (const char of value) {
    if (char === token[tokenIndex]) tokenIndex += 1
    if (tokenIndex === token.length) return true
  }
  return token.length === 0
}

function fieldRank(value: string, token: string, weight: number): number {
  return weight + value.indexOf(token)
}

function scoreItem(item: FinderItem, tokens: string[]): number | null {
  const fields: { value: string; weight: number; fuzzy?: boolean }[] =
    item.type === "request"
      ? [
          { value: item.request.name.toLowerCase(), weight: 0, fuzzy: true },
          { value: item.request.id.toLowerCase(), weight: 100, fuzzy: true },
          { value: item.request.method.toLowerCase(), weight: 200 },
          {
            value: item.tags
              .map((tag) => `#${tag}`)
              .join(" ")
              .toLowerCase(),
            weight: 200,
          },
          { value: item.request.url.toLowerCase(), weight: 300 },
          { value: item.resolvedUrl.toLowerCase(), weight: 300 },
        ]
      : [
          { value: item.folder.name.toLowerCase(), weight: 0, fuzzy: true },
          { value: item.folder.path.toLowerCase(), weight: 100, fuzzy: true },
          { value: "folder", weight: 200 },
          { value: "dir", weight: 200 },
          { value: item.folderPath.toLowerCase(), weight: 300 },
        ]

  let score = 0

  for (const token of tokens) {
    const direct = fields.find((field) => field.value.includes(token))
    if (direct) {
      score += fieldRank(direct.value, token, direct.weight)
      continue
    }
    const fuzzy = fields.find(
      (field) => field.fuzzy && fuzzyMatch(field.value, token),
    )
    if (!fuzzy) return null
    score += fuzzy.weight * 10 + fuzzy.value.length
  }
  return score
}

function collectFolderFinderItems(
  items: CollectionItem[],
  out: FinderItem[] = [],
): FinderItem[] {
  for (const item of items) {
    if (item.type === "folder") {
      const f = item.data
      const parentPath = f.path.includes("/")
        ? f.path.slice(0, f.path.lastIndexOf("/"))
        : "(root)"
      const reqs = flattenRequests(f.children)
      out.push({
        type: "folder",
        id: f.path,
        name: f.name,
        folderPath: parentPath,
        folder: f,
        requestCount: reqs.length,
      })
      collectFolderFinderItems(f.children, out)
    }
  }
  return out
}

export function requestFinderItems(
  input: CollectionItem[] | Request[],
  activeEnv: Environment | null = null,
): FinderItem[] {
  if (input.length === 0) return []

  const first = input[0]!
  if (
    "type" in first &&
    (first.type === "request" || first.type === "folder")
  ) {
    const items = input as CollectionItem[]
    const reqs = flattenRequests(items)
    const tagsByRequest = effectiveRequestTags(items)
    const reqItems: FinderItem[] = reqs.map((request) => ({
      type: "request",
      id: request.id,
      name: request.name,
      folderPath: request.id.includes("/")
        ? request.id.slice(0, request.id.lastIndexOf("/"))
        : "(root)",
      request,
      resolvedUrl: resolveFinderUrl(request.url, activeEnv),
      tags: [...(tagsByRequest.get(request.id) ?? [])],
    }))
    const folderItems = collectFolderFinderItems(items)
    return [...reqItems, ...folderItems]
  }

  const reqs = input as Request[]
  return reqs.map((request) => ({
    type: "request",
    id: request.id,
    name: request.name,
    folderPath: request.id.includes("/")
      ? request.id.slice(0, request.id.lastIndexOf("/"))
      : "(root)",
    request,
    resolvedUrl: resolveFinderUrl(request.url, activeEnv),
    tags: [...(request.tags ?? [])],
  }))
}

export function searchRequests(
  items: FinderItem[],
  query: string,
): FinderItem[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return items

  return items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter(
      (result): result is { item: FinderItem; score: number } =>
        result.score !== null,
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.item.name.localeCompare(b.item.name) ||
        a.item.id.localeCompare(b.item.id),
    )
    .map((result) => result.item)
}
