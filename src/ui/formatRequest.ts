import type { Auth, Method } from "../schema"
import type { Theme } from "./theme"

export function methodColor(method: Method, theme: Theme): string {
  if (method === "GET") return theme.success
  if (method === "POST" || method === "PUT" || method === "PATCH") return theme.warning
  if (method === "DELETE") return theme.error
  return theme.textMuted
}

export function formatHeaders(headers: Record<string, string>): string[] {
  const entries = Object.entries(headers)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}: ${v}`)
}

export function formatParams(params: Record<string, string>): string[] {
  const entries = Object.entries(params)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}: ${v}`)
}

export function formatBody(body?: string): string {
  if (body === undefined || body === "") return ""
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function formatAuth(auth?: Auth): string {
  if (auth === undefined || auth.type === "none") return "(none)"
  if (auth.type === "bearer") return "bearer: \u2022\u2022\u2022\u2022"
  return `basic: ${auth.user}:\u2022\u2022\u2022\u2022`
}
