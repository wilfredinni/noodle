import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { decodeJwt, importPKCS8, SignJWT } from "jose"
import {
  normalizeOAuth2DiscoveryUrl,
  oauth2DiscoveryUrlForIssuer,
} from "../auth/oauth2"
import type { ProxyPolicy } from "../proxy"
import type {
  OAuth2AdditionalParameter,
  OAuth2Auth,
  ParamEntry,
  Request,
} from "../schema"
import {
  deleteOAuth2Credential,
  getOAuth2Credential,
  setOAuth2Credential,
} from "../secrets"
import type { TlsPolicy } from "../tls"
import { expandUserPath } from "../userPath"
import { send } from "./send"
import {
  runLoopbackAuthorization,
  type OAuthBrowserLauncher,
} from "./oauth2Browser"

export type OAuth2Mode = "interactive" | "cached-only" | "disabled"

export interface OAuth2TokenSet extends Record<string, unknown> {
  access_token?: string
  id_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
  _noodle_expires_at?: number
}

export interface OAuth2Context {
  collectionDir?: string
  mode: OAuth2Mode
  signal?: AbortSignal
  proxyPolicy?: ProxyPolicy
  tlsPolicy?: TlsPolicy
  openBrowser?: OAuthBrowserLauncher
  onAuthEvent?: (message: string) => void
}

const memoryTokens = new Map<string, OAuth2TokenSet>()
const inflight = new Map<string, Promise<OAuth2TokenSet>>()

function isLoopback(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  )
}

export function validateOAuthEndpoint(value: string, field: string): URL {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch (e) {
    throw new Error(`OAuth 2 ${field} must be a valid URL`, { cause: e })
  }
  if (
    endpoint.protocol !== "https:" &&
    !(endpoint.protocol === "http:" && isLoopback(endpoint.hostname))
  ) {
    throw new Error(
      `OAuth 2 ${field} must use HTTPS unless it targets a loopback host`,
    )
  }
  if (endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error(
      `OAuth 2 ${field} must not contain credentials or a URL fragment`,
    )
  }
  return endpoint
}

export function oauth2CredentialKey(auth: OAuth2Auth): string {
  if (auth.credentials_id.trim()) return `id:${auth.credentials_id.trim()}`
  return createHash("sha256")
    .update(
      JSON.stringify({
        grant_type: auth.grant_type,
        discovery_url: auth.discovery_url,
        authorization_url: auth.authorization_url,
        access_token_url: auth.access_token_url,
        refresh_token_url: auth.refresh_token_url,
        client_id: auth.client_id,
        client_secret: auth.client_secret,
        username: auth.username,
        password: auth.password,
        scope: auth.scope,
        audience: auth.audience,
        redirect_uri: auth.redirect_uri,
        pkce: auth.pkce,
        pkce_method: auth.pkce_method,
        implicit_response_type: auth.implicit_response_type,
        credentials_placement: auth.credentials_placement,
        client_authentication: auth.client_authentication,
        client_assertion_algorithm: auth.client_assertion_algorithm,
        client_assertion_key: auth.client_assertion_key,
        client_assertion_issuer: auth.client_assertion_issuer,
        client_assertion_subject: auth.client_assertion_subject,
        client_assertion_audience: auth.client_assertion_audience,
        additional_parameters: auth.additional_parameters,
      }),
    )
    .digest("hex")
}

function memoryKey(
  collectionDir: string | undefined,
  credentialKey: string,
): string {
  return `${collectionDir ?? "session"}\0${credentialKey}`
}

function warn(context: OAuth2Context, message: string): void {
  context.onAuthEvent?.(message)
}

