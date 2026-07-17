import type { Request } from "../schema"

export interface RequestFinderItem {
  request: Request
  folderPath: string
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
  const index = value.indexOf(token)
  if (index >= 0) return weight + index
  return weight * 10 + value.length
}

function scoreRequest(request: Request, tokens: string[]): number | null {
  const fields = [
    { value: request.name.toLowerCase(), weight: 0 },
    { value: request.id.toLowerCase(), weight: 100 },
    { value: request.method.toLowerCase(), weight: 200 },
    { value: request.url.toLowerCase(), weight: 300 },
  ]
  let score = 0

  for (const token of tokens) {
    const direct = fields.find((field) => field.value.includes(token))
    if (direct) {
      score += fieldRank(direct.value, token, direct.weight)
      continue
    }
    const fuzzy = fields.find((field) => fuzzyMatch(field.value, token))
    if (!fuzzy) return null
    score += fuzzy.weight * 10 + fuzzy.value.length
  }
  return score
}

export function requestFinderItems(requests: Request[]): RequestFinderItem[] {
  return requests.map((request) => ({
    request,
    folderPath: request.id.includes("/")
      ? request.id.slice(0, request.id.lastIndexOf("/"))
      : "(root)",
  }))
}

export function searchRequests(
  items: RequestFinderItem[],
  query: string,
): RequestFinderItem[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return items

  return items
    .map((item) => ({ item, score: scoreRequest(item.request, tokens) }))
    .filter(
      (result): result is { item: RequestFinderItem; score: number } =>
        result.score !== null,
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.item.request.name.localeCompare(b.item.request.name) ||
        a.item.request.id.localeCompare(b.item.request.id),
    )
    .map((result) => result.item)
}
