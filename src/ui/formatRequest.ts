import type { Method } from "../schema"

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
