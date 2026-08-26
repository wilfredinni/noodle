import * as yaml from "../yaml"
import type {
  AssertionOperator,
  AssertionValue,
  AssertionWithoutValueOperator,
  AssertionWithValueOperator,
  BodyType,
  FormEntry,
  KvEntry,
  Method,
  ParamEntry,
  Request,
  ResponseAssertion,
  RequestTlsSettings,
} from "../schema"
import { parseResponseExpression } from "../response"
import { compileAssertionRegex } from "../assertions"
import { parseAuth } from "./auth"

const METHODS: readonly Method[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]

const BODY_TYPES = [
  "none",
  "json",
  "xml",
  "multipart",
  "urlencoded",
  "binary",
] as const

const ASSERTION_WITHOUT_VALUE_OPERATORS = [
  "exists",
  "notExists",
  "isString",
  "isNumber",
  "isBoolean",
  "isArray",
  "isObject",
  "isNull",
  "notNull",
] as const satisfies readonly AssertionWithoutValueOperator[]

const ASSERTION_WITH_VALUE_OPERATORS = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "notContains",
  "matches",
] as const satisfies readonly AssertionWithValueOperator[]

const ASSERTION_OPERATORS: readonly AssertionOperator[] = [
  ...ASSERTION_WITHOUT_VALUE_OPERATORS,
  ...ASSERTION_WITH_VALUE_OPERATORS,
]

function isBodyType(s: string): s is BodyType {
  return (BODY_TYPES as readonly string[]).includes(s as BodyType)
}

interface RawRequest {
  name?: unknown
  method?: unknown
  url?: unknown
  headers?: unknown
  params?: unknown
  body?: unknown
  auth?: unknown
  [k: string]: unknown
}

export function parseRequest(id: string, yamlText: string): Request {
  let doc: unknown
  try {
    doc = yaml.load(yamlText)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`lang.parseRequest: YAML syntax: ${msg}`, { cause: e })
  }

  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("lang.parseRequest: expected a YAML mapping at top level")
  }

  const raw = doc as RawRequest

  const knownKeys = new Set([
    "name",
    "method",
    "url",
    "timeout",
    "tags",
    "followRedirects",
    "maxRedirects",
    "sendCookies",
    "headers",
    "params",
    "path_params",
    "body",
    "auth",
    "body_type",
    "form_data",
    "file_path",
    "tls",
    "capture",
    "assert",
  ])
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      throw new Error(`lang.parseRequest: unknown field "${key}"`)
    }
  }

  if (typeof raw.name !== "string") {
    throw new Error('lang.parseRequest: missing required field "name"')
  }
  if (typeof raw.method !== "string") {
    throw new Error('lang.parseRequest: missing required field "method"')
  }
  if (typeof raw.url !== "string") {
    throw new Error('lang.parseRequest: missing required field "url"')
  }

  const method = raw.method as Method
  if (!METHODS.includes(method)) {
    throw new Error(
      `lang.parseRequest: invalid method "${raw.method}", expected one of GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`,
    )
  }

  const headers = parseKvMap(raw.headers, "headers")
  const params = parseParams(raw.params, "params")
  const pathParams = parsePathParams(raw.path_params)

  let body: string | undefined
  if (raw.body !== undefined) {
    if (typeof raw.body !== "string") {
      throw new Error('lang.parseRequest: "body" must be a string')
    }
    body = raw.body
  }

  let bodyType: BodyType | undefined
  if (raw.body_type !== undefined) {
    if (typeof raw.body_type !== "string" || !isBodyType(raw.body_type)) {
      throw new Error(
        `lang.parseRequest: "body_type" must be one of none|json|xml|multipart|urlencoded|binary`,
      )
    }
    bodyType = raw.body_type as BodyType
  }

  let formData: FormEntry[] | undefined
  if (raw.form_data !== undefined) {
    if (!Array.isArray(raw.form_data)) {
      throw new Error('lang.parseRequest: "form_data" must be an array')
    }
    formData = raw.form_data.map((item: unknown, i: number) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(`lang.parseRequest: form_data[${i}] must be an object`)
      }
      const obj = item as Record<string, unknown>
      if (typeof obj.name !== "string") {
        throw new Error(
          `lang.parseRequest: form_data[${i}].name must be a string`,
        )
      }
      if (typeof obj.value !== "string") {
        throw new Error(
          `lang.parseRequest: form_data[${i}].value must be a string`,
        )
      }
      const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled)
      let type: "text" | "file" = "text"
      if (obj.type !== undefined) {
        if (obj.type === "file") {
          type = "file"
        } else if (obj.type !== "text") {
          throw new Error(
            `lang.parseRequest: form_data[${i}].type must be "text" or "file"`,
          )
        }
      }
      return { name: obj.name, value: obj.value, enabled, type }
    })
  }

  let filePath: string | undefined
  if (raw.file_path !== undefined) {
    if (typeof raw.file_path !== "string") {
      throw new Error('lang.parseRequest: "file_path" must be a string')
    }
    filePath = raw.file_path
  }

  const auth = parseAuth(raw.auth, "lang.parseRequest", true)
  const tls = parseRequestTls(raw.tls)
  const tags = parseTags(raw.tags, "lang.parseRequest")
  const captures = parseCaptures(raw.capture)
  const assertions = parseAssertions(raw.assert)

  let timeout = 0
  if (raw.timeout !== undefined) {
    if (typeof raw.timeout !== "number" || !Number.isFinite(raw.timeout)) {
      throw new Error('lang.parseRequest: "timeout" must be a finite number')
    }
    timeout = raw.timeout
  }

  let followRedirects: boolean = true
  if (raw.followRedirects !== undefined) {
    if (typeof raw.followRedirects !== "boolean") {
      throw new Error('lang.parseRequest: "followRedirects" must be a boolean')
    }
    followRedirects = raw.followRedirects
  }

  let maxRedirects: number = 5
  if (raw.maxRedirects !== undefined) {
    if (
      typeof raw.maxRedirects !== "number" ||
      !Number.isInteger(raw.maxRedirects) ||
      raw.maxRedirects < 0
    ) {
      throw new Error(
        'lang.parseRequest: "maxRedirects" must be a non-negative integer',
      )
    }
    maxRedirects = raw.maxRedirects
  }

  let sendCookies: boolean | undefined
  if (raw.sendCookies !== undefined) {
    if (typeof raw.sendCookies !== "boolean") {
      throw new Error('lang.parseRequest: "sendCookies" must be a boolean')
    }
    sendCookies = raw.sendCookies
  }

  const request: Omit<Request, "pathParams" | "tls"> = {
    id,
    name: raw.name,
    method,
    url: raw.url,
    timeout,
    ...(tags ? { tags } : {}),
    followRedirects,
    maxRedirects,
    ...(sendCookies !== undefined ? { sendCookies } : {}),
    headers,
    params,
    body,
    bodyType,
    formData,
    filePath,
    auth,
    ...(captures ? { captures } : {}),
    ...(assertions ? { assertions } : {}),
  }
  const requestWithTls = tls === undefined ? request : { ...request, tls }
  if (Object.hasOwn(raw, "path_params") && pathParams.length > 0) {
    return { ...requestWithTls, pathParams }
  }
  return requestWithTls as Request
}

