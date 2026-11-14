import type {
  Auth,
  BodyType,
  Collection,
  Environment,
  FormEntry,
  KvEntry,
  OAuth2GrantType,
  ParamEntry,
  Request,
} from "../../schema"
import type { ImportResult, OpenApiImportWarning } from "../index"
import { isMapping } from "./refs"
import {
  explicitExample,
  jsonBody31,
  literalText,
  type ResolveRef,
  type Warn,
} from "./schemaExample"
import { slugify, METHOD_UPPER, setOwn } from "../shared"
import {
  openApiPathTemplateToColon,
  URL_PATH_TOKEN_RE,
} from "../../requests/pathParams"
import { defaultOAuth2Auth } from "../../auth/defaults"
import { variableReferences } from "../../variableReference"

export { slugify, METHOD_UPPER }

export interface Normalized {
  openapi: string
  info?: { title?: unknown }
  servers?: unknown
  paths: Record<string, unknown>
  security?: unknown
  components?: { securitySchemes?: unknown }
  resolveRef?: ResolveRef
  webhooks?: unknown
}

const FALLBACK_ID = "openapi-import"
const OAUTH2_GRANTS: readonly OAuth2GrantType[] = [
  "authorization_code",
  "client_credentials",
  "implicit",
  "password",
]

const METHOD_KEYS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const

const SUPPORTED_MEDIA = [
  "application/json",
  "application/xml",
  "text/xml",
  "multipart/form-data",
  "application/x-www-form-urlencoded",
] as const

const FILE_FORMATS = new Set(["binary", "base64", "byte"])
const NOODLE_BODY_TYPE_EXTENSION = "x-noodle-body-type"

function baseMediaType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase()
}

function pickMediaType(content: Record<string, unknown>): string | null {
  for (const mt of SUPPORTED_MEDIA) {
    const match = Object.keys(content).find((key) => baseMediaType(key) === mt)
    if (match) return match
  }
  const xml = Object.keys(content).find((mt) =>
    baseMediaType(mt).endsWith("+xml"),
  )
  if (xml) return xml
  const marked = Object.keys(content).find((mt) => {
    const mediaObj = content[mt]
    return isMapping(mediaObj) && mediaObj[NOODLE_BODY_TYPE_EXTENSION] === "xml"
  })
  if (marked) return marked
  return null
}

