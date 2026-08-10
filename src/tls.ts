import { isAbsolute, resolve } from "node:path"
import type {
  ClientCertificateProfile,
  CollectionTlsSettings,
  Environment,
  Request,
} from "./schema"
import { expandUserPath } from "./userPath"
import { isVariableReference, variableReferenceName } from "./variableReference"

export interface TlsPolicy {
  collectionDir: string
  settings?: CollectionTlsSettings
  insecure?: boolean
}

export interface ResolvedTls {
  options?: BunFetchRequestInitTLS
  messages: string[]
}

export function parseCollectionTls(
  value: unknown,
): CollectionTlsSettings | undefined {
  if (value === undefined) return undefined
  try {
    return parseCollectionTlsStrict(value)
  } catch {
    return undefined
  }
}

export function parseCollectionTlsStrict(
  value: unknown,
  path = "tls",
): CollectionTlsSettings {
  if (!isRecord(value)) throw invalid(path, "must be a mapping")
  const unknownKey = Object.keys(value).find(
    (key) => !["verify", "ca_bundle", "client_certificates"].includes(key),
  )
  if (unknownKey) throw invalid(path, `unknown key "${unknownKey}"`)
  if (value.verify !== undefined && typeof value.verify !== "boolean") {
    throw invalid(`${path}.verify`, "must be a boolean")
  }
  if (value.ca_bundle !== undefined && typeof value.ca_bundle !== "string") {
    throw invalid(`${path}.ca_bundle`, "must be a string")
  }
  if (typeof value.ca_bundle === "string" && !value.ca_bundle.trim()) {
    throw invalid(`${path}.ca_bundle`, "must not be empty")
  }
  if (
    value.client_certificates !== undefined &&
    !Array.isArray(value.client_certificates)
  ) {
    throw invalid(`${path}.client_certificates`, "must be a list")
  }

  const profiles: ClientCertificateProfile[] = []
  for (const [index, raw] of (value.client_certificates ?? []).entries()) {
    const profile = parseClientCertificate(
      raw,
      `${path}.client_certificates[${index}]`,
    )
    if (!isEmptyClientCertificateProfile(profile)) profiles.push(profile)
  }

  const settings: CollectionTlsSettings = {}
  if (value.verify !== undefined) settings.verify = value.verify
  if (value.ca_bundle !== undefined) settings.caBundle = value.ca_bundle
  if (value.client_certificates !== undefined) {
    settings.clientCertificates = profiles
  }
  return settings
}

export function collectionTlsToYaml(
  settings: CollectionTlsSettings,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (settings.verify !== undefined) result.verify = settings.verify
  if (settings.caBundle !== undefined) result.ca_bundle = settings.caBundle
  if (settings.clientCertificates !== undefined) {
    result.client_certificates = settings.clientCertificates
      .filter((profile) => !isEmptyClientCertificateProfile(profile))
      .map((profile) => {
        const value: Record<string, unknown> = {
          host: profile.host,
          cert_file: profile.certFile,
          key_file: profile.keyFile,
        }
        if (profile.port !== undefined) value.port = profile.port
        if (profile.passphrase !== undefined) {
          value.passphrase = profile.passphrase
        }
        if (profile.enabled !== undefined) value.enabled = profile.enabled
        return value
      })
  }
  parseCollectionTlsStrict(result)
  return result
}

export async function tlsForUrl(
  request: Pick<Request, "tls">,
  url: string,
  env: Environment | undefined,
  policy: TlsPolicy | undefined,
): Promise<ResolvedTls> {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:") return { messages: [] }

  const options: BunFetchRequestInitTLS = {}
  const messages: string[] = []
  const verify = policy?.insecure
    ? false
    : (request.tls?.verify ?? policy?.settings?.verify ?? true)
  options.rejectUnauthorized = verify
  if (policy?.insecure) messages.push("TLS verification disabled by --insecure")
  else if (request.tls?.verify !== undefined) {
    messages.push(
      `TLS verification ${verify ? "enabled" : "disabled"} by request`,
    )
  } else if (policy?.settings?.verify !== undefined) {
    messages.push(
      `TLS verification ${verify ? "enabled" : "disabled"} by collection`,
    )
  }

  if (verify && policy?.settings?.caBundle) {
    const path = resolveTlsPath(policy.settings.caBundle, policy.collectionDir)
    options.ca = await requiredFile(path, "CA bundle")
    messages.push("TLS custom CA bundle enabled")
  }

  const profile = findClientCertificate(
    policy?.settings?.clientCertificates ?? [],
    parsed,
  )
  if (profile && policy) {
    const certPath = resolveTlsPath(profile.certFile, policy.collectionDir)
    const keyPath = resolveTlsPath(profile.keyFile, policy.collectionDir)
    options.cert = await requiredFile(certPath, "client certificate")
    options.key = await requiredFile(keyPath, "client key")
    if (profile.passphrase) {
      options.passphrase = resolvePassphrase(profile.passphrase, env)
    }
    messages.push(`TLS client certificate selected for ${profile.host}`)
  }

  return {
    options: Object.keys(options).length > 0 ? options : undefined,
    messages,
  }
}

