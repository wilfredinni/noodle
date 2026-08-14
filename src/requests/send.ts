import type {
  Auth,
  CookiePair,
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
import { withDefaultHttpsScheme } from "./url"
import { expandUserPath } from "../userPath"
import { proxyForUrl, type ProxyPolicy } from "../proxy"
import { tlsForUrl, type TlsPolicy } from "../tls"
import { clearAwsSignerHeaders, signAwsRequest } from "./awsSigV4"
import {
  createType1Message,
  createType3Message,
  getNtlmChallenge,
  type NtlmChallenge,
} from "./ntlm"
import { createNtlmConnection, type NtlmConnection } from "./ntlmConnection"
import { parseResponseCookies, type CollectionCookieJar } from "../cookies"
import { signOAuth1Request, stripOAuth1Credentials } from "./oauth1"
import { resolveOAuth2Token, type OAuth2Mode } from "./oauth2"
import type { OAuthBrowserLauncher } from "./oauth2Browser"

export interface RequestExecutionOptions {
  environment?: Environment
  signal?: AbortSignal
  collection?: Collection
  requestPath?: string
  onNetworkEvent?: (network: NetworkEvent[]) => void
  proxyPolicy?: ProxyPolicy
  tlsPolicy?: TlsPolicy
  cookies?: CollectionCookieJar
  collectionDir?: string
  oauthMode?: OAuth2Mode
  openOAuthBrowser?: OAuthBrowserLauncher
  allowCrossOriginRedirects?: boolean
}

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
  options: RequestExecutionOptions = {},
): Promise<Response> {
  const {
    environment: env,
    signal,
    collection,
    requestPath,
    onNetworkEvent,
    proxyPolicy,
    tlsPolicy,
    cookies,
    collectionDir,
    oauthMode = "cached-only",
    openOAuthBrowser,
    allowCrossOriginRedirects = true,
  } = options
  const merged =
    collection && requestPath
      ? mergeFolderOverrides(req, collection, requestPath)
      : req

  const substituted = env !== undefined ? substitute(merged, env) : merged

  if (cookies && substituted.sendCookies !== false) {
    // Storage failures are reflected by the jar status; HTTP still runs jar-less.
    await cookies.refresh().catch(() => {})
  }

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

  const urlWithPath = interpolatePathParams(
    withDefaultHttpsScheme(substituted.url),
    pathParams,
  )

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
  if (substituted.auth?.type === "ntlm") {
    headersInst.delete("authorization")
  }

  let effectiveSignal = signal
  if (req.timeout > 0) {
    const timeoutSignal = AbortSignal.timeout(req.timeout)
    effectiveSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal
  }

  if (
    substituted.auth?.type === "aws_sigv4" &&
    substituted.bodyType === "multipart"
  ) {
    throw new Error(
      "requests.send: AWS SigV4 does not support multipart bodies",
    )
  }

  let substitutedBody = await bodyForSend(substituted, headersInst)
  if (
    substituted.auth?.type === "aws_sigv4" &&
    substitutedBody instanceof Blob
  ) {
    substitutedBody = Buffer.from(await substitutedBody.arrayBuffer())
  }
  const init: RequestInit = {
    method: substituted.method,
    headers: headersInst,
    body: substitutedBody,
    signal: effectiveSignal,
  }

  const start = performance.now()
  const network: NetworkEvent[] = []
  let oauth2Token: string | undefined
  if (substituted.auth?.type === "oauth2") {
    if (
      substituted.auth.token_placement === "header" &&
      !substituted.auth.token_header.trim()
    ) {
      throw new Error("requests.send: OAuth 2 token_header must not be empty")
    }
    if (
      substituted.auth.token_placement === "query" &&
      !substituted.auth.token_query_key.trim()
    ) {
      throw new Error(
        "requests.send: OAuth 2 token_query_key must not be empty",
      )
    }
    try {
      oauth2Token = (
        await resolveOAuth2Token(substituted.auth, {
          collectionDir,
          mode: oauthMode,
          // Browser authorization owns its five-minute timeout. The request
          // timeout still applies to each token/resource HTTP call.
          signal,
          proxyPolicy,
          tlsPolicy,
          openBrowser: openOAuthBrowser,
          onAuthEvent: (message) =>
            recordNetworkEvent(network, start, "auth", message, onNetworkEvent),
        })
      ).token
    } catch (e) {
      throw networkFailure(
        `requests.send: ${e instanceof Error ? e.message : String(e)}`,
        e,
        network,
        start,
        onNetworkEvent,
      )
    }
  }
  let res: globalThis.Response
  let currentUrl = finalUrl
  let currentInit: RequestInit = { ...init, redirect: "manual" }
  let redirectCount = 0
  let awsSigningEnabled = substituted.auth?.type === "aws_sigv4"
  let ntlmEnabled = substituted.auth?.type === "ntlm"
  let oauth1SigningEnabled = substituted.auth?.type === "oauth1"
  let oauth2Enabled = substituted.auth?.type === "oauth2"
  let sentCookies: CookiePair[] = []
  const maxRedirects = req.maxRedirects ?? 5
  const followRedirects = req.followRedirects ?? true

  while (true) {
    let proxyRoute
    try {
      proxyRoute = proxyPolicy
        ? proxyForUrl(proxyPolicy, currentUrl)
        : undefined
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw networkFailure(
        `requests.send: ${msg}`,
        e,
        network,
        start,
        onNetworkEvent,
      )
    }
    if (proxyRoute) {
      recordNetworkEvent(
        network,
        start,
        "proxy",
        proxyRoute.kind === "proxy"
          ? `Proxy: ${proxyRoute.source}`
          : proxyRoute.reason === "bypass"
            ? "Proxy: bypassed"
            : proxyRoute.reason === "cli"
              ? "Proxy: disabled by --noproxy"
              : proxyRoute.reason === "off"
                ? "Proxy: off"
                : "Proxy: direct",
        onNetworkEvent,
      )
    }
    let resolvedTls
    try {
      resolvedTls = await tlsForUrl(substituted, currentUrl, tlsPolicy)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw networkFailure(
        `requests.send: ${msg}`,
        e,
        network,
        start,
        onNetworkEvent,
      )
    }
    for (const message of resolvedTls.messages) {
      recordNetworkEvent(network, start, "tls", message, onNetworkEvent)
    }
    let ntlmConnection: NtlmConnection | undefined
    const fetchOnce = async (authorization?: string) => {
      const legHeaders = new Headers(currentInit.headers)
      let requestUrl = currentUrl
      if (ntlmEnabled) {
        if (authorization) legHeaders.set("authorization", authorization)
        else legHeaders.delete("authorization")
      }
      if (oauth2Enabled && oauth2Token && substituted.auth?.type === "oauth2") {
        if (substituted.auth.token_placement === "header") {
          legHeaders.set(
            substituted.auth.token_header,
            substituted.auth.token_prefix
              ? `${substituted.auth.token_prefix} ${oauth2Token}`
              : oauth2Token,
          )
        } else {
          const tokenUrl = new URL(currentUrl)
          tokenUrl.searchParams.set(
            substituted.auth.token_query_key,
            oauth2Token,
          )
          requestUrl = tokenUrl.toString()
        }
      }
      if (cookies && substituted.sendCookies !== false) {
        const jarHeader = cookies.cookieHeaderFor(currentUrl)
        if (jarHeader) {
          const existing = legHeaders.get("cookie")
          legHeaders.set(
            "cookie",
            existing ? mergeCookieHeader(existing, jarHeader) : jarHeader,
          )
        }
      }
      const legInit: RequestInit = {
        ...currentInit,
        headers: legHeaders,
        ...(ntlmEnabled ? { keepalive: true } : {}),
      }
      sentCookies = parseCookieHeader(legHeaders.get("cookie"))
      recordNetworkEvent(
        network,
        start,
        "request",
        `${legInit.method ?? substituted.method} ${networkUrl(currentUrl)}`,
        onNetworkEvent,
      )
      let response: globalThis.Response
      try {
        let signedInit =
          awsSigningEnabled && substituted.auth?.type === "aws_sigv4"
            ? signAwsRequest(currentUrl, legInit, substituted.auth)
            : legInit
        if (oauth1SigningEnabled && substituted.auth?.type === "oauth1") {
          const signed = await signOAuth1Request(
            currentUrl,
            signedInit,
            substituted.auth,
            collectionDir,
          )
          requestUrl = signed.url
          signedInit = signed.init
        }
        if (ntlmEnabled) {
          ntlmConnection ??= await createNtlmConnection(
            currentUrl,
            signedInit,
            proxyRoute?.kind === "proxy" ? proxyRoute.url : undefined,
            resolvedTls.options,
          )
          response = await ntlmConnection.request(legHeaders)
        } else {
          const fetchInit: BunFetchRequestInit = { ...signedInit }
          if (proxyRoute?.kind === "proxy") fetchInit.proxy = proxyRoute.url
          if (resolvedTls.options) fetchInit.tls = resolvedTls.options
          response = await fetch(requestUrl, fetchInit)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e
        throw networkFailure(
          "requests.send: fetch failed",
          e,
          network,
          start,
          onNetworkEvent,
        )
      }
      recordNetworkEvent(
        network,
        start,
        "response",
        `${response.status} ${response.statusText || "Response"} - ${[...response.headers].length} headers`,
        onNetworkEvent,
      )
      if (cookies) {
        cookies.storeResponseCookies(currentUrl, response.headers)
      }
      return response
    }

    const challengeFor = (response: globalThis.Response): NtlmChallenge => {
      try {
        return getNtlmChallenge(response.headers.get("www-authenticate"))
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        throw networkFailure(
          `requests.send: invalid NTLM challenge: ${message}`,
          e,
          network,
          start,
          onNetworkEvent,
        )
      }
    }

    const consumeChallenge = async (response: globalThis.Response) => {
      try {
        await response.arrayBuffer()
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e
        throw networkFailure(
          "requests.send: failed to consume NTLM challenge response",
          e,
          network,
          start,
          onNetworkEvent,
        )
      }
    }

    try {
      res = await fetchOnce()
      if (
        ntlmEnabled &&
        substituted.auth?.type === "ntlm" &&
        res.status === 401
      ) {
        let challenge = challengeFor(res)
        let type1: Buffer | undefined

        if (
          challenge.kind === "offer" ||
          (challenge.kind === "type2" && challenge.message.requiresMic)
        ) {
          await consumeChallenge(res)
          type1 = createType1Message()
          const scheme = challenge.scheme
          res = await fetchOnce(`${scheme} ${type1.toString("base64")}`)
          challenge = res.status === 401 ? challengeFor(res) : { kind: "none" }
        }

        if (challenge.kind === "type2") {
          await consumeChallenge(res)
          const type3 = createType3Message(
            challenge.message,
            substituted.auth,
            { type1 },
          )
          res = await fetchOnce(
            `${challenge.scheme} ${type3.toString("base64")}`,
          )
        }
      }
    } finally {
      ntlmConnection?.close()
    }

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
        onNetworkEvent,
      )
    }
    redirectCount++

    const previousUrl = new URL(currentUrl)
    let nextUrl: URL
    try {
      nextUrl = new URL(loc, previousUrl)
    } catch (e) {
      throw networkFailure(
        "requests.send: invalid redirect location",
        e,
        network,
        start,
        onNetworkEvent,
      )
    }
    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw networkFailure(
        `requests.send: redirect URL uses unsupported scheme "${nextUrl.protocol}"`,
        undefined,
        network,
        start,
        onNetworkEvent,
      )
    }
    if (previousUrl.protocol === "https:" && nextUrl.protocol === "http:") {
      throw networkFailure(
        "requests.send: refusing HTTPS to HTTP redirect downgrade",
        undefined,
        network,
        start,
        onNetworkEvent,
      )
    }
    if (previousUrl.origin !== nextUrl.origin) {
      if (!allowCrossOriginRedirects) {
        throw networkFailure(
          "requests.send: refusing a cross-origin redirect for a credential-bearing request",
          undefined,
          network,
          start,
          onNetworkEvent,
        )
      }
      awsSigningEnabled = false
      ntlmEnabled = false
      oauth1SigningEnabled = false
      oauth2Enabled = false
      nextUrl = new URL(stripOAuth1Credentials(nextUrl.toString()))
      if (substituted.auth?.type === "oauth2") {
        nextUrl.searchParams.delete(substituted.auth.token_query_key)
      }
      currentInit = {
        ...currentInit,
        headers: clearAwsSignerHeaders(
          stripCrossOriginCredentials(
            currentInit.headers,
            substituted.auth?.type === "oauth2"
              ? substituted.auth.token_header
              : ah?.name,
          ),
        ),
      }
    }
    currentUrl = nextUrl.toString()
    recordNetworkEvent(
      network,
      start,
      "redirect",
      `${res.status} -> ${networkUrl(currentUrl)}`,
      onNetworkEvent,
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
      onNetworkEvent,
    )
  }

  recordNetworkEvent(
    network,
    start,
    "body",
    `Body received - ${new TextEncoder().encode(body).length} bytes`,
    onNetworkEvent,
  )
  recordNetworkEvent(
    network,
    start,
    "complete",
    `Completed in ${Math.round(performance.now() - start)}ms`,
    onNetworkEvent,
  )

  return {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body,
    timeMs: performance.now() - start,
    network,
    sentCookies,
    cookies: parseResponseCookies(res.headers),
  }
}

