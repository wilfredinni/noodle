import type { ParamEntry } from "../schema"
import { parsePathToken } from "../requests/pathParams"

export function buildDisplayUrl(url: string, params: ParamEntry[]): string {
  if (!url) return url

  let baseUrl: string
  const existingParams: Array<[string, string]> = []

  try {
    const u = new URL(url)
    baseUrl = normBaseUrl(u.origin, u.pathname)
    u.searchParams.forEach((v, k) => {
      existingParams.push([k, v])
    })
  } catch {
    const questionIdx = url.indexOf("?")
    if (questionIdx !== -1) {
      baseUrl = url.slice(0, questionIdx)
      try {
        const sp = new URLSearchParams(url.slice(questionIdx + 1))
        sp.forEach((v, k) => existingParams.push([k, v]))
      } catch {
        return url
      }
    } else {
      baseUrl = url
    }
  }

  const paramKeys = new Set<string>()
  for (const entry of params) {
    paramKeys.add(entry.name)
  }

  const merged: Array<[string, string]> = []

  for (const [k, v] of existingParams) {
    if (!paramKeys.has(k)) {
      merged.push([k, v])
    }
  }

  for (const entry of params) {
    if (!entry.enabled) continue
    merged.push([entry.name, entry.value])
  }

  if (merged.length === 0) return baseUrl

  const qs = merged.map(([k, v]) => `${encQuery(k)}=${encQuery(v)}`).join("&")
  return `${baseUrl}?${qs}`
}

function encQuery(s: string): string {
  return s.replace(
    /[&#]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

export function parseUrlAndParams(raw: string): {
  baseUrl: string
  params: ParamEntry[]
} {
  if (!raw) return { baseUrl: raw, params: [] }

  try {
    const u = new URL(raw)
    const baseUrl = normBaseUrl(u.origin, u.pathname)
    const params: ParamEntry[] = []
    u.searchParams.forEach((v, k) => {
      params.push({ name: k, value: v, enabled: true })
    })
    return { baseUrl, params }
  } catch {
    const questionIdx = raw.indexOf("?")
    if (questionIdx === -1) return { baseUrl: raw, params: [] }
    const baseUrl = raw.slice(0, questionIdx)
    const qs = raw.slice(questionIdx + 1)
    const params: ParamEntry[] = []
    if (qs) {
      try {
        const sp = new URLSearchParams(qs)
        sp.forEach((v, k) => {
          params.push({ name: k, value: v, enabled: true })
        })
      } catch {
        return { baseUrl, params: [] }
      }
    }
    return { baseUrl, params }
  }
}

export function syncParamsWithUrl(
  currentParams: ParamEntry[],
  rawUrl: string,
): {
  baseUrl: string
  params: ParamEntry[]
} {
  const parsed = parseUrlAndParams(rawUrl)
  const newParams: ParamEntry[] = [...parsed.params]

  const enabledCounts = new Map<string, number>()
  for (const p of currentParams) {
    if (p.enabled) {
      enabledCounts.set(p.name, (enabledCounts.get(p.name) ?? 0) + 1)
    }
  }

  const parsedCounts = new Map<string, number>()
  for (const p of parsed.params) {
    parsedCounts.set(p.name, (parsedCounts.get(p.name) ?? 0) + 1)
  }

  const disabledConsumed = new Map<string, number>()

  for (const entry of currentParams) {
    if (!entry.enabled) {
      const name = entry.name
      const parsedCount = parsedCounts.get(name) ?? 0
      const enabledCount = enabledCounts.get(name) ?? 0
      const extraParsed = Math.max(0, parsedCount - enabledCount)
      const consumed = disabledConsumed.get(name) ?? 0

      if (consumed < extraParsed) {
        disabledConsumed.set(name, consumed + 1)
      } else {
        newParams.push({ ...entry })
      }
    }
  }

  return { baseUrl: parsed.baseUrl, params: newParams }
}

function normBaseUrl(origin: string, pathname: string): string {
  if (pathname === "/") return origin
  return origin + pathname
}

function extractPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    const q = url.indexOf("?")
    return q === -1 ? url : url.slice(0, q)
  }
}

export function parseUrlPathTokens(url: string): string[] {
  const pathname = extractPathname(url)
  const seen = new Set<string>()
  const result: string[] = []
  for (const seg of pathname.split("/")) {
    const name = parsePathToken(seg)
    if (name !== null) {
      if (!seen.has(name)) {
        seen.add(name)
        result.push(name)
      }
    }
  }
  return result
}

export function syncPathParamsWithUrl(
  currentPathParams: ParamEntry[],
  rawUrl: string,
): ParamEntry[] {
  const tokens = parseUrlPathTokens(rawUrl)
  const nameMap = new Map(currentPathParams.map((p) => [p.name, p]))
  const unmatched = [...currentPathParams]
  const result: ParamEntry[] = []

  const tokenSet = new Set(tokens)

  for (const token of tokens) {
    const existing = nameMap.get(token)
    if (existing) {
      nameMap.delete(token)
      result.push({ ...existing, name: token, enabled: true })
      const idx = unmatched.indexOf(existing)
      if (idx !== -1) unmatched.splice(idx, 1)
    } else {
      const renameIdx = unmatched.findIndex((p) => !tokenSet.has(p.name))
      if (renameIdx !== -1) {
        const [old] = unmatched.splice(renameIdx, 1)
        nameMap.delete(old!.name)
        result.push({ ...old!, name: token, enabled: true })
      } else {
        result.push({ name: token, value: "", enabled: true })
      }
    }
  }

  return result
}
