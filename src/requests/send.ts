import type {
  Auth,
  Collection,
  Environment,
  KvEntry,
  NetworkError,
  NetworkEvent,
  NetworkEventType,
  ParamEntry,
  Request,
  Response,
} from "../schema"
import { substitute } from "./substitute"
import type { SubstitutedRequest } from "./substitute"
import { mergeFolderOverrides } from "./mergeFolderOverrides"
import { PATH_TOKEN_RE } from "./pathParams"

export function interpolatePathParams(
  url: string,
  pathParams: ParamEntry[],
): string {
  let u: URL
  const isAbsolute = url.includes("://")
  try {
    u = isAbsolute ? new URL(url) : new URL(url, "https://noodle")
  } catch {
    return url
  }

  const entryByName = new Map<string, ParamEntry>()
  for (const p of pathParams) {
    entryByName.set(p.name, p)
  }

  const segments = u.pathname.split("/")
  let hasTokens = false
  for (const seg of segments) {
    if (PATH_TOKEN_RE.test(seg)) {
      hasTokens = true
      break
    }
  }
  if (!hasTokens) return url

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    segments[i] = seg.replace(PATH_TOKEN_RE, (_, name: string) => {
      const entry = entryByName.get(name)
      if (!entry || entry.value === "") {
        throw new Error(`requests.send: path parameter ":${name}" has no value`)
      }
      return encodeURIComponent(entry.value)
    })
  }

  u.pathname = segments.join("/")

  if (isAbsolute) return u.toString()
  return u.pathname + u.search
}

export async function send(
  req: Request,
  env?: Environment,
  signal?: AbortSignal,
  collection?: Collection,
  requestPath?: string,
): Promise<Response> {
  const merged =
    collection && requestPath
      ? mergeFolderOverrides(req, collection, requestPath)
      : req

  const substituted = env !== undefined ? substitute(merged, env) : merged

  const headers: Record<string, string> =
    substituted === merged
      ? filterKv(merged.headers)
      : (substituted as SubstitutedRequest).headers
  const params: ParamEntry[] =
    substituted === merged
      ? merged.params.filter((e) => e.enabled)
      : (substituted as SubstitutedRequest).params
  const pathParams: ParamEntry[] =
    substituted === merged
      ? (merged.pathParams ?? [])
      : ((substituted as SubstitutedRequest).pathParams ?? [])

  const urlWithPath = interpolatePathParams(substituted.url, pathParams)

  let finalUrl: string
  try {
    const u = new URL(urlWithPath)
    const paramKeys = new Set(params.map((e) => e.name))
    for (const key of paramKeys) {
      u.searchParams.delete(key)
    }
    for (const entry of params) {
      if (!entry.enabled) continue
      u.searchParams.append(entry.name, entry.value)
    }
    finalUrl = u.toString()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`requests.send: invalid url "${substituted.url}": ${msg}`, {
      cause: e,
    })
  }

  const authForParams = substituted.auth
  if (
    authForParams?.type === "api_key" &&
    authForParams.placement === "query"
  ) {
    const up = new URL(finalUrl)
    up.searchParams.append(authForParams.key, authForParams.value)
    finalUrl = up.toString()
  }

  const headersInst = new Headers(headers)
  const ah = authHeader(substituted.auth)
  if (ah) {
    headersInst.set(ah.name, ah.value)
  }

  let effectiveSignal = signal
  if (req.timeout > 0) {
    const timeoutSignal = AbortSignal.timeout(req.timeout)
    effectiveSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal
  }

  const substitutedBody = await bodyForSend(substituted, headersInst)
  const init: RequestInit = {
    method: substituted.method,
    headers: headersInst,
    body: substitutedBody,
    signal: effectiveSignal,
  }

  const start = performance.now()
  const network: NetworkEvent[] = []
  let res: globalThis.Response
  let currentUrl = finalUrl
  let currentInit: RequestInit = { ...init, redirect: "manual" }
  let redirectCount = 0
  const maxRedirects = req.maxRedirects ?? 5
  const followRedirects = req.followRedirects ?? true

  while (true) {
    recordNetworkEvent(
      network,
      start,
      "request",
      `${currentInit.method ?? substituted.method} ${networkUrl(currentUrl)}`,
    )
    try {
      res = await fetch(currentUrl, currentInit)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (e instanceof DOMException && e.name === "AbortError") throw e
      throw networkFailure(
        `requests.send: fetch failed: ${msg}`,
        e,
        network,
        start,
      )
    }

    recordNetworkEvent(
      network,
      start,
      "response",
      `${res.status} ${res.statusText || "Response"} - ${[...res.headers].length} headers`,
    )

    if (!followRedirects || ![301, 302, 303, 307, 308].includes(res.status)) {
      break
    }

    const loc = res.headers.get("location")
    if (!loc) break

    if (redirectCount >= maxRedirects) {
      throw networkFailure(
        `requests.send: max redirects (${maxRedirects}) exceeded`,
        undefined,
        network,
        start,
      )
    }
    redirectCount++

    try {
      currentUrl = new URL(loc, currentUrl).toString()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw networkFailure(
        `requests.send: invalid redirect location: ${msg}`,
        e,
        network,
        start,
      )
    }
    recordNetworkEvent(
      network,
      start,
      "redirect",
      `${res.status} -> ${networkUrl(currentUrl)}`,
    )

    if (
      res.status === 303 ||
      ((res.status === 301 || res.status === 302) &&
        currentInit.method === "POST")
    ) {
      const newHeaders = new Headers(currentInit.headers)
      newHeaders.delete("content-type")
      newHeaders.delete("content-length")

      currentInit = {
        ...currentInit,
        method: "GET",
        body: undefined,
        headers: newHeaders,
      }
    }
  }

  let body: string
  try {
    body = await res.text()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (e instanceof DOMException && e.name === "AbortError") throw e
    throw networkFailure(
      `requests.send: failed to read response body: ${msg}`,
      e,
      network,
      start,
    )
  }

  recordNetworkEvent(
    network,
    start,
    "body",
    `Body received - ${new TextEncoder().encode(body).length} bytes`,
  )
  recordNetworkEvent(
    network,
    start,
    "complete",
    `Completed in ${Math.round(performance.now() - start)}ms`,
  )

  return {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body,
    timeMs: performance.now() - start,
    network,
  }
}

