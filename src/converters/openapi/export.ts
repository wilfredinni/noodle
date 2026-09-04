import type {
  Auth,
  Collection,
  CollectionItem,
  FormEntry,
  ParamEntry,
  Request,
} from "../../schema"
import { normalizeOAuth2DiscoveryUrl } from "../../auth/oauth2"
import { parseJsonPreservingNumbers } from "../../lang/formatJson"
import { mergeFolderOverrides } from "../../requests/mergeFolderOverrides"
import { withDefaultHttpsScheme } from "../../requests/url"
import {
  isVariableReference,
  replaceVariableReferences,
  variableReferences,
} from "../../variableReference"

type OpenApiObject = Record<string, unknown>

interface CollectedRequest {
  request: Request
  tag?: string
}

interface RequestLocation {
  path: string
  query: ParamEntry[]
  server?: OpenApiObject
}

export interface OpenApiExportResult {
  document: OpenApiObject
  operationCount: number
}

export interface OpenApiExportOptions {
  servers?: OpenApiObject[]
}

const PATH_PARAM_RE = /:([\w-]+)(?=\/|\.|$)/g
const NOODLE_BODY_TYPE_EXTENSION = "x-noodle-body-type"
const NOODLE_OAUTH2_GRANT_EXTENSION = "x-noodle-oauth2-grant-type"

interface ParseableUrl {
  value: string
  restore(value: string, preserveEscapes?: boolean): string
}

function collectRequests(
  items: CollectionItem[],
  tag?: string,
): CollectedRequest[] {
  return items.flatMap((item) =>
    item.type === "request"
      ? [{ request: item.data, tag }]
      : collectRequests(item.data.children, item.data.name),
  )
}

function serverFor(url: string): OpenApiObject {
  const names = new Set<string>()
  const template = replaceVariableReferences(url, (name) => {
    names.add(name)
    return `{${name}}`
  })
  if (names.size === 0) return { url: template }
  return {
    url: template,
    variables: Object.fromEntries(
      [...names].map((name) => [name, { default: "" }]),
    ),
  }
}

function queryEntries(search: string): ParamEntry[] {
  return [...new URLSearchParams(search)]
    .filter(([name]) => name !== "")
    .map(([name, value]) => ({ name, value, enabled: true }))
}

function makeParseableUrl(url: string, relative = false): ParseableUrl {
  let value = url
  let schemeVariable: string | undefined
  if (!relative) {
    const scheme = variableReferences(value)[0]
    if (scheme?.start === 0 && value.slice(scheme.end).startsWith("://")) {
      schemeVariable = `$${scheme.name}`
      value = `https${value.slice(scheme.end)}`
    }
    if (!schemeVariable) value = withDefaultHttpsScheme(value)
  }

  const replacements = new Map<string, string>()
  let markerIndex = 0
  const textMarker = (variable: string): string => {
    let marker: string
    do {
      marker = `noodleexportvar${markerIndex++}`
    } while (url.includes(marker))
    replacements.set(marker, variable)
    return marker
  }
  const portMarker = (variable: string): string => {
    let marker: string
    do {
      marker = String(10000 + markerIndex++)
    } while (url.includes(marker))
    replacements.set(marker, variable)
    return marker
  }

  value = replaceVariableReferences(
    value,
    (name, reference) =>
      value[reference.start - 1] === ":" &&
      (reference.end === value.length || "/?#".includes(value[reference.end]!))
        ? portMarker(`$${name}`)
        : textMarker(`$${name}`),
    () => textMarker("$$"),
  )

  return {
    value,
    restore(parsed: string, preserveEscapes = false): string {
      let restored = parsed
      for (const [marker, variable] of replacements) {
        restored = restored.replaceAll(marker, () => variable)
      }
      restored = schemeVariable
        ? restored.replace(/^https:/, `${schemeVariable}:`)
        : restored
      return preserveEscapes
        ? restored
        : replaceVariableReferences(restored, (name) => `$${name}`)
    },
  }
}

