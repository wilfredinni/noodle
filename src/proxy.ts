import type {
  AppProxySettings,
  CollectionProxySettings,
  ProxyCredentials,
  ProxySettings,
} from "./schema"

const VARIABLE_RE = /\$\w+/
const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const

export interface SystemProxySettings {
  http?: string
  https?: string
  bypass: string[]
}

export interface StructuredProxyFields {
  protocol: "http" | "https"
  hostname: string
  port: string
}

export type StructuredProxyBuildResult = { url: string } | { error: string }

export type ProxyPolicy =
  | { kind: "direct"; source: "cli" | "global" | "collection" }
  | {
      kind: "custom"
      source: "global" | "collection"
      url: string
      bypass: string[]
      auth?: boolean
      credentials?: ProxyCredentials
    }
  | { kind: "system"; source: "system"; settings: SystemProxySettings }

export type ProxyRoute =
  | { kind: "direct"; reason: "cli" | "off" | "bypass" | "unconfigured" }
  | { kind: "proxy"; source: "global" | "collection" | "system"; url: string }

export function normalizeBypass(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const normalized = trimmed.toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push(trimmed)
    }
  }
  return out
}

export function parseAppProxy(value: unknown): AppProxySettings | undefined {
  if (value === undefined) return undefined
  try {
    return parseAppProxyStrict(value)
  } catch {
    return undefined
  }
}

export function parseAppProxyStrict(
  value: unknown,
  path = "proxy",
): AppProxySettings {
  return parseProxyStrict(value, path, "app") as AppProxySettings
}

export function parseCollectionProxy(
  value: unknown,
): CollectionProxySettings | undefined {
  if (value === undefined) return undefined
  try {
    return parseCollectionProxyStrict(value)
  } catch {
    return undefined
  }
}

export function parseCollectionProxyStrict(
  value: unknown,
  path = "proxy",
): CollectionProxySettings {
  return parseProxyStrict(value, path, "collection") as CollectionProxySettings
}

function parseProxyStrict(
  value: unknown,
  path: string,
  scope: "app" | "collection",
): AppProxySettings | CollectionProxySettings {
  if (!isRecord(value)) throw new Error(`${path}: must be a mapping`)
  const unknownKey = Object.keys(value).find(
    (key) => !["mode", "url", "bypass", "auth"].includes(key),
  )
  if (unknownKey) throw new Error(`${path}: unknown key "${unknownKey}"`)
  if (typeof value.mode !== "string") {
    throw new Error(`${path}.mode: must be a string`)
  }
  const defaultMode = scope === "app" ? "system" : "inherit"
  if (value.mode === defaultMode || value.mode === "off") {
    if (
      value.url !== undefined ||
      value.bypass !== undefined ||
      value.auth !== undefined
    ) {
      throw new Error(
        `${path}: mode "${value.mode}" does not accept url, bypass, or auth`,
      )
    }
    return { mode: value.mode }
  }
  if (value.mode !== "custom") {
    throw new Error(`${path}.mode: expected ${defaultMode}, off, or custom`)
  }
  if (typeof value.url !== "string") {
    throw new Error(`${path}.url: must be a string`)
  }
  if (
    value.bypass !== undefined &&
    (!Array.isArray(value.bypass) ||
      value.bypass.some((item) => typeof item !== "string"))
  ) {
    throw new Error(`${path}.bypass: must be a list of strings`)
  }
  if (value.auth !== undefined && typeof value.auth !== "boolean") {
    throw new Error(`${path}.auth: must be a boolean`)
  }
  const url = value.url.trim()
  const error = validateProxyTemplate(url)
  if (error !== null) throw new Error(`${path}.url: ${error}`)
  return customProxy(url, normalizeBypass(value.bypass), value.auth)
}

export function systemProxyFromEnv(
  env: Record<string, string | undefined> = process.env,
): SystemProxySettings {
  return {
    http: env.HTTP_PROXY || env.http_proxy,
    https:
      env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy,
    bypass: splitBypass(env.NO_PROXY || env.no_proxy),
  }
}

export function takeSystemProxyFromEnv(
  env: Record<string, string | undefined> = process.env,
): SystemProxySettings {
  const settings = systemProxyFromEnv(env)
  for (const key of PROXY_ENV_KEYS) delete env[key]
  return settings
}