async function resolveOAuth2Endpoints(
  auth: OAuth2Auth,
  context: OAuth2Context,
  requireAuthorization: boolean,
  requireToken: boolean,
): Promise<OAuth2Auth> {
  const needsAuthorization = requireAuthorization && !auth.authorization_url
  const needsToken = requireToken && !auth.access_token_url
  if ((!needsAuthorization && !needsToken) || !auth.discovery_url) return auth

  const discoveryUrl = normalizeOAuth2DiscoveryUrl(
    validateOAuthEndpoint(auth.discovery_url, "discovery_url"),
  )
  warn(context, "Discovering OAuth 2 endpoints")
  const response = await send(
    {
      id: "oauth2-discovery",
      name: "OAuth 2 discovery",
      method: "GET",
      url: discoveryUrl.toString(),
      timeout: 30_000,
      followRedirects: true,
      maxRedirects: 5,
      headers: { Accept: { value: "application/json", enabled: true } },
      params: [],
      auth: { type: "none" },
      sendCookies: false,
    },
    {
      signal: context.signal,
      proxyPolicy: context.proxyPolicy,
      tlsPolicy: context.tlsPolicy,
      collectionDir: context.collectionDir,
      oauthMode: "disabled",
      allowCrossOriginRedirects: false,
    },
  )
  if (response.status !== 200) {
    throw new Error(
      `OAuth 2 discovery endpoint returned HTTP ${response.status}`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(response.body)
  } catch (e) {
    throw new Error("OAuth 2 discovery endpoint returned invalid JSON", {
      cause: e,
    })
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("OAuth 2 discovery endpoint must return a JSON object")
  }
  const metadata = parsed as Record<string, unknown>
  if (typeof metadata.issuer !== "string" || !metadata.issuer) {
    throw new Error(
      "OAuth 2 discovery response field issuer must be a non-empty string",
    )
  }
  const issuerUrl = validateOAuthEndpoint(
    metadata.issuer,
    "discovery response field issuer",
  )
  if (
    issuerUrl.search ||
    oauth2DiscoveryUrlForIssuer(issuerUrl).toString() !==
      discoveryUrl.toString()
  ) {
    throw new Error(
      "OAuth 2 discovery response issuer does not match discovery_url",
    )
  }
  const resolved = {
    ...auth,
    authorization_url:
      auth.authorization_url ||
      (typeof metadata.authorization_endpoint === "string"
        ? metadata.authorization_endpoint
        : ""),
    access_token_url:
      auth.access_token_url ||
      (typeof metadata.token_endpoint === "string"
        ? metadata.token_endpoint
        : ""),
  }
  if (needsAuthorization && !resolved.authorization_url) {
    throw new Error(
      "OAuth 2 discovery response field authorization_endpoint must be a non-empty string",
    )
  }
  if (needsToken && !resolved.access_token_url) {
    throw new Error(
      "OAuth 2 discovery response field token_endpoint must be a non-empty string",
    )
  }
  if (requireAuthorization) {
    validateOAuthEndpoint(resolved.authorization_url, "authorization_url")
  }
  if (requireToken) {
    validateOAuthEndpoint(resolved.access_token_url, "access_token_url")
  }
  return resolved
}

async function loadToken(
  auth: OAuth2Auth,
  context: OAuth2Context,
): Promise<OAuth2TokenSet | undefined> {
  const credentialKey = oauth2CredentialKey(auth)
  const key = memoryKey(context.collectionDir, credentialKey)
  const inMemory = memoryTokens.get(key)
  if (inMemory) return inMemory
  if (!context.collectionDir) {
    warn(
      context,
      "OAuth 2 secure storage unavailable; using session memory only",
    )
    return undefined
  }
  try {
    const stored = await getOAuth2Credential(
      context.collectionDir,
      credentialKey,
    )
    if (!stored) return undefined
    const parsed = JSON.parse(stored) as unknown
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("stored OAuth token is not an object")
    }
    const token = parsed as OAuth2TokenSet
    memoryTokens.set(key, token)
    return token
  } catch {
    warn(
      context,
      "OAuth 2 credential vault unavailable; using session memory only",
    )
    return undefined
  }
}

