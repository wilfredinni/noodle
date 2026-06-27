import type { KvEntry } from "../schema"

export function buildDisplayUrl(
  url: string,
  params: Record<string, KvEntry>,
): string {
  if (!url) return url

  let baseUrl: string
  const existingParams = new URLSearchParams()

  try {
    const u = new URL(url)
    baseUrl = normBaseUrl(u.origin, u.pathname)
    u.searchParams.forEach((v, k) => {
      existingParams.set(k, v)
    })
  } catch {
    const questionIdx = url.indexOf("?")
    if (questionIdx !== -1) {
      baseUrl = url.slice(0, questionIdx)
      try {
        const sp = new URLSearchParams(url.slice(questionIdx + 1))
        sp.forEach((v, k) => existingParams.set(k, v))
      } catch {
        return url
      }
    } else {
      baseUrl = url
    }
  }

  const merged = new URLSearchParams()

  for (const [k, v] of existingParams.entries()) {
    if (!(k in params)) {
      merged.set(k, v)
    }
  }

  for (const [k, entry] of Object.entries(params)) {
    if (!entry.enabled) continue
    merged.set(k, entry.value)
  }

  const qs = merged.toString()
  return qs ? `${baseUrl}?${qs}` : baseUrl
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
