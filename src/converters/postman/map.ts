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
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../../auth/defaults"

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
          params.set(p.key, String(p.value))
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
  if (type === "ntlm") {
    return {
      type: "ntlm",
      username: convertTpl(params?.get("username") ?? ""),
      password: convertTpl(params?.get("password") ?? ""),
      domain: convertTpl(params?.get("domain") ?? ""),
      workstation: convertTpl(params?.get("workstation") ?? ""),
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
  if (type === "oauth1") {
    const defaults = defaultOAuth1Auth()
    const signature =
      params?.get("signatureMethod") ?? defaults.signature_method
    const placementValue = params?.get("placement")
    return {
      ...defaults,
      consumer_key: convertTpl(params?.get("consumerKey") ?? ""),
      consumer_secret: convertTpl(params?.get("consumerSecret") ?? ""),
      access_token: convertTpl(params?.get("token") ?? ""),
      access_token_secret: convertTpl(params?.get("tokenSecret") ?? ""),
      signature_method: [
        "HMAC-SHA1",
        "HMAC-SHA256",
        "HMAC-SHA512",
        "RSA-SHA1",
        "RSA-SHA256",
        "RSA-SHA512",
        "PLAINTEXT",
      ].includes(signature)
        ? (signature as typeof defaults.signature_method)
        : defaults.signature_method,
      private_key: convertTpl(params?.get("privateKey") ?? ""),
      private_key_type:
        params?.get("privateKeyType") === "file" ? "file" : "text",
      callback_url: convertTpl(params?.get("callbackUrl") ?? ""),
      verifier: convertTpl(params?.get("verifier") ?? ""),
      timestamp: convertTpl(params?.get("timestamp") ?? ""),
      nonce: convertTpl(params?.get("nonce") ?? ""),
      version: params?.get("version") ?? defaults.version,
      realm: convertTpl(params?.get("realm") ?? ""),
      placement:
        placementValue === "query" || placementValue === "body"
          ? placementValue
          : params?.get("addParamsToHeader") === "false"
            ? "query"
            : "header",
      include_body_hash: params?.get("includeBodyHash") === "true",
    }
  }
  if (type === "oauth2") {
    const defaults = defaultOAuth2Auth()
    const rawGrant = params?.get("grant_type") ?? params?.get("grantType")
    const grant_type =
      rawGrant === "client_credentials" ||
      rawGrant === "implicit" ||
      rawGrant === "password"
        ? rawGrant
        : "authorization_code"
    const challenge = params?.get("code_challenge_method")
    return {
      ...defaults,
      grant_type,
      authorization_url: convertTpl(params?.get("authUrl") ?? ""),
      access_token_url: convertTpl(params?.get("accessTokenUrl") ?? ""),
      refresh_token_url: convertTpl(params?.get("refreshTokenUrl") ?? ""),
      client_id: convertTpl(params?.get("clientId") ?? ""),
      client_secret: convertTpl(params?.get("clientSecret") ?? ""),
      username: convertTpl(params?.get("username") ?? ""),
      password: convertTpl(params?.get("password") ?? ""),
      scope: convertTpl(params?.get("scope") ?? ""),
      audience: convertTpl(params?.get("audience") ?? ""),
      redirect_uri: convertTpl(
        params?.get("redirect_uri") ??
          params?.get("redirectUri") ??
          defaults.redirect_uri,
      ),
      pkce: challenge === "S256" || challenge === "plain",
      pkce_method: challenge === "plain" ? "plain" : "S256",
      credentials_placement:
        params?.get("client_authentication") === "basic" ||
        params?.get("client_authentication") === "header"
          ? "basic"
          : "body",
      token_placement:
        params?.get("addTokenTo") === "queryParams" ? "query" : "header",
      token_prefix: params?.get("headerPrefix") ?? defaults.token_prefix,
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

function mapBody(
  req: { body?: BodyMember },
  contentType?: string,
): {
  body?: string
  bodyType?: "json" | "xml" | "urlencoded" | "multipart" | "binary"
  formData?: FormEntry[]
  filePath?: string
} {
  const b = req.body
  if (!b) return {}

  const mode = b.mode

  if (mode === "raw") {
    const raw = b.raw ?? ""
    const lang = b.options?.raw?.language
    const mimeType = contentType
      ? contentType.split(";", 1)[0]!.trim().toLowerCase()
      : undefined
    const isXmlContentType =
      mimeType === "application/xml" ||
      mimeType === "text/xml" ||
      mimeType?.endsWith("+xml") === true
    const bodyType =
      lang === "xml" || isXmlContentType
        ? ("xml" as const)
        : lang === undefined || lang === "json"
          ? ("json" as const)
          : undefined
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
  const contentType = Object.entries(headers).find(
    ([name, entry]) => entry.enabled && name.toLowerCase() === "content-type",
  )?.[1].value
  const bodyMapping = mapBody(req as { body?: BodyMember }, contentType)
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
