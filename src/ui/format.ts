import type { Response } from "../schema"
import type { Theme } from "./theme"

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function statusColor(status: number, theme: Theme): string {
  if (status >= 200 && status <= 299) return theme.success
  if (status >= 300 && status <= 399) return theme.info
  if (status >= 400 && status <= 599) return theme.error
  return theme.textMuted
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