async function saveToken(
  auth: OAuth2Auth,
  context: OAuth2Context,
  token: OAuth2TokenSet,
): Promise<void> {
  const credentialKey = oauth2CredentialKey(auth)
  memoryTokens.set(memoryKey(context.collectionDir, credentialKey), token)
  if (!context.collectionDir) {
    warn(context, "OAuth 2 token is available for this session only")
    return
  }
  try {
    await setOAuth2Credential(
      context.collectionDir,
      credentialKey,
      JSON.stringify(token),
    )
  } catch {
    warn(
      context,
      "OAuth 2 token is available for this session only because secure storage failed",
    )
  }
}

export async function clearOAuth2Token(
  auth: OAuth2Auth,
  collectionDir?: string,
): Promise<void> {
  const credentialKey = oauth2CredentialKey(auth)
  memoryTokens.delete(memoryKey(collectionDir, credentialKey))
  if (collectionDir) {
    try {
      await deleteOAuth2Credential(collectionDir, credentialKey)
    } catch (e) {
      throw new Error(
        "OAuth 2 token was cleared from this session, but secure storage could not be cleared",
        { cause: e },
      )
    }
  }
}

function tokenValue(
  auth: OAuth2Auth,
  token: OAuth2TokenSet,
): string | undefined {
  const value = token[auth.token_source]
  return typeof value === "string" && value ? value : undefined
}

function jwtExpiry(value: string | undefined): number | undefined {
  if (!value) return undefined
  try {
    const exp = decodeJwt(value).exp
    return typeof exp === "number" ? exp * 1000 : undefined
  } catch {
    return undefined
  }
}

function normalizeTokenResponse(
  raw: Record<string, unknown>,
  previousRefreshToken?: string,
): OAuth2TokenSet {
  const token: OAuth2TokenSet = { ...raw }
  for (const key of [
    "access_token",
    "id_token",
    "refresh_token",
    "token_type",
    "scope",
  ] as const) {
    if (token[key] !== undefined && typeof token[key] !== "string") {
      throw new Error(`OAuth 2 token response field ${key} must be a string`)
    }
  }
  if (!token.refresh_token && previousRefreshToken)
    token.refresh_token = previousRefreshToken
  const expiresIn =
    typeof raw.expires_in === "number"
      ? raw.expires_in
      : typeof raw.expires_in === "string" &&
          /^\d+(?:\.\d+)?$/.test(raw.expires_in)
        ? Number(raw.expires_in)
        : undefined
  if (expiresIn !== undefined) {
    token.expires_in = expiresIn
    token._noodle_expires_at = Date.now() + expiresIn * 1000
  } else {
    token._noodle_expires_at =
      jwtExpiry(token.access_token) ?? jwtExpiry(token.id_token)
  }
  return token
}

function tokenIsValid(auth: OAuth2Auth, token: OAuth2TokenSet): boolean {
  if (!tokenValue(auth, token)) return false
  return (
    token._noodle_expires_at === undefined ||
    token._noodle_expires_at > Date.now() + 30_000
  )
}

function addAdditional(
  parameters: OAuth2AdditionalParameter[],
  headers: Record<string, { value: string; enabled: boolean }>,
  query: ParamEntry[],
  body: URLSearchParams,
): void {
  for (const parameter of parameters) {
    if (!parameter.enabled) continue
    if (parameter.placement === "header") {
      headers[parameter.name] = { value: parameter.value, enabled: true }
    } else if (parameter.placement === "query") {
      query.push({
        name: parameter.name,
        value: parameter.value,
        enabled: true,
      })
    } else {
      body.append(parameter.name, parameter.value)
    }
  }
}

async function assertionKey(
  auth: OAuth2Auth,
  collectionDir?: string,
): Promise<string> {
  if (auth.client_assertion_key_type === "text")
    return auth.client_assertion_key
  const expanded = expandUserPath(auth.client_assertion_key)
  const path = isAbsolute(expanded)
    ? expanded
    : resolve(collectionDir ?? process.cwd(), expanded)
  try {
    return await readFile(path, "utf8")
  } catch (e) {
    throw new Error(
      `Unable to read OAuth 2 client assertion key "${auth.client_assertion_key}"`,
      { cause: e },
    )
  }
}