export function createProxyFetcher(
  policy: ProxyPolicy,
  fetcher: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> = globalThis.fetch,
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const route = proxyForUrl(policy, target)
    const fetchInit: BunFetchRequestInit = { ...init }
    if (route.kind === "proxy") fetchInit.proxy = route.url
    else delete fetchInit.proxy
    return fetcher(input, fetchInit)
  }
}

export function environmentForProxyPolicy(
  policy: ProxyPolicy,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const result = { ...baseEnv }
  for (const key of PROXY_ENV_KEYS) delete result[key]
  if (policy.kind === "direct") return result

  if (policy.kind === "system") {
    setProxyEnvironment(result, policy.settings)
    return result
  }

  const url = resolvedCustomProxyUrl(policy)
  setProxyEnvironment(result, {
    http: url,
    https: url,
    bypass: policy.bypass,
  })
  return result
}

export function resolveProxyPolicy({
  noProxy = false,
  appProxy,
  collectionProxy,
  appCredentials,
  collectionCredentials,
  systemProxy,
}: {
  noProxy?: boolean
  appProxy?: AppProxySettings
  collectionProxy?: CollectionProxySettings
  appCredentials?: ProxyCredentials
  collectionCredentials?: ProxyCredentials
  systemProxy: SystemProxySettings
}): ProxyPolicy {
  if (noProxy) return { kind: "direct", source: "cli" }
  if (collectionProxy?.mode === "off") {
    return { kind: "direct", source: "collection" }
  }
  if (collectionProxy?.mode === "custom") {
    const policy: ProxyPolicy = {
      kind: "custom",
      source: "collection",
      url: collectionProxy.url,
      bypass: collectionProxy.bypass ?? [],
    }
    if (collectionProxy.auth) {
      policy.auth = true
      policy.credentials = collectionCredentials
    }
    return policy
  }
  if (appProxy?.mode === "off") return { kind: "direct", source: "global" }
  if (appProxy?.mode === "custom") {
    const policy: ProxyPolicy = {
      kind: "custom",
      source: "global",
      url: appProxy.url,
      bypass: appProxy.bypass ?? [],
    }
    if (appProxy.auth) {
      policy.auth = true
      policy.credentials = appCredentials
    }
    return policy
  }
  return { kind: "system", source: "system", settings: systemProxy }
}

export function proxyForUrl(
  policy: ProxyPolicy | undefined,
  target: string,
): ProxyRoute {
  if (!policy) return { kind: "direct", reason: "unconfigured" }
  if (policy.kind === "direct") {
    return { kind: "direct", reason: policy.source === "cli" ? "cli" : "off" }
  }

  let url: URL
  try {
    url = new URL(target)
  } catch {
    return { kind: "direct", reason: "unconfigured" }
  }

  if (policy.kind === "custom") {
    if (matchesBypass(url, policy.bypass))
      return { kind: "direct", reason: "bypass" }
    return {
      kind: "proxy",
      source: policy.source,
      url: resolvedCustomProxyUrl(policy),
    }
  }

  if (matchesBypass(url, policy.settings.bypass)) {
    return { kind: "direct", reason: "bypass" }
  }
  const proxy =
    url.protocol === "https:" ? policy.settings.https : policy.settings.http
  return proxy
    ? { kind: "proxy", source: "system", url: proxy }
    : { kind: "direct", reason: "unconfigured" }
}

export function validateProxyTemplate(template: string): string | null {
  const value = template.trim()
  if (!value) return "Proxy URL is required"
  if (/^[a-z][a-z\d+.-]*:\/\/[^/?#]*@/i.test(value)) {
    return "Proxy URL cannot contain credentials; configure authentication in Settings"
  }
  if (VARIABLE_RE.test(value)) {
    return "Proxy URL cannot contain variables; configure authentication in Settings"
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Proxy URL must use http or https"
    }
    if (parsed.username || parsed.password) {
      return "Proxy URL cannot contain credentials; configure authentication in Settings"
    }
    return null
  } catch {
    return "Proxy URL is invalid"
  }
}

