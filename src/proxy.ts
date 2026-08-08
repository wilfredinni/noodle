import type {
  AppProxySettings,
  CollectionProxySettings,
  Environment,
} from "./schema"

const VAR_RE = /\$(\w+)/g
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
  auth: boolean
  username: string
  password: string
}

export type StructuredProxyBuildResult = { url: string } | { error: string }

export type ProxyPolicy =
  | { kind: "direct"; source: "cli" | "global" | "collection" }
  | {
      kind: "custom"
      source: "global" | "collection"
      url: string
      bypass: string[]
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
  if (!isRecord(value) || typeof value.mode !== "string") return undefined
  if (value.mode === "system") return { mode: "system" }
  if (value.mode === "off") return { mode: "off" }
  if (value.mode !== "custom" || typeof value.url !== "string") return undefined
  const url = value.url.trim()
  if (validateProxyTemplate(url) !== null) return undefined
  return customProxy(url, normalizeBypass(value.bypass))
}

export function parseCollectionProxy(
  value: unknown,
): CollectionProxySettings | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || typeof value.mode !== "string") return undefined
  if (value.mode === "inherit") return { mode: "inherit" }
  if (value.mode === "off") return { mode: "off" }
  if (value.mode !== "custom" || typeof value.url !== "string") return undefined
  const url = value.url.trim()
  if (validateProxyTemplate(url) !== null) return undefined
  return customProxy(url, normalizeBypass(value.bypass))
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
  env?: Environment | null,
  fetcher: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> = globalThis.fetch,
) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const route = proxyForUrl(policy, target, env ?? undefined)
    const fetchInit: BunFetchRequestInit = { ...init }
    if (route.kind === "proxy") fetchInit.proxy = route.url
    return fetcher(input, fetchInit)
  }
}

export function resolveProxyPolicy({
  noProxy = false,
  appProxy,
  collectionProxy,
  systemProxy,
}: {
  noProxy?: boolean
  appProxy?: AppProxySettings
  collectionProxy?: CollectionProxySettings
  systemProxy: SystemProxySettings
}): ProxyPolicy {
  if (noProxy) return { kind: "direct", source: "cli" }
  if (collectionProxy?.mode === "off") {
    return { kind: "direct", source: "collection" }
  }
  if (collectionProxy?.mode === "custom") {
    return {
      kind: "custom",
      source: "collection",
      url: collectionProxy.url,
      bypass: collectionProxy.bypass ?? [],
    }
  }
  if (appProxy?.mode === "off") return { kind: "direct", source: "global" }
  if (appProxy?.mode === "custom") {
    return {
      kind: "custom",
      source: "global",
      url: appProxy.url,
      bypass: appProxy.bypass ?? [],
    }
  }
  return { kind: "system", source: "system", settings: systemProxy }
}

export function proxyForUrl(
  policy: ProxyPolicy | undefined,
  target: string,
  env?: Environment,
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
      url: resolveProxyUrl(policy.url, env),
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

export function resolveProxyUrl(template: string, env?: Environment): string {
  const url = template.replace(VAR_RE, (_, name: string) => {
    if (!env || !Object.hasOwn(env.vars, name)) {
      throw new Error(`proxy: unresolved variable "${name}" in proxy.url`)
    }
    return env.vars[name]
  })
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`proxy: invalid proxy URL: ${message}`, { cause: e })
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("proxy: URL must use http or https")
  }
  return url
}

export function validateProxyTemplate(template: string): string | null {
  const value = template.trim()
  if (!value) return "Proxy URL is required"
  try {
    const parseable = value
      .replace(/:\$\w+(?=[/?#]|$)/g, ":8080")
      .replace(VAR_RE, "proxy-variable")
    const parsed = new URL(parseable)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Proxy URL must use http or https"
    }
    const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1]
    const at = authority?.lastIndexOf("@") ?? -1
    const userInfo = at >= 0 ? authority?.slice(0, at) : undefined
    if (userInfo && userInfo.replace(VAR_RE, "").replaceAll(":", "")) {
      return "Use $VARNAME for proxy credentials"
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
    /^(https?):\/\/(?:(\$\w+):(\$\w+)@)?(\[[^\]]+\]|[^:/?#@\s]+)(?::(\d+))?$/,
  )
  if (!match) return null

  const [, protocol, username, password, rawHostname, port] = match
  const hostname = rawHostname!.startsWith("[")
    ? rawHostname.slice(1, -1)
    : rawHostname!

  return {
    protocol: protocol as "http" | "https",
    hostname,
    port: port ?? "",
    auth: username !== undefined,
    username: username ?? "",
    password: password ?? "",
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

  if (fields.auth) {
    if (!isVariableReference(fields.username)) {
      return { error: "Username must be a $VARNAME reference" }
    }
    if (!isVariableReference(fields.password)) {
      return { error: "Password must be a $VARNAME reference" }
    }
  }

  const host =
    hostname.includes(":") && !hostname.startsWith("[")
      ? `[${hostname}]`
      : hostname
  const credentials = fields.auth
    ? `${fields.username}:${fields.password}@`
    : ""
  const url = `${fields.protocol}://${credentials}${host}${port ? `:${port}` : ""}`
  const validationError = validateProxyTemplate(url)
  return validationError ? { error: validationError } : { url }
}

function customProxy<T extends AppProxySettings | CollectionProxySettings>(
  url: string,
  bypass: string[],
): T {
  return (
    bypass.length > 0
      ? { mode: "custom", url, bypass }
      : { mode: "custom", url }
  ) as T
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isVariableReference(value: string): boolean {
  return /^\$\w+$/.test(value)
}