async function clientAssertion(
  auth: OAuth2Auth,
  audience: string,
  context: OAuth2Context,
): Promise<string> {
  if (!auth.client_assertion_key)
    throw new Error("OAuth 2 client assertion requires client_assertion_key")
  const alg = auth.client_assertion_algorithm
  const rawKey = await assertionKey(auth, context.collectionDir)
  const key = alg.startsWith("HS")
    ? new TextEncoder().encode(rawKey)
    : await importPKCS8(rawKey, alg)
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg, typ: "JWT" })
    .setIssuer(auth.client_assertion_issuer || auth.client_id)
    .setSubject(auth.client_assertion_subject || auth.client_id)
    .setAudience(auth.client_assertion_audience || audience)
    .setIssuedAt(now)
    .setExpirationTime(now + auth.client_assertion_lifetime)
    .setJti(randomUUID())
    .sign(key)
}

async function applyClientAuthentication(
  auth: OAuth2Auth,
  endpoint: string,
  context: OAuth2Context,
  headers: Record<string, { value: string; enabled: boolean }>,
  body: URLSearchParams,
): Promise<void> {
  if (auth.client_authentication === "client_assertion") {
    body.set("client_id", auth.client_id)
    body.set(
      "client_assertion_type",
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    )
    body.set("client_assertion", await clientAssertion(auth, endpoint, context))
    return
  }
  if (auth.credentials_placement === "basic") {
    const encode = (value: string) =>
      new URLSearchParams({ value }).toString().slice("value=".length)
    headers.Authorization = {
      value: `Basic ${Buffer.from(`${encode(auth.client_id)}:${encode(auth.client_secret)}`).toString("base64")}`,
      enabled: true,
    }
  } else {
    body.set("client_id", auth.client_id)
    if (auth.client_secret) body.set("client_secret", auth.client_secret)
  }
}

function tokenResponseObject(
  body: string,
  contentType: string | undefined,
): Record<string, unknown> {
  try {
    if (contentType?.includes("json") || body.trim().startsWith("{")) {
      const parsed = JSON.parse(body) as unknown
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      )
        return parsed as Record<string, unknown>
    } else {
      return Object.fromEntries(new URLSearchParams(body))
    }
  } catch (e) {
    throw new Error("OAuth 2 token endpoint returned an invalid response", {
      cause: e,
    })
  }
  throw new Error("OAuth 2 token endpoint returned an invalid response")
}

