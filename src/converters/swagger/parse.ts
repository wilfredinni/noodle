import yaml from "js-yaml"
import type { Normalized } from "../openapi/map"
import { resolveSpecRefs } from "../openapi/refs"

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
])
const SUPPORTED_MEDIA = new Set([
  "application/json",
  "multipart/form-data",
  "application/x-www-form-urlencoded",
])

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function normalizeBasePath(value: unknown): string {
  if (typeof value !== "string" || value === "" || value === "/") return ""
  const path = value.startsWith("/") ? value : `/${value}`
  return path.replace(/\/+$/, "")
}

function normalizeParameter(parameter: Record<string, unknown>) {
  const result = { ...parameter }
  if (parameter.default !== undefined) {
    result.schema = isMapping(parameter.schema)
      ? { ...parameter.schema, default: parameter.default }
      : { default: parameter.default }
  }
  return result
}

function requestBody(
  parameters: Record<string, unknown>[],
  consumes: string[],
): Record<string, unknown> | undefined {
  const body = parameters.findLast((parameter) => parameter.in === "body")
  if (body) {
    const media = consumes.find((value) => SUPPORTED_MEDIA.has(value))
    if (!media) return undefined
    return {
      content: {
        [media]: isMapping(body.schema) ? { schema: body.schema } : {},
      },
    }
  }

  const formData = parameters.filter((parameter) => parameter.in === "formData")
  if (formData.length === 0) return undefined

  const properties: Record<string, unknown> = {}
  let hasFile = false
  for (const parameter of formData) {
    const name = parameter.name
    if (typeof name !== "string" || name === "") continue
    if (parameter.type === "file") {
      properties[name] = { type: "string", format: "binary" }
      hasFile = true
    } else {
      properties[name] = {
        type: typeof parameter.type === "string" ? parameter.type : "string",
      }
    }
  }
  const media =
    hasFile || consumes.includes("multipart/form-data")
      ? "multipart/form-data"
      : "application/x-www-form-urlencoded"
  return { content: { [media]: { schema: { properties } } } }
}

function normalizePaths(
  paths: Record<string, unknown>,
  consumes: string[],
  basePath: string,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isMapping(pathItem)) continue
    const pathParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters.filter(isMapping)
      : []
    const item: Record<string, unknown> = {
      ...pathItem,
      parameters: pathParameters
        .filter(
          (parameter) => parameter.in !== "body" && parameter.in !== "formData",
        )
        .map(normalizeParameter),
    }

    for (const [key, value] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(key) || !isMapping(value)) continue
      const operationParameters = Array.isArray(value.parameters)
        ? value.parameters.filter(isMapping)
        : []
      const operationConsumes = strings(value.consumes)
      const allParameters = [...pathParameters, ...operationParameters]
      const body = requestBody(
        allParameters,
        operationConsumes.length > 0 ? operationConsumes : consumes,
      )
      item[key] = {
        ...value,
        parameters: operationParameters
          .filter(
            (parameter) =>
              parameter.in !== "body" && parameter.in !== "formData",
          )
          .map(normalizeParameter),
        ...(body ? { requestBody: body } : {}),
      }
    }
    normalized[
      basePath ? `${basePath}${path.startsWith("/") ? path : `/${path}`}` : path
    ] = item
  }
  return normalized
}

function normalizeSecurityDefinitions(value: unknown): Record<string, unknown> {
  if (!isMapping(value)) return {}
  const schemes: Record<string, unknown> = {}
  for (const [name, definition] of Object.entries(value)) {
    if (!isMapping(definition)) continue
    if (definition.type === "basic") {
      schemes[name] = { type: "http", scheme: "basic" }
    } else if (definition.type === "apiKey") {
      schemes[name] = definition
    }
  }
  return schemes
}

export function parseSwaggerSpec(spec: string | object): Normalized {
  let doc: unknown
  if (typeof spec === "string") {
    try {
      doc = JSON.parse(spec)
    } catch {
      try {
        doc = yaml.load(spec)
      } catch (eYaml) {
        const msg = eYaml instanceof Error ? eYaml.message : String(eYaml)
        throw new Error(
          `converters.swagger.import: failed to parse spec (not valid JSON or YAML): ${msg}`,
          { cause: eYaml },
        )
      }
    }
  } else {
    doc = spec
  }

  if (!isMapping(doc)) {
    throw new Error("converters.swagger.import: spec root must be a mapping")
  }
  if (doc.swagger !== "2.0") {
    throw new Error(
      'converters.swagger.import: unsupported or missing "swagger" version, expected "2.0"',
    )
  }
  if (!isMapping(doc.paths)) {
    throw new Error('converters.swagger.import: missing or invalid "paths"')
  }

  const root = resolveSpecRefs(doc) as Record<string, unknown>
  const basePath = normalizeBasePath(root.basePath)
  const host =
    typeof root.host === "string" && root.host !== "" ? root.host : null
  const scheme =
    strings(root.schemes).find(
      (value) => value === "http" || value === "https",
    ) ?? "https"

  return {
    openapi: "3.0.0",
    info: root.info as Normalized["info"],
    servers: host ? [{ url: `${scheme}://${host}${basePath || "/"}` }] : [],
    paths: normalizePaths(
      root.paths as Record<string, unknown>,
      strings(root.consumes),
      host ? "" : basePath,
    ),
    security: root.security,
    components: {
      securitySchemes: normalizeSecurityDefinitions(root.securityDefinitions),
    },
  }
}
