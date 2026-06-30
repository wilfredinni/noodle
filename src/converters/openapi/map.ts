import type { Auth, BodyType, Collection, FormEntry, KvEntry, Method, Request } from "../../schema"

export interface Normalized {
  openapi: string
  info?: { title?: unknown }
  servers?: unknown
  paths: Record<string, unknown>
  security?: unknown
  components?: { securitySchemes?: unknown }
}

const FALLBACK_ID = "openapi-import"

const METHOD_KEYS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const

const METHOD_UPPER: Record<string, Method> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
}

function isMapping(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

const SUPPORTED_MEDIA: readonly string[] = [
  "application/json",
  "multipart/form-data",
  "application/x-www-form-urlencoded",
]

const FILE_FORMATS = new Set(["binary", "base64"])

function pickMediaType(
  content: Record<string, unknown>,
): string | null {
  for (const mt of SUPPORTED_MEDIA) {
    if (mt in content) return mt
  }
  return null
}

function collectBody(op: Record<string, unknown>): {
  body?: string
  bodyType?: Extract<BodyType, "json" | "multipart" | "urlencoded">
  formData?: FormEntry[]
} {
  const rb = op.requestBody
  if (!isMapping(rb)) return {}

  const content = rb.content
  if (!isMapping(content)) return {}

  const mt = pickMediaType(content as Record<string, unknown>)
  if (mt === null) return {}

  const mediaObj = (content as Record<string, unknown>)[mt]
  if (!isMapping(mediaObj)) return {}

  const schema = mediaObj.schema
  if (!isMapping(schema)) {
    if (mt === "application/json") return { body: "{}", bodyType: "json" }
    return {}
  }

  if (mt === "application/json") {
    const example = (schema as Record<string, unknown>).example
    if (example !== undefined) {
      return { body: JSON.stringify(example), bodyType: "json" }
    }
    const props = (schema as Record<string, unknown>).properties
    if (isMapping(props)) {
      const entries: Record<string, string> = {}
      for (const [key] of Object.entries(props)) {
        entries[key] = `$${key}`
      }
      return { body: JSON.stringify(entries), bodyType: "json" }
    }
    return { body: "{}", bodyType: "json" }
  }

  if (mt === "multipart/form-data") {
    const props = (schema as Record<string, unknown>).properties
    if (!isMapping(props)) return { bodyType: "multipart", formData: [] }

    const encoding = (mediaObj as Record<string, unknown>).encoding
    const fileFields = new Set<string>()
    if (isMapping(encoding)) {
      for (const key of Object.keys(encoding as Record<string, unknown>)) {
        fileFields.add(key)
      }
    }
    for (const [key, prop] of Object.entries(props)) {
      if (isMapping(prop) && typeof (prop as Record<string, unknown>).format === "string" &&
          FILE_FORMATS.has((prop as Record<string, unknown>).format as string)) {
        fileFields.add(key)
      }
    }

    const formData: FormEntry[] = []
    for (const [key] of Object.entries(props)) {
      formData.push({
        name: key,
        value: "",
        enabled: true,
        type: fileFields.has(key) ? "file" : "text",
      })
    }
    return { bodyType: "multipart", formData }
  }

  if (mt === "application/x-www-form-urlencoded") {
    const props = (schema as Record<string, unknown>).properties
    if (!isMapping(props)) return { bodyType: "urlencoded", formData: [] }

    const formData: FormEntry[] = []
    for (const [key] of Object.entries(props)) {
      formData.push({
        name: key,
        value: `$${key}`,
        enabled: true,
        type: "text",
      })
    }
    return { bodyType: "urlencoded", formData }
  }

  return {}
}

function collectParams(
  pathItemParams: unknown,
  opParams: unknown,
): { name: string; in: string }[] {
  const list: { name: string; in: string }[] = []
  const allowedIn = new Set(["path", "query", "header", "cookie"])
  const consider = (p: unknown) => {
    if (!isMapping(p)) return
    const pName = p.name
    const inV = p.in
    if (typeof pName !== "string" || pName === "") return
    if (typeof inV !== "string") return
    if (!allowedIn.has(inV)) return
    list.push({ name: pName, in: inV })
  }
  if (Array.isArray(pathItemParams)) {
    for (const p of pathItemParams) consider(p)
  }
  if (Array.isArray(opParams)) {
    for (const p of opParams) consider(p)
  }
  return list
}

function lookupScheme(
  n: Normalized,
  name: string,
): Record<string, unknown> | null {
  const comp = n.components
  if (!isMapping(comp)) return null
  const schemes = (comp as Record<string, unknown>).securitySchemes
  if (!isMapping(schemes)) return null
  const s = (schemes as Record<string, unknown>)[name]
  return isMapping(s) ? s : null
}

function schemeToAuth(scheme: Record<string, unknown>): Auth | null {
  const type = scheme.type
  const schemeName = scheme.scheme
  if (type === "http" && schemeName === "bearer") {
    return { type: "bearer", token: "$TOKEN" }
  }
  if (type === "http" && schemeName === "basic") {
    return { type: "basic", user: "$USER", pass: "$PASS" }
  }
  if (type === "apiKey") {
    const name = typeof scheme.name === "string" ? scheme.name : "X-API-Key"
    const inV = scheme.in
    const placement = inV === "query" ? "query" : "header"
    return { type: "api_key", key: name, value: "$API_KEY", placement }
  }
  return null
}

function resolveAuth(op: Record<string, unknown>, n: Normalized): Auth {
  const opSec = op.security
  const security = Array.isArray(opSec)
    ? opSec
    : Array.isArray(n.security)
      ? n.security
      : []
  for (const req of security) {
    if (!isMapping(req)) continue
    const entries = Object.entries(req)
    for (const [schemeName] of entries) {
      if (typeof schemeName !== "string") continue
      const scheme = lookupScheme(n, schemeName)
      if (!scheme) continue
      const auth = schemeToAuth(scheme)
      if (auth !== null) return auth
    }
  }
  return { type: "none" }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

function collectionName(n: Normalized): string {
  const t = n.info?.title
  return typeof t === "string" && t !== "" ? t : FALLBACK_ID
}

function urlTemplateToVar(s: string): string {
  return s.replace(/\{(\w+)\}/g, "$$$1")
}

function baseUrl(n: Normalized): string {
  const servers = n.servers
  if (!Array.isArray(servers) || servers.length === 0) return "/"
  const first = servers[0] as { url?: unknown } | null | undefined
  if (typeof first?.url !== "string" || first.url === "") return "/"
  return urlTemplateToVar(first.url)
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${b}${p}`
}

function makeName(
  op: Record<string, unknown>,
  methodKey: string,
  pathTemplate: string,
): string {
  const operationId = op.operationId
  if (typeof operationId === "string" && operationId !== "") return operationId
  const summary = op.summary
  if (typeof summary === "string" && summary !== "") return summary
  return `${METHOD_UPPER[methodKey]} ${pathTemplate}`
}

function makeIdRaw(methodKey: string, pathTemplate: string): string {
  const segs = pathTemplate
    .split("/")
    .filter((s) => s !== "")
    .map((s) => s.replace(/\{|\}/g, ""))
  const joined = [methodKey, ...segs].join("-")
  return slugify(joined)
}

export function mapCollection(n: Normalized): Collection {
  const name = collectionName(n)
  const id = slugify(name) || FALLBACK_ID
  const base = baseUrl(n)

  const requests: Request[] = []
  const seenIds = new Map<string, number>()

  for (const [pathTemplate, pathItem] of Object.entries(n.paths)) {
    if (
      typeof pathItem !== "object" ||
      pathItem === null ||
      Array.isArray(pathItem)
    )
      continue
    const pi = pathItem as Record<string, unknown>
    for (const methodKey of METHOD_KEYS) {
      if (!(methodKey in pi)) continue
      const opVal = pi[methodKey]
      if (typeof opVal !== "object" || opVal === null || Array.isArray(opVal))
        continue
      const op = opVal as Record<string, unknown>

      const method = METHOD_UPPER[methodKey]
      const url = joinUrl(base, urlTemplateToVar(pathTemplate))
      const reqName = makeName(op, methodKey, pathTemplate)

      const rawId = makeIdRaw(methodKey, pathTemplate)
      const count = seenIds.get(rawId) ?? 0
      seenIds.set(rawId, count + 1)
      const reqId = count === 0 ? rawId : `${rawId}-${count + 1}`

      const collected = collectParams(pi.parameters, op.parameters)
      const headers: Record<string, KvEntry> = {}
      const params: Record<string, KvEntry> = {}
      for (const p of collected) {
        if (p.in === "query")
          params[p.name] = { value: `$${p.name}`, enabled: true }
        else if (p.in === "header")
          headers[p.name] = { value: `$${p.name}`, enabled: true }
      }

      requests.push({
        id: reqId,
        name: reqName,
        method,
        url,
        timeout: 0,
        headers,
        params,
        ...collectBody(op),
        auth: resolveAuth(op, n),
      })
    }
  }

  return { id, name, requests }
}
