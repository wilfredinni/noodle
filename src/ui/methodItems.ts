import type { SelectItem } from "./Select"
import { methodColorToken } from "./formatRequest"

export const METHOD_ITEMS: SelectItem[] = [
  { id: "GET", label: "GET", color: methodColorToken("GET") },
  { id: "POST", label: "POST", color: methodColorToken("POST") },
  { id: "PUT", label: "PUT", color: methodColorToken("PUT") },
  { id: "PATCH", label: "PATCH", color: methodColorToken("PATCH") },
  { id: "DELETE", label: "DEL", color: methodColorToken("DELETE") },
  { id: "HEAD", label: "HEAD", color: methodColorToken("HEAD") },
  { id: "OPTIONS", label: "OPTIONS", color: methodColorToken("OPTIONS") },
]