function parseCookieHeader(header: string | null): CookiePair[] {
  if (!header) return []
  return header.split(";").flatMap((part) => {
    const separator = part.indexOf("=")
    const name = part.slice(0, separator).trim()
    if (separator < 1 || name === "") return []
    return [{ name, value: part.slice(separator + 1).trim() }]
  })
}

function stripCrossOriginCredentials(
  headers: HeadersInit | undefined,
  authHeaderName: string | undefined,
): Headers {
  const result = new Headers(headers)
  for (const name of [
    "authorization",
    "proxy-authorization",
    "cookie",
    "cookie2",
    "host",
    authHeaderName,
  ]) {
    if (name) result.delete(name)
  }
  return result
}

// User-authored Cookie header entries win; jar cookies fill missing names.
function mergeCookieHeader(userHeader: string, jarHeader: string): string {
  const names = new Set(
    userHeader
      .split(";")
      .map((part) => part.split("=")[0]?.trim())
      .filter(Boolean),
  )
  const extras = jarHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !names.has(part.split("=")[0]?.trim()))
  return [userHeader, ...extras].join("; ")
}

function recordNetworkEvent(
  network: NetworkEvent[],
  start: number,
  type: NetworkEventType,
  message: string,
  onNetworkEvent?: (network: NetworkEvent[]) => void,
): void {
  network.push({ timeMs: performance.now() - start, type, message })
  onNetworkEvent?.(network.map((event) => ({ ...event })))
}

function networkFailure(
  message: string,
  cause: unknown,
  network: NetworkEvent[],
  start: number,
  onNetworkEvent?: (network: NetworkEvent[]) => void,
): NetworkError {
  recordNetworkEvent(network, start, "error", message, onNetworkEvent)
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
        const filePath = expandUserPath(entry.value)
        if (!(await Bun.file(filePath).exists())) {
          throw new Error(`file not found: ${entry.value}`)
        }
        fd.append(entry.name, Bun.file(filePath))
      } else {
        fd.append(entry.name, entry.value)
      }
    }
    return fd as unknown as BodyInit
  }

  if (req.bodyType === "binary") {
    if (req.filePath) {
      const filePath = expandUserPath(req.filePath)
      if (!(await Bun.file(filePath).exists())) {
        throw new Error(`file not found: ${req.filePath}`)
      }
      headers.set("content-type", "application/octet-stream")
      return Bun.file(filePath) as unknown as BodyInit
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