function collectBody(
  op: Record<string, unknown>,
  resolve?: ResolveRef,
  warn?: Warn,
): {
  body?: string
  bodyType?: Extract<BodyType, "json" | "xml" | "multipart" | "urlencoded">
  formData?: FormEntry[]
  contentType?: string
} {
  const rb = resolve ? resolve(op.requestBody) : op.requestBody
  if (!isMapping(rb)) {
    if (op.requestBody !== undefined)
      warn?.("requestBody", "The request body could not be resolved locally.")
    return {}
  }

  const content = rb.content
  if (!isMapping(content)) return {}

  const mt =
    pickMediaType(content) ??
    (resolve
      ? Object.keys(content).find((key) => baseMediaType(key).endsWith("+json"))
      : undefined)
  if (!mt) {
    warn?.("requestBody", "Unsupported media type. Add the body manually.")
    return {}
  }

  const mediaObj = content[mt]
  if (!isMapping(mediaObj)) return {}

  const schema = resolve ? resolve(mediaObj.schema, true) : mediaObj.schema
  const mediaType = baseMediaType(mt)
  if (
    resolve &&
    warn &&
    (mediaType === "application/json" || mediaType.endsWith("+json"))
  ) {
    return {
      bodyType: "json",
      body: jsonBody31(mediaObj, resolve, warn),
      ...(mt !== "application/json" ? { contentType: mt } : {}),
    }
  }
  if (resolve && schema === undefined && mediaObj.schema !== undefined)
    warn?.("requestBody", "The body schema could not be resolved locally.")
  if (
    mediaObj[NOODLE_BODY_TYPE_EXTENSION] === "xml" ||
    mediaType === "application/xml" ||
    mediaType === "text/xml" ||
    mediaType.endsWith("+xml")
  ) {
    const exampleFromMap = isMapping(mediaObj.examples)
      ? Object.values(mediaObj.examples).find(
          (entry) => isMapping(entry) && typeof entry.value === "string",
        )
      : undefined
    const example = resolve
      ? (explicitExample(mediaObj, resolve, () =>
          warn?.(
            "requestBody",
            "A body example could not be resolved locally.",
          ),
        ) ??
        (isMapping(schema)
          ? Array.isArray(schema.examples)
            ? schema.examples[0]
            : schema.example
          : undefined))
      : typeof mediaObj.example === "string"
        ? mediaObj.example
        : isMapping(exampleFromMap)
          ? exampleFromMap.value
          : isMapping(schema) && typeof schema.example === "string"
            ? schema.example
            : undefined
    return {
      body:
        typeof example === "string"
          ? resolve
            ? literalText(example)
            : example
          : "",
      bodyType: "xml",
      contentType: mt,
    }
  }
  if (!isMapping(schema)) {
    if (mediaType === "application/json") {
      return { body: "{}", bodyType: "json" }
    }
    return {}
  }

  if (mediaType === "application/json") {
    const example = schema.example
    if (example !== undefined) {
      return { body: JSON.stringify(example), bodyType: "json" }
    }
    const props = schema.properties
    if (isMapping(props)) {
      const entries: Record<string, string> = {}
      for (const [key] of Object.entries(props)) {
        entries[key] = `$${key}`
      }
      return { body: JSON.stringify(entries), bodyType: "json" }
    }
    return { body: "{}", bodyType: "json" }
  }

  if (resolve && schema.allOf) {
    warn?.("requestBody", "Composed form schema requires manual configuration.")
    return {}
  }

  if (mediaType === "multipart/form-data") {
    const props = schema.properties
    if (!isMapping(props)) return { bodyType: "multipart", formData: [] }

    const encoding = mediaObj.encoding
    const fileFields = new Set<string>()
    if (isMapping(encoding)) {
      for (const key of Object.keys(encoding)) {
        fileFields.add(key)
      }
    }
    for (const [key, raw] of Object.entries(props)) {
      const prop = resolve ? resolve(raw, true) : raw
      if (resolve && prop === undefined)
        warn?.(
          "requestBody",
          "A form field reference could not be resolved locally.",
        )
      if (
        isMapping(prop) &&
        typeof prop.format === "string" &&
        FILE_FORMATS.has(prop.format as string)
      ) {
        fileFields.add(key)
      }
    }

    const formData: FormEntry[] = []
    for (const [key] of Object.entries(props)) {
      formData.push({
        name: key,
        value: fileFields.has(key) ? "" : `$${key}`,
        enabled: true,
        type: fileFields.has(key) ? "file" : "text",
      })
    }
    return { bodyType: "multipart", formData }
  }

  if (mediaType === "application/x-www-form-urlencoded") {
    const props = schema.properties
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

export function convertTpl(v: string): string {
  return v.replace(/\{\{(\w+)\}\}/g, "$$$1")
}

export function paramDefault(p: Record<string, unknown>): string | undefined {
  if (p.example !== undefined) return convertTpl(String(p.example))
  const schema = p.schema
  if (isMapping(schema) && schema.default !== undefined) {
    return convertTpl(String(schema.default))
  }
  return undefined
}

function collectParams(
  pathItemParams: unknown,
  opParams: unknown,
  resolve?: ResolveRef,
  warn?: Warn,
): { name: string; in: string; default?: string }[] {
  const list: { name: string; in: string; default?: string }[] = []
  const allowedIn = new Set(["path", "query", "header"])
  const consider = (raw: unknown) => {
    const p = resolve ? resolve(raw) : raw
    if (!isMapping(p)) {
      warn?.("parameters", "A parameter could not be resolved locally.")
      return
    }
    const pName = p.name
    const inV = p.in
    if (typeof pName !== "string" || pName === "") return
    if (typeof inV !== "string") return
    if (!allowedIn.has(inV)) {
      warn?.(
        "parameters",
        "The parameter location is unsupported and was omitted.",
      )
      return
    }
    if (resolve) {
      const schema = resolve(p.schema, true)
      if (schema === undefined && p.schema !== undefined)
        warn?.(
          "parameters",
          "A parameter schema could not be resolved locally.",
        )
      let value = explicitExample(p, resolve, () =>
        warn?.(
          "parameters",
          "A parameter example could not be resolved locally.",
        ),
      )
      if (value === undefined && isMapping(schema))
        value =
          Array.isArray(schema.examples) && schema.examples.length
            ? schema.examples[0]
            : Object.hasOwn(schema, "example")
              ? schema.example
              : schema.default
      if (isMapping(value) || Array.isArray(value) || p.content !== undefined) {
        warn?.(
          "parameters",
          "A structured parameter requires manual serialization.",
        )
        value = undefined
      }
      list.push({
        name: pName,
        in: inV,
        default: value === undefined ? undefined : literalText(String(value)),
      })
    } else list.push({ name: pName, in: inV, default: paramDefault(p) })
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
  const schemes = comp.securitySchemes
  if (!isMapping(schemes)) return null
  if (!Object.hasOwn(schemes, name)) return null
  const s = n.resolveRef ? n.resolveRef(schemes[name]) : schemes[name]
  return isMapping(s) ? s : null
}

function schemeToAuth(
  scheme: Record<string, unknown>,
  requiredScopes?: unknown,
): Auth | null {
  const type = scheme.type
  const schemeName =
    typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : undefined
  if (type === "http" && schemeName === "bearer") {
    return { type: "bearer", token: "$token" }
  }
  if (type === "http" && schemeName === "basic") {
    return { type: "basic", user: "$user", pass: "$pass" }
  }
  if (type === "http" && schemeName === "ntlm") {
    return {
      type: "ntlm",
      username: "$NTLM_USERNAME",
      password: "$NTLM_PASSWORD",
      domain: "$NTLM_DOMAIN",
      workstation: "$NTLM_WORKSTATION",
    }
  }
  if (type === "oauth2" && isMapping(scheme.flows)) {
    const candidates = [
      ["authorizationCode", "authorization_code"],
      ["clientCredentials", "client_credentials"],
      ["implicit", "implicit"],
      ["password", "password"],
    ] as const
    for (const [flowName, grantType] of candidates) {
      const flow = scheme.flows[flowName]
      if (!isMapping(flow)) continue
      const scopes = Array.isArray(requiredScopes)
        ? requiredScopes.filter(
            (scope): scope is string => typeof scope === "string",
          )
        : isMapping(flow.scopes)
          ? Object.keys(flow.scopes)
          : []
      return {
        ...defaultOAuth2Auth(),
        grant_type: grantType,
        authorization_url:
          typeof flow.authorizationUrl === "string"
            ? convertTpl(flow.authorizationUrl)
            : "",
        access_token_url:
          typeof flow.tokenUrl === "string" ? convertTpl(flow.tokenUrl) : "",
        refresh_token_url:
          typeof flow.refreshUrl === "string"
            ? convertTpl(flow.refreshUrl)
            : "",
        client_id: "$OAUTH_CLIENT_ID",
        client_secret: "$OAUTH_CLIENT_SECRET",
        username: grantType === "password" ? "$OAUTH_USERNAME" : "",
        password: grantType === "password" ? "$OAUTH_PASSWORD" : "",
        scope: scopes.join(" "),
      }
    }
  }
  if (
    type === "openIdConnect" &&
    typeof scheme.openIdConnectUrl === "string" &&
    scheme.openIdConnectUrl
  ) {
    const extension = scheme["x-noodle-oauth2-grant-type"]
    const grantType = OAUTH2_GRANTS.includes(extension as OAuth2GrantType)
      ? (extension as OAuth2GrantType)
      : "authorization_code"
    const discoveryUrlKind =
      scheme["x-noodle-oauth2-discovery-url-kind"] === "issuer"
        ? "issuer"
        : "document"
    const scopes = Array.isArray(requiredScopes)
      ? requiredScopes.filter(
          (scope): scope is string => typeof scope === "string",
        )
      : []
    return {
      ...defaultOAuth2Auth(),
      grant_type: grantType,
      discovery_url: convertTpl(scheme.openIdConnectUrl),
      discovery_url_kind: discoveryUrlKind,
      client_id: "$OAUTH_CLIENT_ID",
      client_secret: "$OAUTH_CLIENT_SECRET",
      username: grantType === "password" ? "$OAUTH_USERNAME" : "",
      password: grantType === "password" ? "$OAUTH_PASSWORD" : "",
      scope: scopes.join(" "),
    }
  }
  if (type === "apiKey" && scheme.in !== "cookie") {
    const name = typeof scheme.name === "string" ? scheme.name : "X-API-Key"
    const inV = scheme.in
    const placement = inV === "query" ? "query" : "header"
    return { type: "api_key", key: name, value: "$api_key", placement }
  }
  return null
}

function resolveAuth(
  op: Record<string, unknown>,
  n: Normalized,
  warn?: Warn,
): Auth {
  const opSec = op.security
  const security = Array.isArray(opSec)
    ? opSec
    : Array.isArray(n.security)
      ? n.security
      : []
  const problems = new Set<string>()
  for (const req of security) {
    if (!isMapping(req)) continue
    const entries = Object.entries(req)
    if (warn && !entries.length) return { type: "none" }
    if (warn && entries.length > 1) {
      problems.add(
        "Multiple simultaneous security schemes require manual configuration.",
      )
      continue
    }
    for (const [schemeName, requiredScopes] of entries) {
      const scheme = lookupScheme(n, schemeName)
      if (!scheme) {
        problems.add("The security scheme could not be resolved locally.")
        continue
      }
      if (
        warn &&
        scheme.type === "apiKey" &&
        scheme.in !== "header" &&
        scheme.in !== "query"
      ) {
        problems.add(
          "API key location is unsupported. Configure cookie authentication manually.",
        )
        continue
      }
      const auth = schemeToAuth(scheme, requiredScopes)
      if (auth !== null) return auth
      problems.add(
        scheme.type === "mutualTLS"
          ? "Configure a client certificate for mutual TLS."
          : "Configure this security scheme manually.",
      )
    }
  }
  for (const message of problems) warn?.("security", message)
  return { type: "none" }
}

function collectionName(n: Normalized): string {
  const t = n.info?.title
  return typeof t === "string" && t !== "" ? t : FALLBACK_ID
}

export function urlTemplateToVar(s: string): string {
  return s.replace(/\{(\w+)\}/g, "$$$1")
}

export function pathTemplateToColon(s: string): string {
  return openApiPathTemplateToColon(s)
}

function splitPathQuery(pathTemplate: string): {
  path: string
  params: ParamEntry[]
} {
  const queryIndex = pathTemplate.indexOf("?")
  if (queryIndex === -1) return { path: pathTemplate, params: [] }

  const params: ParamEntry[] = []
  for (const [name, value] of new URLSearchParams(
    pathTemplate.slice(queryIndex + 1),
  )) {
    if (name === "") continue
    const idx = params.findIndex((entry) => entry.name === name)
    if (idx >= 0) params.splice(idx, 1)
    params.push({ name, value, enabled: true })
  }

  return { path: pathTemplate.slice(0, queryIndex), params }
}

export function baseUrl(n: Normalized): string {
  const servers = n.servers
  if (!Array.isArray(servers) || servers.length === 0)
    return n.resolveRef ? "$base_url" : "/"
  const first = servers[0] as { url?: unknown } | null | undefined
  if (typeof first?.url !== "string" || first.url === "") return "/"
  const raw = first.url
  if (/\{/.test(raw)) return urlTemplateToVar(raw)
  return "$base_url"
}

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${b}${p}`
}

function makeName(
  op: Record<string, unknown>,
  methodKey: string,
  pathTemplate: string,
): string {
  const summary = op.summary
  if (typeof summary === "string" && summary !== "") return summary
  const operationId = op.operationId
  if (typeof operationId === "string" && operationId !== "") return operationId
  return `${METHOD_UPPER[methodKey] ?? methodKey.toUpperCase()} ${pathTemplate}`
}

export function makeIdRaw(methodKey: string, pathTemplate: string): string {
  const segs = pathTemplate
    .split("/")
    .filter((s) => s !== "")
    .map((s) => s.replace(/\{|\}/g, ""))
  const joined = [methodKey, ...segs].join("-")
  return slugify(joined)
}

export function mapCollection(n: Normalized): ImportResult {
  const name = collectionName(n)
  const id = slugify(name) || FALLBACK_ID
  const base = baseUrl(n)
  const resolve = n.resolveRef
  const warnings: OpenApiImportWarning[] = []
  function warningsFor(item: string): Warn | undefined {
    if (!resolve) return undefined
    const seen = new Set<string>()
    return (field, message) => {
      const key = field + ":" + message
      if (seen.has(key)) return
      seen.add(key)
      warnings.push({
        code: "openapi-field-not-converted",
        format: "openapi",
        itemPath: [item],
        field,
        message,
      })
    }
  }
  if (isMapping(n.webhooks) && Object.keys(n.webhooks).length)
    warningsFor("document")?.(
      "webhooks",
      "Webhooks describe incoming calls and were omitted.",
    )

  const requests: Request[] = []
  const seenIds = new Map<string, number>()
  const tagsByRequest = new Map<Request, string[]>()

  for (const [pathTemplate, rawItem] of Object.entries(n.paths)) {
    const pathLabel = pathTemplate.split("?", 1)[0]!
    if (resolve && !pathTemplate.startsWith("/")) {
      if (!pathTemplate.startsWith("x-"))
        warningsFor(pathLabel)?.(
          "path",
          "Path key must start with '/' and was omitted.",
        )
      continue
    }
    const pathItem = resolve ? resolve(rawItem) : rawItem
    if (resolve && !isMapping(pathItem))
      warningsFor(pathLabel)?.(
        "path",
        "Path item could not be resolved locally.",
      )
    if (
      typeof pathItem !== "object" ||
      pathItem === null ||
      Array.isArray(pathItem)
    )
      continue
    const pi = pathItem as Record<string, unknown>
    if (Object.hasOwn(pi, "trace"))
      warningsFor(`TRACE ${pathLabel}`)?.(
        "method",
        "TRACE is unsupported and was omitted.",
      )
    for (const methodKey of METHOD_KEYS) {
      if (!(methodKey in pi)) continue
      const opVal = pi[methodKey]
      if (typeof opVal !== "object" || opVal === null || Array.isArray(opVal))
        continue
      const op = opVal as Record<string, unknown>

      const method = METHOD_UPPER[methodKey]
      const warn = warningsFor(`${method} ${pathLabel}`)
      if (op.servers !== undefined || pi.servers !== undefined)
        warn?.(
          "servers",
          "Server override was omitted. Review this request's base URL.",
        )
      if (isMapping(op.callbacks) && Object.keys(op.callbacks).length)
        warn?.(
          "callbacks",
          "Callbacks describe incoming calls and were omitted.",
        )
      const { path, params: inlineParams } = splitPathQuery(pathTemplate)
      const url = joinUrl(base, pathTemplateToColon(path))
      const reqName = makeName(op, methodKey, pathTemplate)

      const rawId = makeIdRaw(methodKey, pathTemplate)
      const count = seenIds.get(rawId) ?? 0
      seenIds.set(rawId, count + 1)
      const reqId = count === 0 ? rawId : `${rawId}-${count + 1}`

      const collected = collectParams(
        pi.parameters,
        op.parameters,
        resolve,
        warn,
      )
      const headers: Record<string, KvEntry> = Object.create(null)
      const params = [...inlineParams]
      URL_PATH_TOKEN_RE.lastIndex = 0
      const pathTokenNames = Array.from(
        new Set(
          Array.from(url.matchAll(URL_PATH_TOKEN_RE), (match) => match[1]!),
        ),
      )
      const pathParams: ParamEntry[] = pathTokenNames.map((name) => ({
        name,
        value: "",
        enabled: true,
      }))
      const pathTokenSet = new Set(pathTokenNames)

      for (const p of collected) {
        const val = p.default ?? ""
        if (p.in === "query") {
          const idx = params.findIndex((e) => e.name === p.name)
          if (idx >= 0) params.splice(idx, 1)
          params.push({ name: p.name, value: val, enabled: true })
        } else if (p.in === "header") {
          headers[p.name] = { value: val, enabled: true }
        } else if (p.in === "path" && pathTokenSet.has(p.name)) {
          const idx = pathParams.findIndex((e) => e.name === p.name)
          if (idx >= 0) {
            pathParams[idx] = { name: p.name, value: val, enabled: true }
          }
        }
      }

      const rawTags = op.tags
      const tags: string[] = []
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          if (typeof t === "string" && t !== "") tags.push(t)
        }
      }

      const { contentType, ...body } = collectBody(op, resolve, warn)
      if (
        contentType &&
        !Object.keys(headers).some(
          (name) => name.toLowerCase() === "content-type",
        )
      ) {
        headers["Content-Type"] = { value: contentType, enabled: true }
      }

      const req: Request = {
        id: reqId,
        name: reqName,
        method,
        url,
        timeout: 0,
        headers,
        params,
        pathParams: pathParams.length > 0 ? pathParams : undefined,
        ...body,
        auth: resolveAuth(op, n, warn),
      }
      requests.push(req)
      tagsByRequest.set(req, tags)
    }
  }

  const rootItems: Collection["items"] = []
  const tagFolders = new Map<string, Request[]>()

  for (const req of requests) {
    const tagList = tagsByRequest.get(req) ?? []
    if (tagList.length > 0) {
      const firstTag = tagList[0]
      const existing = tagFolders.get(firstTag)
      if (existing) {
        existing.push(req)
      } else {
        tagFolders.set(firstTag, [req])
      }
    } else {
      rootItems.push({ type: "request", data: req })
    }
  }

  for (const [tag, reqs] of tagFolders) {
    const folderId = slugify(tag) || `tag-untitled`
    rootItems.push({
      type: "folder",
      data: {
        id: folderId,
        name: tag,
        path: folderId,
        children: reqs.map((r) => {
          r.id = `${folderId}/${r.id}`
          return {
            type: "request" as const,
            data: r,
          }
        }),
      },
    })
  }

  const envVarsFound = new Set<string>()
  const collectVars = (...values: (string | undefined)[]) => {
    for (const value of values) {
      if (!value) continue
      for (const reference of variableReferences(value)) {
        envVarsFound.add(reference.name)
      }
    }
  }
  for (const r of requests) {
    collectVars(r.url)
    for (const [, kv] of Object.entries(r.headers)) {
      collectVars(kv.value)
    }
    for (const entry of r.params) {
      collectVars(entry.value)
    }
    if (r.pathParams) {
      for (const entry of r.pathParams) {
        collectVars(entry.value)
      }
    }
    collectVars(r.body)
    if (r.formData) {
      for (const fe of r.formData) {
        collectVars(fe.value)
      }
    }
    const a = r.auth
    if (!a) continue
    if (a.type === "bearer") {
      collectVars(a.token)
    }
    if (a.type === "basic") {
      collectVars(a.user, a.pass)
    }
    if (a.type === "ntlm") {
      collectVars(a.username, a.password, a.domain, a.workstation)
    }
    if (a.type === "api_key") {
      collectVars(a.value)
    }
    if (a.type === "oauth1") {
      collectVars(
        a.consumer_key,
        a.consumer_secret,
        a.access_token,
        a.access_token_secret,
        a.private_key,
      )
    }
    if (a.type === "oauth2") {
      collectVars(
        a.discovery_url,
        a.client_id,
        a.client_secret,
        a.username,
        a.password,
        a.client_assertion_key,
      )
    }
  }

  const environments: Environment[] = []
  const servers = n.servers
  if (resolve && (!Array.isArray(servers) || !servers.length)) {
    environments.push({
      name: "default",
      vars: Object.fromEntries([...envVarsFound].map((key) => [key, ""])),
    })
  }
  if (Array.isArray(servers) && servers.length > 0) {
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i] as Record<string, unknown> | null | undefined
      if (!isMapping(server)) continue
      const srvDesc =
        typeof server.description === "string" ? server.description : null
      const envName =
        srvDesc || (servers.length === 1 ? "default" : `server-${i + 1}`)

      const vars: Record<string, string> = {}
      const srvUrl = typeof server.url === "string" ? server.url : ""

      const urlVarMatches = srvUrl.matchAll(/\{(\w+)\}/g)
      for (const match of urlVarMatches) {
        setOwn(vars, match[1]!, "")
      }

      const srvVariables = server.variables
      if (isMapping(srvVariables)) {
        for (const [varName, varDef] of Object.entries(srvVariables)) {
          if (isMapping(varDef) && varDef.default !== undefined) {
            setOwn(vars, varName, String(varDef.default))
          }
        }
      }

      if (srvUrl) {
        if (Object.keys(vars).length === 0) {
          setOwn(vars, "base_url", srvUrl)
        }
        for (const varName of envVarsFound) {
          if (!Object.hasOwn(vars, varName)) {
            setOwn(vars, varName, "")
          }
        }
        environments.push({ name: envName, vars })
      }
    }
  }

  return {
    collection: { id, name, items: rootItems },
    environments,
    ...(warnings.length ? { warnings } : {}),
  }
}
