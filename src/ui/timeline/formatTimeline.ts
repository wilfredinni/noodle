import type { Environment, TimelineEntry, Method } from "../../schema"
import type { NetworkError } from "../../schema"
import type { Request } from "../../schema"
import type { SendCompleteResult } from "../../hooks/useResponse"
import { randomUUID } from "node:crypto"
import { interpolatePathParams } from "../../requests/send"
import {
  environmentSecretValues,
  isSensitiveHeader,
  redactKnownSecrets,
  REDACTED,
} from "../../secrets/redact"

function responseSize(body: string): number {
  return new TextEncoder().encode(body).length
}

export function buildTimelineEntry(
  req: Request,
  result: SendCompleteResult,
  envName?: string,
  environment?: Environment | null,
  settingsSecrets: string[] = [],
): TimelineEntry {
  const secretValues = [
    ...environmentSecretValues(environment),
    ...settingsSecrets,
  ]
  const redact = (value: string) => redactKnownSecrets(value, secretValues)
  const resolvePublicVars = (value: string) =>
    environment
      ? value.replace(/\$(\w+)/g, (token, key: string) =>
          !environment.secretVars?.[key] && Object.hasOwn(environment.vars, key)
            ? environment.vars[key]!
            : token,
        )
      : value
  let url = req.url
  try {
    url = interpolatePathParams(
      resolvePublicVars(req.url),
      (req.pathParams ?? []).map((param) => ({
        ...param,
        name: resolvePublicVars(param.name),
        value: resolvePublicVars(param.value),
      })),
    )
  } catch {
    // Preserve the template when substitution fails, matching send errors.
  }
  const requestHeaders = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [
      key,
      {
        ...value,
        value: isSensitiveHeader(key)
          ? REDACTED
          : redact(
              value.enabled ? resolvePublicVars(value.value) : value.value,
            ),
      },
    ]),
  )
  const redactAuth = (auth: Request["auth"]): Request["auth"] => {
    if (!auth || auth.type === "none" || auth.type === "inherit") return auth
    if (auth.type === "bearer") {
      return {
        type: "bearer",
        token: REDACTED,
      }
    }
    if (auth.type === "basic") {
      return {
        type: "basic",
        user: redact(resolvePublicVars(auth.user)),
        pass: REDACTED,
      }
    }
    if (auth.type === "ntlm") {
      return {
        type: "ntlm",
        username: redact(resolvePublicVars(auth.username)),
        password: REDACTED,
        domain: redact(resolvePublicVars(auth.domain)),
        workstation: redact(resolvePublicVars(auth.workstation)),
      }
    }
    if (auth.type === "aws_sigv4") {
      return {
        type: "aws_sigv4",
        access_key: REDACTED,
        secret_key: REDACTED,
        region: redact(resolvePublicVars(auth.region)),
        service: redact(resolvePublicVars(auth.service)),
        ...(auth.session_token ? { session_token: REDACTED } : {}),
      }
    }
    return {
      ...auth,
      key: redact(resolvePublicVars(auth.key)),
      value: REDACTED,
    }
  }
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    envName,
    network:
      result.status === "done"
        ? result.response.network?.map((event) => ({
            ...event,
            message: redact(event.message),
          }))
        : (result.error as NetworkError).network?.map((event) => ({
            ...event,
            message: redact(event.message),
          })),
    request: {
      id: req.id,
      name: req.name,
      method: req.method,
      url: redact(url),
      headers: requestHeaders,
      params: req.params.map((param) => ({
        ...param,
        name: redact(
          param.enabled ? resolvePublicVars(param.name) : param.name,
        ),
        value: redact(
          param.enabled ? resolvePublicVars(param.value) : param.value,
        ),
      })),
      pathParams: (req.pathParams ?? []).map((param) => ({
        ...param,
        name: redact(resolvePublicVars(param.name)),
        value: redact(resolvePublicVars(param.value)),
      })),
      body:
        req.body === undefined
          ? undefined
          : redact(resolvePublicVars(req.body)),
      auth: redactAuth(req.auth),
    },
    response:
      result.status === "done"
        ? {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: result.response.headers,
            body: result.response.body,
            timeMs: result.response.timeMs,
            size: responseSize(result.response.body),
          }
        : undefined,
    error:
      result.status === "error"
        ? { message: redact(result.error.message) }
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
  if (auth.type === "ntlm")
    return { key: "Authorization", value: "NTLM ••••••••" }
  if (auth.type === "aws_sigv4")
    return { key: "Authorization", value: "AWS4-HMAC-SHA256 ••••••••" }
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