async function requestToken(
  auth: OAuth2Auth,
  context: OAuth2Context,
  phase: "token" | "refresh",
  required: Record<string, string>,
  previousRefreshToken?: string,
): Promise<OAuth2TokenSet> {
  auth = await resolveOAuth2Endpoints(
    auth,
    context,
    false,
    phase === "token" || !auth.refresh_token_url,
  )
  const endpointValue =
    phase === "refresh"
      ? auth.refresh_token_url || auth.access_token_url
      : auth.access_token_url
  const endpoint = validateOAuthEndpoint(
    endpointValue,
    phase === "refresh" ? "refresh_token_url" : "access_token_url",
  )
  const headers: Record<string, { value: string; enabled: boolean }> = {}
  const query: ParamEntry[] = []
  const body = new URLSearchParams()
  addAdditional(auth.additional_parameters[phase], headers, query, body)
  for (const [name, value] of Object.entries(required)) body.set(name, value)
  if (auth.scope && !body.has("scope")) body.set("scope", auth.scope)
  if (auth.audience && !body.has("audience"))
    body.set("audience", auth.audience)
  await applyClientAuthentication(
    auth,
    endpoint.toString(),
    context,
    headers,
    body,
  )

  warn(
    context,
    phase === "refresh" ? "Refreshing OAuth 2 token" : "Fetching OAuth 2 token",
  )
  const request: Request = {
    id: `oauth2-${phase}`,
    name: `OAuth 2 ${phase}`,
    method: "POST",
    url: endpoint.toString(),
    timeout: 30_000,
    followRedirects: true,
    maxRedirects: 5,
    headers,
    params: query,
    bodyType: "urlencoded",
    formData: [...body].map(([name, value]) => ({
      name,
      value,
      enabled: true,
      type: "text",
    })),
    auth: { type: "none" },
  }
  const response = await send(request, {
    signal: context.signal,
    proxyPolicy: context.proxyPolicy,
    tlsPolicy: context.tlsPolicy,
    collectionDir: context.collectionDir,
    oauthMode: "disabled",
    allowCrossOriginRedirects: false,
  })
  if (response.status < 200 || response.status >= 300) {
    let detail = ""
    try {
      const parsed = tokenResponseObject(
        response.body,
        response.headers["content-type"],
      )
      const code = typeof parsed.error === "string" ? parsed.error : undefined
      const description =
        typeof parsed.error_description === "string"
          ? parsed.error_description
          : undefined
      if (code || description) {
        detail = `: ${code ?? ""}${code && description ? " - " : ""}${description ?? ""}`
      }
    } catch {
      // Preserve the status-only error when the response body is invalid.
    }
    throw new Error(
      `OAuth 2 token endpoint returned HTTP ${response.status}${detail}`,
    )
  }
  return normalizeTokenResponse(
    tokenResponseObject(response.body, response.headers["content-type"]),
    previousRefreshToken,
  )
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

async function authorizeInBrowser(
  auth: OAuth2Auth,
  context: OAuth2Context,
): Promise<OAuth2TokenSet> {
  if (!auth.authorization_url)
    throw new Error("OAuth 2 browser grant requires authorization_url")
  const authorizationUrl = validateOAuthEndpoint(
    auth.authorization_url,
    "authorization_url",
  )
  const state = base64Url(randomBytes(32))
  const verifier = base64Url(randomBytes(32))
  for (const parameter of auth.additional_parameters.authorization) {
    if (!parameter.enabled) continue
    if (parameter.placement !== "query") {
      throw new Error(
        "OAuth 2 authorization additional parameters must use query placement",
      )
    }
    authorizationUrl.searchParams.append(parameter.name, parameter.value)
  }
  authorizationUrl.searchParams.set("client_id", auth.client_id)
  authorizationUrl.searchParams.set("redirect_uri", auth.redirect_uri)
  authorizationUrl.searchParams.set("state", state)
  if (auth.scope) authorizationUrl.searchParams.set("scope", auth.scope)
  if (auth.audience)
    authorizationUrl.searchParams.set("audience", auth.audience)

  const implicit = auth.grant_type === "implicit"
  authorizationUrl.searchParams.set(
    "response_type",
    implicit ? auth.implicit_response_type : "code",
  )
  if (!implicit && auth.pkce) {
    authorizationUrl.searchParams.set("code_challenge_method", auth.pkce_method)
    authorizationUrl.searchParams.set(
      "code_challenge",
      auth.pkce_method === "S256"
        ? base64Url(createHash("sha256").update(verifier).digest())
        : verifier,
    )
    if (auth.pkce_method === "plain")
      warn(context, "OAuth 2 plain PKCE is legacy and not recommended")
  }
  if (implicit)
    warn(context, "OAuth 2 implicit grant is legacy and not recommended")
  warn(context, "Opening the system browser for OAuth 2 authorization")
  const result = await runLoopbackAuthorization({
    authorizationUrl: authorizationUrl.toString(),
    redirectUri: auth.redirect_uri,
    state,
    implicit,
    signal: context.signal,
    openBrowser: context.openBrowser,
  })

  if (implicit) return normalizeTokenResponse(Object.fromEntries(result))
  const code = result.get("code")
  if (!code)
    throw new Error("OAuth 2 authorization response did not include a code")
  return requestToken(auth, context, "token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: auth.redirect_uri,
    ...(auth.pkce ? { code_verifier: verifier } : {}),
  })
}