export function parseStructuredProxyTemplate(
  template: string,
): StructuredProxyFields | null {
  if (template !== template.trim()) return null
  if (validateProxyTemplate(template) !== null) return null

  const match = template.match(
    /^(https?):\/\/(\[[^\]]+\]|[^:/?#@\s]+)(?::(\d+))?$/,
  )
  if (!match) return null

  const [, protocol, rawHostname, port] = match
  const hostname = rawHostname!.startsWith("[")
    ? rawHostname.slice(1, -1)
    : rawHostname!

  return {
    protocol: protocol as "http" | "https",
    hostname,
    port: port ?? "",
  }
}

export function buildStructuredProxyTemplate(
  fields: StructuredProxyFields,
): StructuredProxyBuildResult {
  const hostname = fields.hostname.trim()
  if (!hostname) return { error: "Proxy hostname is required" }
  if (/[/?#@\s]/.test(hostname)) {
    return { error: "Proxy hostname is invalid" }
  }

  const port = fields.port.trim()
  if (port) {
    const portNumber = Number(port)
    if (!/^\d+$/.test(port) || portNumber < 1 || portNumber > 65535) {
      return { error: "Proxy port must be between 1 and 65535" }
    }
  }

  const host =
    hostname.includes(":") && !hostname.startsWith("[")
      ? `[${hostname}]`
      : hostname
  const url = `${fields.protocol}://${host}${port ? `:${port}` : ""}`
  const validationError = validateProxyTemplate(url)
  return validationError ? { error: validationError } : { url }
}

function customProxy<T extends AppProxySettings | CollectionProxySettings>(
  url: string,
  bypass: string[],
  auth: unknown,
): T {
  const result: ProxySettings = {
    mode: "custom",
    url,
  }
  if (bypass.length > 0) result.bypass = bypass
  if (auth === true) result.auth = true
  return result as T
}

function resolvedCustomProxyUrl(
  policy: Extract<ProxyPolicy, { kind: "custom" }>,
): string {
  if (!policy.auth) return policy.url
  const username = policy.credentials?.username
  if (!username) {
    throw new Error(
      `proxy: authentication is enabled for the ${policy.source} proxy, but its username secret is missing`,
    )
  }
  const url = new URL(policy.url)
  url.username = username
  url.password = policy.credentials?.password ?? ""
  return url.toString()
}

export function redactProxyUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.username || url.password) {
      url.username = "***"
      url.password = "***"
    }
    return url.toString()
  } catch {
    return "[invalid proxy]"
  }
}

function matchesBypass(url: URL, entries: string[]): boolean {
  return entries.some((entry) => matchesBypassEntry(url, entry))
}

function matchesBypassEntry(url: URL, rawEntry: string): boolean {
  const entry = rawEntry.trim().toLowerCase()
  if (!entry) return false
  if (entry === "*") return true

  const { host, port } = splitHostPort(entry)
  if (!host || (port && port !== effectivePort(url))) return false
  const hostname = url.hostname.toLowerCase()
  if (host.startsWith("[")) {
    return hostname.replace(/^\[|\]$/g, "") === host.slice(1, -1)
  }
  const normalizedHost = host.startsWith(".") ? host.slice(1) : host
  return hostname === normalizedHost || hostname.endsWith(`.${normalizedHost}`)
}

function splitHostPort(value: string): { host: string; port?: string } {
  if (value.startsWith("[")) {
    const close = value.indexOf("]")
    if (close === -1) return { host: value }
    return value[close + 1] === ":"
      ? { host: value.slice(0, close + 1), port: value.slice(close + 2) }
      : { host: value.slice(0, close + 1) }
  }
  const colon = value.lastIndexOf(":")
  if (colon > 0 && /^\d+$/.test(value.slice(colon + 1))) {
    return { host: value.slice(0, colon), port: value.slice(colon + 1) }
  }
  return { host: value }
}

function effectivePort(url: URL): string {
  if (url.port) return url.port
  return url.protocol === "https:" ? "443" : "80"
}

function splitBypass(value: string | undefined): string[] {
  return value ? normalizeBypass(value.split(",")) : []
}

function setProxyEnvironment(
  env: Record<string, string | undefined>,
  settings: SystemProxySettings,
): void {
  if (settings.http) env.HTTP_PROXY = env.http_proxy = settings.http
  if (settings.https) env.HTTPS_PROXY = env.https_proxy = settings.https
  if (settings.bypass.length > 0) {
    env.NO_PROXY = env.no_proxy = settings.bypass.join(",")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
