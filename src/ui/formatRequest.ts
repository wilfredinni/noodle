import type { Method } from "../schema"

export function methodColor(method: Method): string {
  if (method === "GET") return "#080"
  if (method === "POST" || method === "PUT" || method === "PATCH") return "#880"
  if (method === "DELETE") return "#c00"
  return "#888"
}