function requestLocation(request: Request): RequestLocation {
  const base = variableReferences(request.url)[0]
  const baseSuffix =
    base?.start === 0
      ? request.url.slice(base.end).match(/^(\/[^?#]*)?(\?[^#]*)?(?:#.*)?$/)
      : null
  if (base && baseSuffix) {
    const path = replaceVariableReferences(
      baseSuffix[1] || "/",
      (name) => `$${name}`,
    )
    const query = replaceVariableReferences(
      baseSuffix[2] || "",
      (name) => `$${name}`,
    )
    return {
      path,
      query: queryEntries(query),
      server: serverFor(request.url.slice(0, base.end)),
    }
  }

  if (request.url.startsWith("/")) {
    const template = makeParseableUrl(request.url, true)
    const parsed = new URL(template.value, "https://noodle.invalid")
    return {
      path: template.restore(parsed.pathname) || "/",
      query: queryEntries(template.restore(parsed.search)),
    }
  }

  let parsed: URL
  let template: ParseableUrl
  try {
    template = makeParseableUrl(request.url)
    parsed = new URL(template.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `converters.openapi.export: invalid URL for request "${request.id}": ${message}`,
      { cause: error },
    )
  }
  return {
    path: template.restore(parsed.pathname) || "/",
    query: queryEntries(template.restore(parsed.search)),
    server: serverFor(template.restore(parsed.origin, true)),
  }
}

function parameter(
  name: string,
  location: "path" | "query" | "header",
  value: string | string[],
): OpenApiObject {
  const repeated = Array.isArray(value)
  const result: OpenApiObject = {
    name,
    in: location,
    required: location === "path",
    schema: repeated
      ? { type: "array", items: { type: "string" } }
      : { type: "string" },
  }
  if (repeated) {
    result.style = "form"
    result.explode = true
    result.example = value
  } else if (value !== "") {
    result.example = value
  }
  return result
}

function parametersFor(
  request: Request,
  location: RequestLocation,
): OpenApiObject[] {
  const requestParams = request.params.filter((entry) => entry.enabled)
  const requestParamNames = new Set(requestParams.map((entry) => entry.name))
  const query = [
    ...location.query.filter((entry) => !requestParamNames.has(entry.name)),
    ...requestParams,
  ]
  const queryValues = new Map<string, string[]>()
  for (const entry of query) {
    const values = queryValues.get(entry.name)
    if (values) {
      values.push(entry.value)
    } else {
      queryValues.set(entry.name, [entry.value])
    }
  }

  const pathValues = new Map(
    (request.pathParams ?? []).map((entry) => [entry.name, entry.value]),
  )
  PATH_PARAM_RE.lastIndex = 0
  const pathNames = Array.from(
    new Set(
      Array.from(location.path.matchAll(PATH_PARAM_RE), (match) => match[1]!),
    ),
  )

  const result = pathNames.map((name) =>
    parameter(name, "path", pathValues.get(name) ?? ""),
  )
  result.push(
    ...[...queryValues].map(([name, values]) =>
      parameter(name, "query", values.length === 1 ? values[0]! : values),
    ),
  )
  for (const [name, entry] of Object.entries(request.headers)) {
    if (
      entry.enabled &&
      !["content-type", "accept", "authorization"].includes(name.toLowerCase())
    ) {
      result.push(parameter(name, "header", entry.value))
    }
  }
  return result
}

function formSchema(entries: FormEntry[], multipart: boolean): OpenApiObject {
  const properties: Record<string, OpenApiObject> = {}
  for (const entry of entries) {
    if (!entry.enabled) continue
    if (multipart && entry.type === "file") {
      properties[entry.name] = { type: "string", format: "binary" }
    } else {
      const property: OpenApiObject = { type: "string" }
      if (entry.value !== "") property.example = entry.value
      properties[entry.name] = property
    }
  }
  return { type: "object", properties }
}

function requestBodyFor(request: Request): OpenApiObject | undefined {
  const type =
    request.bodyType ?? (request.body === undefined ? "none" : "json")
  if (type === "none") return undefined

  if (type === "json") {
    if (request.body === undefined) return undefined
    let example: unknown
    try {
      example = parseJsonPreservingNumbers(request.body)
    } catch (error) {
      throw new Error(
        `converters.openapi.export: invalid JSON body for request "${request.id}"`,
        { cause: error },
      )
    }
    return { content: { "application/json": { example } } }
  }

  if (type === "xml") {
    const explicit = Object.entries(request.headers).find(
      ([name, entry]) => entry.enabled && name.toLowerCase() === "content-type",
    )?.[1].value
    const mimeType = explicit?.split(";", 1)[0]!.trim() || "application/xml"
    const media: OpenApiObject = { example: request.body ?? "" }
    const normalizedMimeType = mimeType.toLowerCase()
    if (
      normalizedMimeType !== "application/xml" &&
      normalizedMimeType !== "text/xml" &&
      !normalizedMimeType.endsWith("+xml")
    ) {
      media[NOODLE_BODY_TYPE_EXTENSION] = "xml"
    }
    return { content: { [mimeType]: media } }
  }

  if (type === "urlencoded") {
    return {
      content: {
        "application/x-www-form-urlencoded": {
          schema: formSchema(request.formData ?? [], false),
        },
      },
    }
  }

  if (type === "multipart") {
    return {
      content: {
        "multipart/form-data": {
          schema: formSchema(request.formData ?? [], true),
        },
      },
    }
  }

  return {
    content: {
      "application/octet-stream": {
        schema: { type: "string", format: "binary" },
      },
    },
  }
}

function isOpenApiObject(value: unknown): value is OpenApiObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sameOAuthFlowConfiguration(
  existing: unknown,
  candidate: OpenApiObject,
): boolean {
  if (!isOpenApiObject(existing)) return false
  const existingConfig = { ...existing }
  const candidateConfig = { ...candidate }
  delete existingConfig.scopes
  delete candidateConfig.scopes
  return JSON.stringify(existingConfig) === JSON.stringify(candidateConfig)
}

function addOAuth2Flow(
  schemes: Record<string, OpenApiObject>,
  flowName: string,
  flow: OpenApiObject,
): string {
  const baseName = "oauth2Auth"
  let name = baseName
  let index = 2

  while (true) {
    const existing = schemes[name]
    if (!existing) {
      schemes[name] = { type: "oauth2", flows: { [flowName]: flow } }
      return name
    }

    const flows =
      existing.type === "oauth2" && isOpenApiObject(existing.flows)
        ? existing.flows
        : null
    if (flows) {
      const existingFlow = flows[flowName]
      if (existingFlow === undefined) {
        flows[flowName] = flow
        return name
      }
      if (sameOAuthFlowConfiguration(existingFlow, flow)) {
        const existingScopes =
          isOpenApiObject(existingFlow) && isOpenApiObject(existingFlow.scopes)
            ? existingFlow.scopes
            : {}
        flows[flowName] = {
          ...flow,
          scopes: { ...existingScopes, ...(flow.scopes as OpenApiObject) },
        }
        return name
      }
    }

    name = `${baseName}${index++}`
  }
}

function explicitOAuth2EndpointsAreSufficient(
  auth: Extract<Auth, { type: "oauth2" }>,
): boolean {
  if (auth.grant_type === "authorization_code") {
    return Boolean(auth.authorization_url && auth.access_token_url)
  }
  if (auth.grant_type === "implicit") return Boolean(auth.authorization_url)
  return Boolean(auth.access_token_url)
}

function openIdConnectUrl(value: string): string {
  if (isVariableReference(value)) return value
  try {
    const template = makeParseableUrl(value)
    return template.restore(
      normalizeOAuth2DiscoveryUrl(new URL(template.value)).toString(),
      true,
    )
  } catch (error) {
    throw new Error(
      `converters.openapi.export: invalid OAuth 2 discovery URL: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

function addOpenIdConnectScheme(
  schemes: Record<string, OpenApiObject>,
  url: string,
  grantType: string,
): string {
  const candidate = {
    type: "openIdConnect",
    openIdConnectUrl: url,
    [NOODLE_OAUTH2_GRANT_EXTENSION]: grantType,
  }
  const baseName = "openIdConnectAuth"
  let name = baseName
  let index = 2
  while (
    schemes[name] &&
    JSON.stringify(schemes[name]) !== JSON.stringify(candidate)
  ) {
    name = `${baseName}${index++}`
  }
  schemes[name] ??= candidate
  return name
}

function securityFor(
  auth: Auth | undefined,
  schemes: Record<string, OpenApiObject>,
): OpenApiObject | undefined {
  if (!auth || auth.type === "none" || auth.type === "inherit") return undefined

  let name: string
  if (auth.type === "bearer") {
    name = "bearerAuth"
    schemes[name] ??= { type: "http", scheme: "bearer" }
  } else if (auth.type === "basic") {
    name = "basicAuth"
    schemes[name] ??= { type: "http", scheme: "basic" }
  } else if (auth.type === "ntlm") {
    name = "ntlmAuth"
    schemes[name] ??= { type: "http", scheme: "ntlm" }
  } else if (auth.type === "aws_sigv4") {
    name = "awsSigV4"
    schemes[name] ??= { type: "http", scheme: "AWS4-HMAC-SHA256" }
  } else if (auth.type === "oauth1") {
    return undefined
  } else if (auth.type === "oauth2") {
    const scopes = Object.fromEntries(
      auth.scope
        .split(/\s+/)
        .filter(Boolean)
        .map((scope) => [scope, ""]),
    )
    if (auth.discovery_url && !explicitOAuth2EndpointsAreSufficient(auth)) {
      if (
        auth.authorization_url ||
        auth.access_token_url ||
        auth.refresh_token_url
      ) {
        throw new Error(
          "converters.openapi.export: OAuth 2 discovery cannot be combined with partial explicit endpoint overrides",
        )
      }
      name = addOpenIdConnectScheme(
        schemes,
        openIdConnectUrl(auth.discovery_url),
        auth.grant_type,
      )
      return { security: [{ [name]: Object.keys(scopes) }] }
    }
    let flowName: string
    let flow: OpenApiObject
    if (auth.grant_type === "authorization_code") {
      flowName = "authorizationCode"
      flow = {
        authorizationUrl: auth.authorization_url,
        tokenUrl: auth.access_token_url,
        ...(auth.refresh_token_url
          ? { refreshUrl: auth.refresh_token_url }
          : {}),
        scopes,
      }
    } else if (auth.grant_type === "implicit") {
      flowName = "implicit"
      flow = {
        authorizationUrl: auth.authorization_url,
        ...(auth.refresh_token_url
          ? { refreshUrl: auth.refresh_token_url }
          : {}),
        scopes,
      }
    } else if (auth.grant_type === "password") {
      flowName = "password"
      flow = {
        tokenUrl: auth.access_token_url,
        ...(auth.refresh_token_url
          ? { refreshUrl: auth.refresh_token_url }
          : {}),
        scopes,
      }
    } else {
      flowName = "clientCredentials"
      flow = {
        tokenUrl: auth.access_token_url,
        ...(auth.refresh_token_url
          ? { refreshUrl: auth.refresh_token_url }
          : {}),
        scopes,
      }
    }
    name = addOAuth2Flow(schemes, flowName, flow)
    return { security: [{ [name]: Object.keys(scopes) }] }
  } else {
    const suffix = auth.key
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+(.)/g, (_, char: string) => char.toUpperCase())
    const baseName = `apiKey${auth.placement === "query" ? "Query" : "Header"}${suffix || "Auth"}`
    name = baseName
    let index = 2
    while (true) {
      const existing = schemes[name]
      if (!existing) {
        schemes[name] = {
          type: "apiKey",
          name: auth.key,
          in: auth.placement,
        }
        break
      }
      if (existing.name === auth.key && existing.in === auth.placement) break
      name = `${baseName}${index++}`
    }
  }
  return { security: [{ [name]: [] }] }
}

function serverKey(server: OpenApiObject | undefined): string | undefined {
  return server === undefined ? undefined : JSON.stringify(server)
}

export function exportOpenApi(
  collection: Collection,
  { servers = [] }: OpenApiExportOptions = {},
): OpenApiExportResult {
  const paths: Record<string, OpenApiObject> = {}
  const schemes: Record<string, OpenApiObject> = {}
  const operations: { operation: OpenApiObject; server?: OpenApiObject }[] = []
  const seenOperations = new Map<string, string>()

  for (const { request, tag } of collectRequests(collection.items)) {
    const effective = mergeFolderOverrides(request, collection, request.id)
    const location = requestLocation(effective)
    const path = location.path.replace(PATH_PARAM_RE, "{$1}")
    const method = effective.method.toLowerCase()
    const operationKey = `${method} ${path}`
    const priorId = seenOperations.get(operationKey)
    if (priorId) {
      throw new Error(
        `converters.openapi.export: duplicate operation "${operationKey}" for requests "${priorId}" and "${effective.id}"`,
      )
    }
    seenOperations.set(operationKey, effective.id)

    const operation: OpenApiObject = {
      operationId: effective.id,
      summary: effective.name,
      responses: { default: { description: "Response" } },
    }
    if (tag) operation.tags = [tag]
    const parameters = parametersFor(effective, location)
    if (parameters.length > 0) operation.parameters = parameters
    const requestBody = requestBodyFor(effective)
    if (requestBody) operation.requestBody = requestBody
    const security = securityFor(effective.auth, schemes)
    if (security) Object.assign(operation, security)

    const pathItem = (paths[path] ??= {})
    pathItem[method] = operation
    operations.push({ operation, server: location.server })
  }

  const document: OpenApiObject = {
    openapi: "3.0.3",
    info: { title: collection.name, version: "1.0.0" },
    paths,
  }
  if (Object.keys(schemes).length > 0) {
    document.components = { securitySchemes: schemes }
  }

  if (servers.length > 0) {
    document.servers = servers
    const serverUrls = new Set(
      servers.flatMap(({ url }) =>
        typeof url === "string" ? [url.replace(/\/+$/, "")] : [],
      ),
    )
    for (const { operation, server } of operations) {
      const serverUrl = server?.url
      if (
        typeof serverUrl === "string" &&
        serverUrl !== "{base_url}" &&
        !serverUrls.has(serverUrl.replace(/\/+$/, ""))
      ) {
        operation.servers = [server]
      }
    }
  } else {
    const keys = new Set(operations.map(({ server }) => serverKey(server)))
    if (keys.size === 1) {
      const server = operations[0]?.server
      if (server) document.servers = [server]
    } else {
      for (const { operation, server } of operations) {
        if (server) operation.servers = [server]
      }
    }
  }

  return { document, operationCount: operations.length }
}
