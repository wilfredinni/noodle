import type { KvEntry } from "../schema"

export function buildDisplayUrl(
  url: string,
  params: Record<string, KvEntry>,
): string {
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

  const merged: Array<[string, string]> = []

  for (const [k, v] of existingParams) {
    if (!(k in params)) {
      merged.push([k, v])
    }
  }

  for (const [k, entry] of Object.entries(params)) {
    if (!entry.enabled) continue
    merged.push([k, entry.value])
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
  params: Record<string, KvEntry>
} {
  if (!raw) return { baseUrl: raw, params: {} }

  try {
    const u = new URL(raw)
    const baseUrl = normBaseUrl(u.origin, u.pathname)
    const params: Record<string, KvEntry> = {}
    u.searchParams.forEach((v, k) => {
      params[k] = { value: v, enabled: true }
    })
    return { baseUrl, params }
  } catch {
    const questionIdx = raw.indexOf("?")
    if (questionIdx === -1) return { baseUrl: raw, params: {} }
    const baseUrl = raw.slice(0, questionIdx)
    const qs = raw.slice(questionIdx + 1)
    const params: Record<string, KvEntry> = {}
    if (qs) {
      try {
        const sp = new URLSearchParams(qs)
        sp.forEach((v, k) => {
          params[k] = { value: v, enabled: true }
        })
      } catch {
        return { baseUrl, params: {} }
      }
    }
    return { baseUrl, params }
  }
}

function normBaseUrl(origin: string, pathname: string): string {
  if (pathname === "/") return origin
  return origin + pathname
}
