import type { TimelineEntry, Method } from "../../schema"
import type { Request } from "../../schema"
import type { SendCompleteResult } from "../../hooks/useResponse"
import type { SubstitutedRequest } from "../../requests/substitute"

const MAX_BODY_LENGTH = 10_000

function truncateBody(body: string | undefined): string | undefined {
  if (body === undefined || body === "") return body
  return body.length <= MAX_BODY_LENGTH ? body : body.slice(0, MAX_BODY_LENGTH)
}

function truncateBodyString(body: string): string {
  return body.length <= MAX_BODY_LENGTH ? body : body.slice(0, MAX_BODY_LENGTH)
}

function responseSize(body: string): number {
  return new TextEncoder().encode(body).length
}

export function buildTimelineEntry(
  req: Request,
  result: SendCompleteResult,
  envName?: string,
  substituted?: SubstitutedRequest,
): TimelineEntry {
  return {
    timestamp: Date.now(),
    envName,
    request: {
      id: req.id,
      name: req.name,
      method: req.method,
      url: substituted?.url ?? req.url,
      headers: substituted
        ? Object.fromEntries(
            Object.entries(substituted.headers).map(([k, v]) => [
              k,
              { value: v, enabled: true },
            ]),
          )
        : { ...req.headers },
      params: substituted
        ? substituted.params.map((p) => ({ ...p }))
        : [...req.params],
      body: truncateBody(substituted?.body ?? req.body),
      auth: substituted?.auth ?? (req.auth ? { ...req.auth } : undefined),
    },
    response:
      result.status === "done"
        ? {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: { ...result.response.headers },
            body: truncateBodyString(result.response.body),
            timeMs: result.response.timeMs,
            size: responseSize(result.response.body),
          }
        : undefined,
    error:
      result.status === "error" ? { message: result.error.message } : undefined,
  }
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return "now"
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const days = Math.floor(hr / 24)
  return `${days}d`
}

export function truncateUrl(url: string, max = 60): string {
  if (url.length <= max) return url
  return url.slice(0, max - 3) + "..."
}

export function entryMethod(entry: TimelineEntry): Method {
  return entry.request.method
}

export function entryStatus(entry: TimelineEntry): number | null {
  if (entry.response) return entry.response.status
  if (entry.error) return 0
  return null
}

export function entrySize(entry: TimelineEntry): number | null {
  if (entry.response) return entry.response.size
  return null
}

export function entryTiming(entry: TimelineEntry): string {
  if (entry.response) return `${Math.round(entry.response.timeMs)}ms`
  if (entry.error) return "ERR"
  return "-"
}

export function entryIsError(entry: TimelineEntry): boolean {
  return entry.error !== undefined
}

export function shortMethod(m: string): string {
  return m === "DELETE" ? "DEL" : m
}

export function formatRequestHeaders(entry: TimelineEntry): string[] {
  const lines: string[] = []
  for (const [k, v] of Object.entries(entry.request.headers)) {
    if (v.enabled) lines.push(`${k}: ${v.value}`)
  }
  return lines.sort()
}

export function formatRequestUrl(entry: TimelineEntry): string {
  const u = entry.request.url
  const params = entry.request.params
  const enabled = params.filter((p) => p.enabled)
  if (enabled.length === 0) return u
  const qs = enabled
    .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`)
    .join("&")
  if (u.includes("?")) return `${u}&${qs}`
  return `${u}?${qs}`
}

export function authSummary(
  auth: TimelineEntry["request"]["auth"],
): string | null {
  if (!auth || auth.type === "none") return null
  if (auth.type === "bearer") return "Bearer token"
  if (auth.type === "basic") return `Basic ${auth.user}:****`
  if (auth.type === "api_key") return `${auth.key}: ${auth.value}`
  return null
}
