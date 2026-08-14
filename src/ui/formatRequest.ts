import type { Auth, KvEntry, Method, ParamEntry } from "../schema"
import { formatJson } from "../lang/formatJson"
import type { Theme } from "./theme"

export type MethodColorToken =
  "success" | "warning" | "error" | "info" | "textMuted"

export function methodColorToken(method: Method): MethodColorToken {
  if (method === "GET") return "success"
  if (method === "POST") return "warning"
  if (method === "PUT" || method === "PATCH") return "info"
  if (method === "DELETE") return "error"
  return "textMuted"
}

export function methodColor(method: Method, theme: Theme): string {
  return theme[methodColorToken(method)]
}

export function formatHeaders(headers: Record<string, KvEntry>): string[] {
  const entries = Object.entries(headers)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}: ${v.value}`)
}

export function formatParams(params: ParamEntry[]): string[] {
  const entries = params.map((p) => [p.name, p.value] as [string, string])
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.map(([k, v]) => `${k}: ${v}`)
}

export function formatBody(body?: string): string {
  if (body === undefined || body === "") return ""
  return formatJson(body)
}

export function formatAuth(auth?: Auth): string {
  if (auth === undefined || auth.type === "none") return "(none)"
  if (auth.type === "bearer") return "bearer: \u2022\u2022\u2022\u2022"
  if (auth.type === "basic")
    return `basic: ${auth.user}:\u2022\u2022\u2022\u2022`
  if (auth.type === "ntlm") {
    const username = auth.domain
      ? `${auth.domain}\\${auth.username}`
      : auth.username
    return `ntlm: ${username}`
  }
  if (auth.type === "api_key")
    return `api_key: ${auth.key}:\u2022\u2022\u2022\u2022`
  if (auth.type === "aws_sigv4")
    return `aws_sigv4: ${auth.service}/${auth.region}`
  if (auth.type === "oauth1")
    return `oauth1: ${auth.consumer_key || "(no consumer key)"}`
  if (auth.type === "oauth2")
    return `oauth2: ${auth.grant_type.replaceAll("_", " ")}`
  return "(none)"
}