export function parseTags(
  value: unknown,
  prefix: "lang.parseRequest" | "lang.parseFolder",
): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`${prefix}: "tags" must be an array`)
  }
  const tags = value.map((tag, index) => {
    if (typeof tag !== "string") {
      throw new Error(`${prefix}: tags[${index}] must be a string`)
    }
    if (!tag || tag.trim() !== tag) {
      throw new Error(
        `${prefix}: tags[${index}] must be a non-empty trimmed string`,
      )
    }
    return tag
  })
  return tags.length > 0 ? tags : undefined
}

function parseCaptures(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('lang.parseRequest: "capture" must be a mapping')
  }

  const captures: Record<string, string> = {}
  for (const [variable, expression] of Object.entries(value)) {
    if (!/^\w+$/.test(variable)) {
      throw new Error(
        `lang.parseRequest: invalid capture variable "${variable}"`,
      )
    }
    if (typeof expression !== "string") {
      throw new Error(`lang.parseRequest: capture.${variable} must be a string`)
    }
    try {
      parseResponseExpression(expression)
    } catch (error) {
      throw new Error(
        `lang.parseRequest: capture.${variable}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    Object.defineProperty(captures, variable, {
      value: expression,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return Object.keys(captures).length > 0 ? captures : undefined
}

function parseAssertions(value: unknown): ResponseAssertion[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error('lang.parseRequest: "assert" must be an array')
  }
  const assertions = value.map((item, index): ResponseAssertion => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`lang.parseRequest: assert[${index}] must be an object`)
    }
    const raw = item as Record<string, unknown>
    for (const key of Object.keys(raw)) {
      if (key !== "expression" && key !== "operator" && key !== "value") {
        throw new Error(
          `lang.parseRequest: unknown assert[${index}] field "${key}"`,
        )
      }
    }
    if (typeof raw.expression !== "string") {
      throw new Error(
        `lang.parseRequest: assert[${index}].expression must be a string`,
      )
    }
    try {
      parseResponseExpression(raw.expression)
    } catch (error) {
      throw new Error(
        `lang.parseRequest: assert[${index}].expression: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    if (
      typeof raw.operator !== "string" ||
      !ASSERTION_OPERATORS.includes(raw.operator as AssertionOperator)
    ) {
      throw new Error(
        `lang.parseRequest: invalid assert[${index}].operator "${String(raw.operator)}"`,
      )
    }

    const hasValue = Object.hasOwn(raw, "value")
    if (
      ASSERTION_WITHOUT_VALUE_OPERATORS.includes(
        raw.operator as AssertionWithoutValueOperator,
      )
    ) {
      if (hasValue) {
        throw new Error(
          `lang.parseRequest: assert[${index}].operator "${raw.operator}" does not accept value`,
        )
      }
      return {
        expression: raw.expression,
        operator: raw.operator as AssertionWithoutValueOperator,
      }
    }
    if (!hasValue) {
      throw new Error(
        `lang.parseRequest: assert[${index}].operator "${raw.operator}" requires value`,
      )
    }

    assertJsonValue(raw.value, `assert[${index}].value`, new Set())
    if (
      ["gt", "gte", "lt", "lte"].includes(raw.operator) &&
      (typeof raw.value !== "number" || !Number.isFinite(raw.value))
    ) {
      throw new Error(
        `lang.parseRequest: assert[${index}].operator "${raw.operator}" requires a finite numeric value`,
      )
    }
    if (raw.operator === "matches") {
      if (typeof raw.value !== "string") {
        throw new Error(
          `lang.parseRequest: assert[${index}].operator "matches" requires a string value`,
        )
      }
      const compiled = compileAssertionRegex(raw.value)
      if (compiled.kind === "error") {
        throw new Error(
          `lang.parseRequest: assert[${index}].operator "matches": ${compiled.message}`,
        )
      }
    }
    return {
      expression: raw.expression,
      operator: raw.operator as AssertionWithValueOperator,
      value: raw.value as AssertionValue,
    }
  })
  return assertions.length > 0 ? assertions : undefined
}

function assertJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): asserts value is AssertionValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return
    throw new Error(`lang.parseRequest: ${path} must contain finite numbers`)
  }
  if (typeof value !== "object") {
    throw new Error(
      `lang.parseRequest: ${path} must be a JSON-compatible value`,
    )
  }
  if (ancestors.has(value)) {
    throw new Error(`lang.parseRequest: ${path} must not contain cycles`)
  }
  ancestors.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, ancestors),
    )
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `lang.parseRequest: ${path} must be a JSON-compatible value`,
      )
    }
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, ancestors)
    }
  }
  ancestors.delete(value)
}

function parseRequestTls(value: unknown): RequestTlsSettings | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('lang.parseRequest: "tls" must be a mapping')
  }
  const raw = value as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (key !== "verify") {
      throw new Error(`lang.parseRequest: unknown tls field "${key}"`)
    }
  }
  if (raw.verify !== undefined && typeof raw.verify !== "boolean") {
    throw new Error('lang.parseRequest: "tls.verify" must be a boolean')
  }
  return raw.verify === undefined ? undefined : { verify: raw.verify }
}

export function parseKvMap(
  value: unknown,
  field: string,
  prefix = "lang.parseRequest",
): Record<string, KvEntry> {
  if (value === undefined) return {}
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${prefix}: ${field} must be a map`)
  }
  const out: Record<string, KvEntry> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = { value: v, enabled: true }
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>
      if (typeof obj.value !== "string") {
        throw new Error(`${prefix}: ${field}.${k} must have string "value"`)
      }
      const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled)
      out[k] = { value: obj.value, enabled }
    } else {
      throw new Error(
        `${prefix}: ${field}.${k} must be a string or {value, enabled} object`,
      )
    }
  }
  return out
}

function parseParams(
  value: unknown,
  field: string,
  prefix = "lang.parseRequest",
): ParamEntry[] {
  if (value === undefined) return []
  if (Array.isArray(value)) {
    return value.map((item: unknown, i: number) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(`${prefix}: ${field}[${i}] must be an object`)
      }
      const obj = item as Record<string, unknown>
      if (typeof obj.name !== "string") {
        throw new Error(`${prefix}: ${field}[${i}].name must be a string`)
      }
      if (typeof obj.value !== "string") {
        throw new Error(`${prefix}: ${field}[${i}].value must be a string`)
      }
      const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled)
      return { name: obj.name, value: obj.value, enabled }
    })
  }
  if (typeof value === "object" && value !== null) {
    const out: ParamEntry[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") {
        out.push({ name: k, value: v, enabled: true })
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>
        if (typeof obj.value !== "string") {
          throw new Error(`${prefix}: ${field}.${k} must have string "value"`)
        }
        const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled)
        out.push({ name: k, value: obj.value, enabled })
      } else {
        throw new Error(
          `${prefix}: ${field}.${k} must be a string or {value, enabled} object`,
        )
      }
    }
    return out
  }
  throw new Error(`${prefix}: ${field} must be a map or array`)
}

function parsePathParams(value: unknown): ParamEntry[] {
  if (value !== undefined) {
    if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) {
        if (
          typeof item === "object" &&
          item !== null &&
          !Array.isArray(item) &&
          Object.hasOwn(item, "enabled")
        ) {
          throw new Error(
            `lang.parseRequest: path_params[${i}].enabled is not supported`,
          )
        }
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [name, item] of Object.entries(value)) {
        if (
          typeof item === "object" &&
          item !== null &&
          !Array.isArray(item) &&
          Object.hasOwn(item, "enabled")
        ) {
          throw new Error(
            `lang.parseRequest: path_params.${name}.enabled is not supported`,
          )
        }
      }
    }
  }

  return parseParams(value, "path_params")
}
