import type { Auth, Method } from "../schema"

export function methodColor(method: Method): string {
  if (method === "GET") return "#080"
  if (method === "POST" || method === "PUT" || method === "PATCH") return "#880"
  if (method === "DELETE") return "#c00"
  return "#888"
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
