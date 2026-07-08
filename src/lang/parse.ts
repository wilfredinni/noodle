import yaml from "js-yaml"
import type {
  Auth,
  BodyType,
  FormEntry,
  KvEntry,
  Method,
  ParamEntry,
  Request,
} from "../schema"

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
  "multipart",
  "urlencoded",
  "binary",
] as const

function isBodyType(s: string): s is BodyType {
  return (BODY_TYPES as readonly string[]).includes(s as BodyType)
}

type RawAuth =
  | { type: "none"; [k: string]: unknown }
  | { type: "bearer"; token: string; [k: string]: unknown }
  | { type: "basic"; user: string; pass: string; [k: string]: unknown }
  | {
      type: "api_key"
      key: string
      value: string
      placement?: string
      [k: string]: unknown
    }
  | { type: string; [k: string]: unknown }

interface RawRequest {
  name?: unknown
  method?: unknown
  url?: unknown
  headers?: unknown
  params?: unknown
  body?: unknown
  auth?: RawAuth
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
    "followRedirects",
    "maxRedirects",
    "headers",
    "params",
    "body",
    "auth",
    "body_type",
    "form_data",
    "file_path",
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
        `lang.parseRequest: "body_type" must be one of none|json|multipart|urlencoded|binary`,
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

  const auth = parseAuth(raw.auth)

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

  return {
    id,
    name: raw.name,
    method,
    url: raw.url,
    timeout,
    followRedirects,
    maxRedirects,
    headers,
    params,
    body,
    bodyType,
    formData,
    filePath,
    auth,
  }
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

function parseAuth(value: unknown): Auth {
  if (value === undefined) return { type: "none" }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error('lang.parseRequest: "auth" must be a mapping')
  }
  const a = value as RawAuth
  if (a.type === "none") return { type: "none" }
  if (a.type === "inherit") return { type: "inherit" }
  if (a.type === "bearer") {
    if (typeof a.token !== "string") {
      throw new Error('lang.parseRequest: auth.bearer requires "token"')
    }
    return { type: "bearer", token: a.token }
  }
  if (a.type === "basic") {
    if (typeof a.user !== "string" || typeof a.pass !== "string") {
      throw new Error(
        'lang.parseRequest: auth.basic requires "user" and "pass"',
      )
    }
    return { type: "basic", user: a.user, pass: a.pass }
  }
  if (a.type === "api_key") {
    if (typeof a.key !== "string" || typeof a.value !== "string") {
      throw new Error(
        'lang.parseRequest: auth.api_key requires "key" and "value"',
      )
    }
    const placement = a.placement === "query" ? "query" : "header"
    return { type: "api_key", key: a.key, value: a.value, placement }
  }
  throw new Error(
    `lang.parseRequest: invalid auth.type "${String(a.type)}", expected none|inherit|bearer|basic|api_key`,
  )
}
