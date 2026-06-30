import type { Auth, Environment, KvEntry, Request, Response } from "../schema"
import { substitute } from "./substitute"
import type { SubstitutedRequest } from "./substitute"

export async function send(
  req: Request,
  env?: Environment,
  signal?: AbortSignal,
): Promise<Response> {
  const substituted = env !== undefined ? substitute(req, env) : req

  const headers: Record<string, string> =
    substituted === req
      ? filterKv(req.headers)
      : (substituted as SubstitutedRequest).headers
  const params: Record<string, string> =
    substituted === req
      ? filterKv(req.params)
      : (substituted as SubstitutedRequest).params

  let finalUrl: string
  try {
    const u = new URL(substituted.url)
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.append(k, v)
    }
    finalUrl = u.toString()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`requests.send: invalid url "${substituted.url}": ${msg}`, {
      cause: e,
    })
  }

  const authForParams = substituted.auth
  if (authForParams?.type === "api_key" && authForParams.placement === "query") {
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

  const init: RequestInit = {
    method: substituted.method,
    headers: headersInst,
    body: substituted.body,
    signal: effectiveSignal,
  }

  const start = performance.now()
  let res: globalThis.Response
  let currentUrl = finalUrl
  let currentInit: RequestInit = { ...init, redirect: "manual" }
  let redirectCount = 0
  const maxRedirects = req.maxRedirects ?? 5
  const followRedirects = req.followRedirects ?? true

  while (true) {
    try {
      res = await fetch(currentUrl, currentInit)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`requests.send: fetch failed: ${msg}`, { cause: e })
    }

    if (!followRedirects || ![301, 302, 303, 307, 308].includes(res.status)) {
      break
    }

    const loc = res.headers.get("location")
    if (!loc) break

    if (redirectCount >= maxRedirects) {
      throw new Error(`requests.send: max redirects (${maxRedirects}) exceeded`)
    }
    redirectCount++

    currentUrl = new URL(loc, currentUrl).toString()

    if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentInit.method === "POST")) {
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
    throw new Error(`requests.send: failed to read response body: ${msg}`, {
      cause: e,
    })
  }

  return {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body,
    timeMs: performance.now() - start,
  }
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
