import type {
  Auth,
  Collection,
  CollectionItem,
  FormEntry,
  ParamEntry,
  Request,
} from "../../schema"
import { parseJsonPreservingNumbers } from "../../lang/formatJson"
import { mergeFolderOverrides } from "../../requests/mergeFolderOverrides"
import { withDefaultHttpsScheme } from "../../requests/url"

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

const SERVER_VAR_RE = /\$(\w+)/g
const PATH_PARAM_RE = /:([\w-]+)(?=\/|\.|$)/g
const BASE_VAR_URL_RE = /^(\$\w+)(\/[^?#]*)?(\?[^#]*)?(?:#.*)?$/
const SCHEME_VAR_RE = /^(\$\w+):\/\//
const PORT_VAR_RE = /:(\$\w+)(?=\/|[?#]|$)/g

interface ParseableUrl {
  value: string
  restore(value: string): string
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
  const template = url.replace(SERVER_VAR_RE, (_, name: string) => {
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
    value = value.replace(SCHEME_VAR_RE, (_, variable: string) => {
      schemeVariable = variable
      return "https://"
    })
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

  value = value.replace(
    PORT_VAR_RE,
    (_, variable: string) => `:${portMarker(variable)}`,
  )
  value = value.replace(SERVER_VAR_RE, (_, variable: string) =>
    textMarker(`$${variable}`),
  )

  return {
    value,
    restore(parsed: string): string {
      let restored = parsed
      for (const [marker, variable] of replacements) {
        restored = restored.replaceAll(marker, variable)
      }
      return schemeVariable
        ? restored.replace(/^https:/, `${schemeVariable}:`)
        : restored
    },
  }
}

function requestLocation(request: Request): RequestLocation {
  const dynamicBase = request.url.match(BASE_VAR_URL_RE)
  if (dynamicBase) {
    return {
      path: dynamicBase[2] || "/",
      query: queryEntries(dynamicBase[3] || ""),
      server: serverFor(dynamicBase[1]),
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
    server: serverFor(template.restore(parsed.origin)),
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

export function exportOpenApi(collection: Collection): OpenApiExportResult {
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

  const keys = new Set(operations.map(({ server }) => serverKey(server)))
  if (keys.size === 1) {
    const server = operations[0]?.server
    if (server) document.servers = [server]
  } else {
    for (const { operation, server } of operations) {
      if (server) operation.servers = [server]
    }
  }

  return { document, operationCount: operations.length }
}
