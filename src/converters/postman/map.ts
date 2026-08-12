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
  ParamEntry,
  Request,
} from "../../schema"
import type { ImportResult } from "../index"
import { slugify, METHOD_UPPER } from "../shared"
import { parsePathToken } from "../../requests/pathParams"

export function convertTpl(s: string): string {
  return s.replace(/\{\{(\$?[\w.-]+)\}\}/g, "$$$1")
}

function stripQuery(url: string): string {
  const queryIndex = url.indexOf("?")
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
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
        for (const p of items) {
          params.set(p.key, p.value)
        }
      }
    }
  } catch {
    // ignore
  }

  return params.size > 0 ? params : undefined
}

function mapAuth(
  auth: AuthMember | undefined,
  inheritWhenMissing = false,
): Auth {
  if (!auth) return inheritWhenMissing ? { type: "inherit" } : { type: "none" }
  const type = auth.type

  if (type === "noauth") return { type: "none" }
  if (type === "inherit") return { type: "inherit" }

  const params = extractAuthParams(auth)

  if (type === "bearer") {
    const token = params?.get("token") ?? params?.get("bearer") ?? ""
    return { type: "bearer", token: convertTpl(token) }
  }

  if (type === "basic") {
    return {
      type: "basic",
      user: convertTpl(params?.get("username") ?? ""),
      pass: convertTpl(params?.get("password") ?? ""),
    }
  }

  if (type === "apikey") {
    const key = params?.get("key") ?? ""
    const value = params?.get("value") ?? ""
    const rawPlacement =
      params?.get("in") ?? params?.get("placement") ?? "header"
    return {
      type: "api_key" as const,
      key: convertTpl(key),
      value: convertTpl(value),
      placement: rawPlacement.includes("query") ? "query" : "header",
    }
  }
  if (type === "awsv4") {
    return {
      type: "aws_sigv4",
      access_key: convertTpl(params?.get("accessKey") ?? ""),
      secret_key: convertTpl(params?.get("secretKey") ?? ""),
      region: convertTpl(params?.get("region") ?? ""),
      service: convertTpl(params?.get("service") ?? ""),
      ...(params?.get("sessionToken")
        ? { session_token: convertTpl(params.get("sessionToken")!) }
        : {}),
    }
  }

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

function mapParams(query: PropertyList<QueryParam> | undefined): ParamEntry[] {
  const out: ParamEntry[] = []
  if (!query) return out
  query.each((p: QueryParam) => {
    const key = p.key.trim()
    if (key !== "") {
      out.push({ name: key, value: convertTpl(p.value), enabled: !p.disabled })
    }
  })
  return out
}

function mapBody(req: { body?: BodyMember }): {
  body?: string
  bodyType?: "json" | "urlencoded" | "multipart" | "binary"
  formData?: FormEntry[]
  filePath?: string
} {
  const b = req.body
  if (!b) return {}

  const mode = b.mode

  if (mode === "raw") {
    const raw = b.raw ?? ""
    const lang = b.options?.raw?.language
    const bodyType =
      lang === undefined || lang === "json" ? ("json" as const) : undefined
    return { body: convertTpl(raw), ...(bodyType ? { bodyType } : {}) }
  }

  if (mode === "urlencoded") {
    const formData: FormEntry[] = []
    if (b.urlencoded) {
      b.urlencoded.each(
        (e: { key: string; value: string; disabled?: boolean }) => {
          formData.push({
            name: e.key,
            value: convertTpl(e.value),
            enabled: !e.disabled,
            type: "text",
          })
        },
      )
    }
    return { bodyType: "urlencoded", formData }
  }

  if (mode === "formdata") {
    const formData: FormEntry[] = []
    if (b.formdata) {
      b.formdata.each((e: FormParam) => {
        formData.push({
          name: e.key,
          value: convertTpl(e.type === "file" ? (e.src ?? e.value) : e.value),
          enabled: !e.disabled,
          type: e.type === "file" ? "file" : "text",
        })
      })
    }
    return { bodyType: "multipart", formData }
  }

  if (mode === "file") {
    return {
      bodyType: "binary",
      filePath: convertTpl(b.file?.src ?? ""),
    }
  }

  return {}
}

function mapUrl(req: {
  url?: {
    getRaw?: () => string
    toString?: () => string
    getPath?: (unresolved?: boolean) => string
    query?: PropertyList<QueryParam>
  }
}): string {
  if (!req.url) return "$base_url"

  let raw = ""
  try {
    raw = typeof req.url.getRaw === "function" ? (req.url.getRaw() ?? "") : ""
  } catch {
    // ignore
  }
  if (raw) return convertTpl(stripQuery(raw))

  try {
    raw = typeof req.url.toString === "function" ? req.url.toString() : ""
  } catch {
    // ignore
  }
  if (!raw) return "$base_url"

  try {
    const resolvedPath = req.url.getPath?.()
    const unresolvedPath = req.url.getPath?.(true)
    if (
      typeof resolvedPath === "string" &&
      typeof unresolvedPath === "string" &&
      resolvedPath !== unresolvedPath
    ) {
      const pathIndex = raw.indexOf(resolvedPath)
      if (pathIndex !== -1) {
        raw =
          raw.slice(0, pathIndex) +
          unresolvedPath +
          raw.slice(pathIndex + resolvedPath.length)
      }
    }
  } catch {
    // Ignore incomplete Postman URL objects and use their serialized value.
  }

  if (raw) return convertTpl(stripQuery(raw))

  return "$base_url"
}

function uniqueId(candidate: string, usedIds: Set<string>): string {
  if (!usedIds.has(candidate)) return candidate
  let n = 2
  while (usedIds.has(`${candidate}-${n}`)) n++
  return `${candidate}-${n}`
}

function mapRequest(
  item: Item,
  parentPath: string,
  index: number,
  usedIds: Set<string>,
): Request {
  const req = item.request
  if (!req) {
    const id = uniqueId(`${parentPath}unknown-${index}`, usedIds)
    return {
      id,
      name: item.name,
      method: "GET",
      url: "$base_url",
      timeout: 0,
      headers: {},
      params: [],
    }
  }

  const method = METHOD_UPPER[(req.method ?? "").toLowerCase()] ?? "GET"
  const url = mapUrl(req)

  let pathParams: ParamEntry[] | undefined
  const urlPath = req.url?.path
  if (urlPath && urlPath.length > 0) {
    const pathTokens: string[] = []
    const seen = new Set<string>()
    for (const seg of urlPath) {
      const name = parsePathToken(seg)
      if (name !== null) {
        if (!seen.has(name)) {
          seen.add(name)
          pathTokens.push(name)
        }
      }
    }

    if (pathTokens.length > 0) {
      const urlVariables = new Map<string, string>()
      try {
        const uv = req.url?.variables
        if (uv) {
          uv.each((v) => {
            urlVariables.set(v.key, convertTpl(v.value ?? ""))
          })
        }
      } catch {
        // ignore
      }
      pathParams = pathTokens.map((name) => ({
        name,
        value: urlVariables.get(name) ?? "",
        enabled: true,
      }))
    }
  }

  const headers = mapHeaders(req.headers as PropertyList<Header> | undefined)
  const params = mapParams(
    (req.url as { query?: PropertyList<QueryParam> })?.query,
  )
  const bodyMapping = mapBody(req as { body?: BodyMember })
  const auth = mapAuth(req.auth as AuthMember | undefined, true)
  const behavior = item.protocolProfileBehavior
  const followRedirects = behavior?.followRedirects
  const maxRedirects = behavior?.maxRedirects

  const rawId = slugify(`${method}-${item.name}`)
  const id = uniqueId(`${parentPath}${rawId || `request-${index}`}`, usedIds)
  usedIds.add(id)

  return {
    id,
    name: item.name,
    method,
    url,
    timeout: 0,
    headers,
    params,
    pathParams,
    ...bodyMapping,
    auth,
    ...(typeof followRedirects === "boolean" ? { followRedirects } : {}),
    ...(typeof maxRedirects === "number" && maxRedirects >= 0
      ? { maxRedirects }
      : {}),
  }
}

function mapItems(
  items: PropertyList<Item | ItemGroup> | undefined,
  parentPath: string,
  usedIds: Set<string>,
): CollectionItem[] {
  if (!items) return []
  const result: CollectionItem[] = []
  let idx = 0

  items.each((item) => {
    idx++

    if ("items" in item) {
      const itemGroup = item as ItemGroup
      const name = itemGroup.name
      const rawFolderId = slugify(name) || `folder-${idx}`
      const folderId = uniqueId(rawFolderId, usedIds)
      usedIds.add(folderId)
      const path = `${parentPath}${folderId}/`

      const auth = itemGroup.auth
      const overrides = auth ? { auth: mapAuth(auth) } : undefined

      result.push({
        type: "folder",
        data: {
          id: folderId,
          name,
          path: path.slice(0, -1),
          overrides,
          children: mapItems(itemGroup.items, path, usedIds),
        },
      })
    } else {
      result.push({
        type: "request",
        data: mapRequest(item as Item, parentPath, idx, usedIds),
      })
    }
  })

  return result
}

export function mapCollection(col: Collection): ImportResult {
  const name = col.name || "postman-import"
  const collectionId = slugify(name)

  const rootItems = mapItems(col.items, "", new Set<string>())

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
