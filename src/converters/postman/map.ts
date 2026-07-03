import type { Collection } from "postman-collection"
import type {
  Item,
  ItemGroup,
  Header,
  QueryParam,
  BodyMember,
  AuthMember,
  FormParam,
  PropertyList,
  Variable,
} from "postman-collection"
import type {
  Auth,
  CollectionItem,
  Environment,
  FormEntry,
  KvEntry,
  Method,
  Request,
} from "../../schema"
import type { ImportResult } from "../index"

export type { ImportResult }

const METHOD_UPPER: Record<string, Method> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  head: "HEAD",
  options: "OPTIONS",
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function convertTpl(s: string): string {
  return s.replace(/\{\{(\$?[\w.-]+)\}\}/g, "$$$1")
}

function extractAuthParams(
  auth: AuthMember | undefined,
): Map<string, string> | undefined {
  if (!auth) return undefined

  const params = new Map<string, string>()

  try {
    const raw = auth.parameters?.()
    if (raw) {
      const items = raw.all()
      if (items.length > 0) {
        const byKey = new Map(items.map((p) => [p.key, p.value]))

        if (byKey.has("key") && byKey.has("value")) {
          params.set(byKey.get("key")!, byKey.get("value")!)
        } else {
          for (const p of items) {
            params.set(p.key, p.value)
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return params.size > 0 ? params : undefined
}

function mapAuth(auth: AuthMember | undefined): Auth {
  if (!auth) return { type: "none" }
  const type = auth.type

  if (type === "noauth") return { type: "none" }
  if (type === "inherit") return { type: "inherit" }

  const params = extractAuthParams(auth)

  if (type === "bearer") {
    const token =
      params?.get("token") ??
      params?.get("bearer") ??
      ""
    return { type: "bearer", token: convertTpl(token) }
  }

  if (type === "basic") {
    return {
      type: "basic",
      user: params?.get("username") ?? "",
      pass: params?.get("password") ?? "",
    }
  }

  if (type === "apikey") {
    const key = params?.get("key") ?? ""
    const value = params?.get("value") ?? ""
    const rawPlacement = params?.get("placement") ?? "header"
    return {
      type: "api_key" as const,
      key,
      value: convertTpl(value),
      placement: rawPlacement.includes("query") ? "query" : "header",
    }
  }

  process.stderr.write(
    `postman.import: unsupported auth type "${type}", mapping to none\n`,
  )
  return { type: "none" }
}

function mapHeaders(
  headers: PropertyList<Header> | undefined,
): Record<string, KvEntry> {
  const out: Record<string, KvEntry> = {}
  if (!headers) return out
  headers.each((h: Header) => {
    const key = h.key.trim()
    if (key !== "") {
      out[key] = { value: convertTpl(h.value), enabled: !h.disabled }
    }
  })
  return out
}

function mapParams(
  query: PropertyList<QueryParam> | undefined,
): Record<string, KvEntry> {
  const out: Record<string, KvEntry> = {}
  if (!query) return out
  query.each((p: QueryParam) => {
    const key = p.key.trim()
    if (key !== "") {
      out[key] = { value: convertTpl(p.value), enabled: !p.disabled }
    }
  })
  return out
}

function mapBody(req: { body?: BodyMember }): {
  body?: string
  bodyType?: "json" | "urlencoded" | "multipart"
  formData?: FormEntry[]
} {
  const b = req.body
  if (!b) return {}

  const mode = b.mode

  if (mode === "raw") {
    const raw = b.raw ?? ""
    return { body: raw, bodyType: "json" }
  }

  if (mode === "urlencoded") {
    const formData: FormEntry[] = []
    if (b.urlencoded) {
      b.urlencoded.each((e: { key: string; value: string; disabled?: boolean }) => {
        if (!e.disabled) {
          formData.push({
            name: e.key,
            value: convertTpl(e.value),
            enabled: true,
            type: "text",
          })
        }
      })
    }
    return { bodyType: "urlencoded", formData }
  }

  if (mode === "formdata") {
    const formData: FormEntry[] = []
    if (b.formdata) {
      b.formdata.each((e: FormParam) => {
        if (!e.disabled) {
          formData.push({
            name: e.key,
            value: convertTpl(e.value),
            enabled: true,
            type: e.type === "file" ? "file" : "text",
          })
        }
      })
    }
    return { bodyType: "multipart", formData }
  }

  return {}
}

function mapUrl(
  req: { url?: { getRaw?: () => string; toString?: () => string; query?: PropertyList<QueryParam> } },
): string {
  if (!req.url) return "$base_url"

  let raw = ""
  try {
    raw = typeof req.url.getRaw === "function" ? req.url.getRaw() : ""
  } catch {
    // ignore
  }
  if (raw) return convertTpl(raw)

  try {
    raw = typeof req.url.toString === "function" ? req.url.toString() : ""
  } catch {
    // ignore
  }
  if (raw) return convertTpl(raw)

  return "$base_url"
}

function mapRequest(
  item: Item,
  parentPath: string,
  index: number,
): Request {
  const req = item.request
  if (!req) {
    return {
      id: `${parentPath}unknown-${index}`,
      name: item.name,
      method: "GET",
      url: "$base_url",
      timeout: 0,
      headers: {},
      params: {},
    }
  }

  const method =
    METHOD_UPPER[(req.method ?? "").toLowerCase()] ?? "GET"
  const url = mapUrl(req)
  const headers = mapHeaders(req.headers as PropertyList<Header> | undefined)
  const params = mapParams((req.url as { query?: PropertyList<QueryParam> })?.query)
  const bodyMapping = mapBody(req as { body?: BodyMember })
  const auth = mapAuth(req.auth as AuthMember | undefined)

  const rawId = slugify(
    `${method}-${item.name}`,
  )
  const id = `${parentPath}${rawId || `request-${index}`}`

  return {
    id,
    name: item.name,
    method,
    url,
    timeout: 0,
    headers,
    params,
    ...bodyMapping,
    auth,
  }
}

function mapItems(
  items: PropertyList<Item | ItemGroup> | undefined,
  parentPath: string,
): CollectionItem[] {
  if (!items) return []
  const result: CollectionItem[] = []
  let idx = 0

  items.each((item) => {
    idx++

    const itemGroup = item as ItemGroup
    if (itemGroup.items) {
      const name = itemGroup.name
      const folderId = slugify(name) || `folder-${idx}`
      const path = `${parentPath}${folderId}/`

      const auth = (itemGroup as { auth?: AuthMember }).auth
      const overrides = auth ? { auth: mapAuth(auth) } : undefined

      result.push({
        type: "folder",
        data: {
          id: folderId,
          name,
          path: folderId,
          overrides,
          children: mapItems(itemGroup.items, path),
        },
      })
    } else {
      const reqItem = item as Item
      result.push({
        type: "request",
        data: mapRequest(reqItem, parentPath, idx),
      })
    }
  })

  return result
}

export function mapCollection(col: Collection): ImportResult {
  const name = col.name || "postman-import"
  const collectionId = slugify(name)

  const rootItems = mapItems(col.items, "")

  const envVars: Record<string, string> = {}
  try {
    col.variables.each((v: Variable) => {
      envVars[v.key] = v.value ?? ""
    })
  } catch {
    // no collection variables
  }

  const environments: Environment[] = []
  if (Object.keys(envVars).length > 0) {
    environments.push({ name: "default", vars: envVars })
  }

  return {
    collection: { id: collectionId, name, items: rootItems },
    environments,
  }
}
