import type { Response } from "../schema"

export function statusColor(status: number): string {
  if (status >= 200 && status <= 299) return "#080"
  if (status >= 300 && status <= 399) return "#880"
  if (status >= 400 && status <= 599) return "#c00"
  return "#888"
}

export function formatStatusLine(res: Response): string {
  const ms = Math.round(res.timeMs)
  if (res.statusText === "") return `HTTP ${res.status} · ${ms}ms`
  return `HTTP ${res.status} ${res.statusText} · ${ms}ms`
}

export function formatHeaders(res: Response): string[] {
  const entries = Object.entries(res.headers)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}: ${v}`)
}

export function formatBody(res: Response): string {
  if (res.body === "") return ""
  const contentType = lookupContentType(res.headers)
  const looksJson = contentType !== null && contentType.includes("json")
  if (looksJson) {
    try {
      return JSON.stringify(JSON.parse(res.body), null, 2)
    } catch {
      return res.body
    }
  }
  try {
    return JSON.stringify(JSON.parse(res.body), null, 2)
  } catch {
    return res.body
  }
}

function lookupContentType(headers: Record<string, string>): string | null {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === "content-type") return headers[k]
  }
  return null
}