function recordNetworkEvent(
  network: NetworkEvent[],
  start: number,
  type: NetworkEventType,
  message: string,
): void {
  network.push({ timeMs: performance.now() - start, type, message })
}

function networkFailure(
  message: string,
  cause: unknown,
  network: NetworkEvent[],
  start: number,
): NetworkError {
  recordNetworkEvent(network, start, "error", message)
  const error = new Error(message, cause === undefined ? undefined : { cause })
  ;(error as NetworkError).network = network
  return error as NetworkError
}

function networkUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}${parsed.search ? "?..." : ""}`
  } catch {
    return url
  }
}

type BodyRequest = Pick<Request, "body" | "bodyType" | "formData" | "filePath">

export async function bodyForSend(
  req: BodyRequest,
  headers: Headers,
): Promise<BodyInit | undefined> {
  if (req.bodyType === "none") return undefined

  if (req.bodyType === "json" && req.body !== undefined) {
    headers.set("content-type", "application/json")
    return req.body
  }

  if (req.bodyType === "urlencoded" && req.formData) {
    headers.set("content-type", "application/x-www-form-urlencoded")
    const params = new URLSearchParams()
    for (const entry of req.formData) {
      if (entry.enabled) params.append(entry.name, entry.value)
    }
    return params.toString()
  }

  if (req.bodyType === "multipart" && req.formData) {
    headers.delete("content-type")
    const fd = new FormData()
    for (const entry of req.formData) {
      if (!entry.enabled) continue
      if (entry.type === "file") {
        if (!(await Bun.file(entry.value).exists())) {
          throw new Error(`file not found: ${entry.value}`)
        }
        fd.append(entry.name, Bun.file(entry.value))
      } else {
        fd.append(entry.name, entry.value)
      }
    }
    return fd as unknown as BodyInit
  }

  if (req.bodyType === "binary") {
    if (req.filePath) {
      if (!(await Bun.file(req.filePath).exists())) {
        throw new Error(`file not found: ${req.filePath}`)
      }
      headers.set("content-type", "application/octet-stream")
      return Bun.file(req.filePath) as unknown as BodyInit
    }
    return undefined
  }

  return req.body
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function authHeader(
  auth: Auth | undefined,
): { name: string; value: string } | null {
  if (auth === undefined || auth.type === "none") return null
  if (auth.type === "bearer") {
    return { name: "Authorization", value: `Bearer ${auth.token}` }
  }
  if (auth.type === "basic") {
    const encoded = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64")
    return { name: "Authorization", value: `Basic ${encoded}` }
  }
  if (auth.type === "api_key" && auth.placement === "header") {
    return { name: auth.key, value: auth.value }
  }
  return null
}

function filterKv(entries: Record<string, KvEntry>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries)) {
    if (v.enabled) out[k] = v.value
  }
  return out
}
