import type { TimelineEntry, Method } from "../../schema"
import type { Request } from "../../schema"
import type { SendCompleteResult } from "../../hooks/useResponse"
import type { SubstitutedRequest } from "../../requests/substitute"
import { randomUUID } from "node:crypto"

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
    id: randomUUID(),
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
      pathParams: substituted
        ? (substituted.pathParams ?? []).map((p) => ({ ...p }))
        : [...(req.pathParams ?? [])],
      body: substituted?.body ?? req.body,
      auth: substituted?.auth ?? (req.auth ? { ...req.auth } : undefined),
    },
    response:
      result.status === "done"
        ? {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: { ...result.response.headers },
            body: result.response.body,
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

export function formatRequestDisplayName(entry: TimelineEntry): string {
  const { id, name } = entry.request
  const slashIdx = id.lastIndexOf("/")
  if (slashIdx !== -1) {
    const folder = id.slice(0, slashIdx)
    return `${folder}/${name || id.slice(slashIdx + 1)}`
  }
  return name || id
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

export function maskedAuthHeader(
  auth: TimelineEntry["request"]["auth"],
): { key: string; value: string } | null {
  if (!auth || auth.type === "none" || auth.type === "inherit") return null
  if (auth.type === "bearer")
    return { key: "Authorization", value: "Bearer ••••••••" }
  if (auth.type === "basic")
    return { key: "Authorization", value: "Basic ••••••••" }
  if (auth.type === "api_key" && auth.placement === "header") {
    return { key: auth.key, value: "••••••••" }
  }
  return null
}

export function buildDetailRequestHeaders(
  auth: TimelineEntry["request"]["auth"],
  headers: TimelineEntry["request"]["headers"],
): { key: string; value: string }[] {
  const authHeader = maskedAuthHeader(auth)
  const skipKeys = new Set<string>()
  if (authHeader) {
    skipKeys.add(authHeader.key.toLowerCase())
  }
  const merged = [
    ...(authHeader ? [authHeader] : []),
    ...Object.entries(headers)
      .filter(
        ([key, value]) => value.enabled && !skipKeys.has(key.toLowerCase()),
      )
      .map(([key, value]) => ({ key, value: value.value })),
  ]
  merged.sort((a, b) => a.key.localeCompare(b.key))
  return merged
}
