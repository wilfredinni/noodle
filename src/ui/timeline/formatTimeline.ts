import type { Response, TimelineEntry } from "../../schema"
import type { Request } from "../../schema"
import type { Theme } from "../theme"
import { statusColor } from "../format"
import type { SendCompleteResult } from "../../hooks/useResponse"

export function buildTimelineEntry(
  req: Request,
  result: SendCompleteResult,
  envName?: string,
): TimelineEntry {
  return {
    timestamp: Date.now(),
    envName,
    request: {
      id: req.id,
      name: req.name,
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      params: { ...req.params },
      body: req.body,
      auth: req.auth ? { ...req.auth } : undefined,
    },
    response:
      result.status === "done"
        ? {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: { ...result.response.headers },
            body: result.response.body,
            timeMs: result.response.timeMs,
          }
        : undefined,
    error:
      result.status === "error"
        ? { message: result.error.message }
        : undefined,
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

export function entryMethod(entry: TimelineEntry): string {
  return entry.request.method
}

export function entryStatus(entry: TimelineEntry): number | null {
  if (entry.response) return entry.response.status
  if (entry.error) return 0
  return null
}

export function entryTiming(entry: TimelineEntry): string {
  if (entry.response) return `${Math.round(entry.response.timeMs)}ms`
  if (entry.error) return "ERR"
  return "-"
}

export function entryStatusFg(status: number | null, theme: Theme): string {
  if (status === null) return theme.textMuted
  if (status === 0) return theme.error
  return statusColor(status, theme)
}

export function entryIsError(entry: TimelineEntry): boolean {
  return entry.error !== undefined
}
