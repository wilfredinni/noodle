import type { SelectItem } from "./Select"

export const METHOD_ITEMS: SelectItem[] = [
  { id: "GET", label: "GET", color: "success" },
  { id: "POST", label: "POST", color: "warning" },
  { id: "PUT", label: "PUT", color: "warning" },
  { id: "PATCH", label: "PATCH", color: "warning" },
  { id: "DELETE", label: "DEL", color: "error" },
  { id: "HEAD", label: "HEAD", color: "textMuted" },
  { id: "OPTIONS", label: "OPTIONS", color: "textMuted" },
]
