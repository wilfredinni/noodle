import type { BodyType, KvEntry, Response } from "../schema"
import { formatJson } from "../lang/formatJson"
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

export interface HeaderEntry {
  key: string
  value: string
}

export function formatHeaders(res: Response): HeaderEntry[] {
  const entries = Object.entries(res.headers)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([key, value]) => ({ key, value }))
}

export function formatBody(res: Response): string {
  if (res.body === "") return ""
  const jsonParseError = formatJsonParseErrorBody(res.body)
  if (jsonParseError !== null) return jsonParseError
  return formatJson(res.body)
}

export function bodyFiletype(
  headers: Record<string, string | KvEntry>,
  bodyType?: BodyType,
): "json" | "xml" {
  const contentType = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1]
  const value =
    typeof contentType === "string"
      ? contentType
      : contentType?.enabled
        ? contentType.value
        : undefined
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase()
  return bodyType === "xml" ||
    mimeType === "application/xml" ||
    mimeType === "text/xml" ||
    mimeType?.endsWith("+xml")
    ? "xml"
    : "json"
}

function formatJsonParseErrorBody(body: string): string | null {
  if (
    !body.includes("body-parser/lib/types/json") ||
    !body.includes("SyntaxError:")
  ) {
    return null
  }

  const detail = body.match(/SyntaxError:\s*([^\r\n]+)/)?.[1]?.trim()
  return [
    "The server rejected the request because the submitted JSON is invalid.",
    detail ? `Details: ${detail}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
}