export function findClientCertificate(
  profiles: ClientCertificateProfile[],
  url: URL,
): ClientCertificateProfile | undefined {
  const host = url.hostname.toLowerCase()
  const port = url.port ? Number(url.port) : 443
  return profiles.find(
    (profile) =>
      profile.enabled !== false &&
      canonicalTlsHost(profile.host) === host &&
      (profile.port ?? 443) === port,
  )
}

export function isValidTlsHost(value: string): boolean {
  const host = value.trim()
  if (
    !host ||
    /\s/.test(host) ||
    host.includes("/") ||
    host.includes("@") ||
    host.includes("?") ||
    host.includes("#") ||
    host.includes("*") ||
    host.includes("\\") ||
    host === "." ||
    host === "-"
  ) {
    return false
  }
  if (host.startsWith("[")) {
    if (!host.endsWith("]")) return false
  } else if (host.includes(":")) {
    return false
  }
  return canonicalTlsHost(host) !== undefined
}

function canonicalTlsHost(value: string): string | undefined {
  try {
    return (
      new URL(`https://${value.trim()}`).hostname.toLowerCase() || undefined
    )
  } catch {
    return undefined
  }
}

export function resolveTlsPath(value: string, collectionDir: string): string {
  const expanded = expandUserPath(value)
  return isAbsolute(expanded) ? expanded : resolve(collectionDir, expanded)
}

function parseClientCertificate(
  value: unknown,
  path: string,
): ClientCertificateProfile {
  if (!isRecord(value)) throw invalid(path, "must be a mapping")
  const unknownKey = Object.keys(value).find(
    (key) =>
      ![
        "host",
        "port",
        "cert_file",
        "key_file",
        "passphrase",
        "enabled",
      ].includes(key),
  )
  if (unknownKey) throw invalid(path, `unknown key "${unknownKey}"`)
  if (
    typeof value.host !== "string" ||
    typeof value.cert_file !== "string" ||
    typeof value.key_file !== "string"
  ) {
    throw invalid(path, "host, cert_file, and key_file must be strings")
  }
  if (
    value.port !== undefined &&
    (typeof value.port !== "number" ||
      !Number.isInteger(value.port) ||
      value.port < 1 ||
      value.port > 65535)
  ) {
    throw invalid(`${path}.port`, "must be an integer from 1 to 65535")
  }
  if (value.passphrase !== undefined && typeof value.passphrase !== "string") {
    throw invalid(`${path}.passphrase`, "must be a string")
  }
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw invalid(`${path}.enabled`, "must be a boolean")
  }
  if (
    typeof value.passphrase === "string" &&
    value.passphrase.trim() &&
    !isVariableReference(value.passphrase)
  ) {
    throw invalid(
      `${path}.passphrase`,
      "must be an exact $VARNAME reference; move the secret to an environment file",
    )
  }
  if (
    value.enabled !== false &&
    (!isValidTlsHost(value.host) ||
      !value.cert_file.trim() ||
      !value.key_file.trim())
  ) {
    throw invalid(
      path,
      "enabled profiles require a valid host, cert_file, and key_file",
    )
  }
  return {
    host: value.host,
    port: value.port as number | undefined,
    certFile: value.cert_file,
    keyFile: value.key_file,
    passphrase:
      typeof value.passphrase === "string" && value.passphrase.trim()
        ? value.passphrase
        : undefined,
    enabled: value.enabled as boolean | undefined,
  }
}

function isEmptyClientCertificateProfile(
  profile: ClientCertificateProfile,
): boolean {
  return (
    profile.enabled === false &&
    profile.host.trim() === "" &&
    profile.certFile.trim() === "" &&
    profile.keyFile.trim() === "" &&
    profile.port === undefined &&
    !profile.passphrase?.trim()
  )
}

function resolvePassphrase(value: string, env?: Environment): string {
  const name = variableReferenceName(value)
  if (!name || !env || !Object.hasOwn(env.vars, name)) {
    throw new Error(
      `tls: unresolved variable "${name ?? value}" in client certificate passphrase`,
    )
  }
  return env.vars[name]!
}

async function requiredFile(path: string, label: string): Promise<Bun.BunFile> {
  const file = Bun.file(path)
  if (!(await file.exists()))
    throw new Error(`tls: ${label} not found: ${path}`)
  return file
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalid(path: string, message: string): Error {
  return new Error(`${path}: ${message}`)
}