async function fetchNewToken(
  auth: OAuth2Auth,
  context: OAuth2Context,
): Promise<OAuth2TokenSet> {
  if (!auth.client_id) throw new Error("OAuth 2 requires client_id")
  if (
    auth.grant_type === "authorization_code" ||
    auth.grant_type === "implicit"
  ) {
    if (context.mode !== "interactive") {
      throw new Error(
        "OAuth 2 authorization is required. Open this request in the Noodle TUI and run Fetch/authorize OAuth 2 token.",
      )
    }
    return authorizeInBrowser(
      await resolveOAuth2Endpoints(
        auth,
        context,
        true,
        auth.grant_type === "authorization_code",
      ),
      context,
    )
  }
  if (auth.grant_type === "password") {
    warn(context, "OAuth 2 password grant is legacy and not recommended")
    if (!auth.username || !auth.password)
      throw new Error("OAuth 2 password grant requires username and password")
    return requestToken(auth, context, "token", {
      grant_type: "password",
      username: auth.username,
      password: auth.password,
    })
  }
  return requestToken(auth, context, "token", {
    grant_type: "client_credentials",
  })
}

async function resolveUncoalesced(
  auth: OAuth2Auth,
  context: OAuth2Context,
  force: boolean,
): Promise<OAuth2TokenSet> {
  const cached = await loadToken(auth, context)
  if (!force && cached && tokenIsValid(auth, cached)) {
    warn(context, "Using cached OAuth 2 token")
    return cached
  }
  if (!force && cached?.refresh_token && auth.auto_refresh_token) {
    try {
      const refreshed = await requestToken(
        auth,
        context,
        "refresh",
        {
          grant_type: "refresh_token",
          refresh_token: cached.refresh_token,
        },
        cached.refresh_token,
      )
      await saveToken(auth, context, refreshed)
      return refreshed
    } catch (e) {
      if (
        context.signal?.aborted ||
        (e instanceof Error && e.name === "AbortError")
      ) {
        throw e
      }
      if (!auth.auto_fetch_token) throw e
      warn(
        context,
        `OAuth 2 token refresh failed; requesting a new token: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  if (!force && !auth.auto_fetch_token) {
    throw new Error(
      "OAuth 2 token is missing or expired and auto_fetch_token is disabled",
    )
  }
  const fetched = await fetchNewToken(auth, context)
  await saveToken(auth, context, fetched)
  return fetched
}

export async function resolveOAuth2Token(
  auth: OAuth2Auth,
  context: OAuth2Context,
  options: { force?: boolean } = {},
): Promise<{ token: string; tokenSet: OAuth2TokenSet }> {
  if (context.mode === "disabled")
    throw new Error("OAuth 2 resolution is disabled for this request")
  const force = options.force ?? false
  const key = `${memoryKey(context.collectionDir, oauth2CredentialKey(auth))}\0${context.mode}`
  const canCoalesce = !force && !context.signal
  let pending = canCoalesce ? inflight.get(key) : undefined
  if (!pending) {
    pending = resolveUncoalesced(auth, context, force)
    if (canCoalesce) {
      inflight.set(key, pending)
      const clear = () => {
        if (inflight.get(key) === pending) inflight.delete(key)
      }
      void pending.then(clear, clear)
    }
  }
  const tokenSet = await pending
  const token = tokenValue(auth, tokenSet)
  if (!token)
    throw new Error(
      `OAuth 2 token response did not include ${auth.token_source}`,
    )
  return { token, tokenSet }
}

export async function currentOAuth2Token(
  auth: OAuth2Auth,
  collectionDir?: string,
  onAuthEvent?: (message: string) => void,
): Promise<string | undefined> {
  const token = await loadToken(auth, {
    collectionDir,
    mode: "cached-only",
    onAuthEvent,
  })
  return token ? tokenValue(auth, token) : undefined
}
