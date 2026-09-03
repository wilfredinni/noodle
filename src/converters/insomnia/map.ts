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
import { METHOD_UPPER, setOwn, slugify } from "../shared"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../../auth/defaults"

type RawResource = Record<string, unknown>

function asRecord(value: unknown): RawResource | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RawResource)
    : undefined
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function convertTpl(value: string): string {
  return value.replace(/\{\{\s*(?:_\.\s*)?(\w+)\s*\}\}/g, "$$$1")
}

function uniqueId(candidate: string, usedIds: Set<string>): string {
  if (!usedIds.has(candidate)) return candidate
  let n = 2
  while (usedIds.has(`${candidate}-${n}`)) n++
  return `${candidate}-${n}`
}

function mapPairs(value: unknown): ParamEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const pair = asRecord(item)
    const name = stringValue(pair?.name).trim()
    if (!name) return []
    return [
      {
        name,
        value: convertTpl(stringValue(pair?.value)),
        enabled: pair?.disabled !== true,
      },
    ]
  })
}

function mapHeaders(value: unknown): Record<string, KvEntry> {
  const headers: Record<string, KvEntry> = {}
  for (const pair of mapPairs(value)) {
    headers[pair.name] = { value: pair.value, enabled: pair.enabled }
  }
  return headers
}

function mapAuth(value: unknown): Auth {
  const auth = asRecord(value)
  if (!auth || auth.disabled === true) return { type: "none" }

  if (auth.type === "bearer") {
    return { type: "bearer", token: convertTpl(stringValue(auth.token)) }
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      user: convertTpl(stringValue(auth.username)),
      pass: convertTpl(stringValue(auth.password)),
    }
  }
  if (auth.type === "ntlm") {
    return {
      type: "ntlm",
      username: convertTpl(stringValue(auth.username)),
      password: convertTpl(stringValue(auth.password)),
      domain: convertTpl(stringValue(auth.domain)),
      workstation: convertTpl(stringValue(auth.workstation)),
    }
  }
  if (auth.type === "apikey") {
    return {
      type: "api_key",
      key: stringValue(auth.key),
      value: convertTpl(stringValue(auth.value)),
      placement: auth.addTo === "query" ? "query" : "header",
    }
  }
  if (auth.type === "oauth1") {
    const defaults = defaultOAuth1Auth()
    const signature =
      stringValue(auth.signatureMethod) || defaults.signature_method
    return {
      ...defaults,
      consumer_key: convertTpl(stringValue(auth.consumerKey)),
      consumer_secret: convertTpl(stringValue(auth.consumerSecret)),
      access_token: convertTpl(
        stringValue(auth.tokenKey) || stringValue(auth.accessToken),
      ),
      access_token_secret: convertTpl(stringValue(auth.tokenSecret)),
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
      private_key: convertTpl(stringValue(auth.privateKey)),
      realm: convertTpl(stringValue(auth.realm)),
      callback_url: convertTpl(stringValue(auth.callbackUrl)),
      verifier: convertTpl(stringValue(auth.verifier)),
      nonce: convertTpl(stringValue(auth.nonce)),
      timestamp: convertTpl(stringValue(auth.timestamp)),
      placement:
        auth.addTo === "query" || auth.addTo === "body" ? auth.addTo : "header",
      include_body_hash: auth.includeBodyHash === true,
    }
  }
  if (auth.type === "oauth2") {
    const defaults = defaultOAuth2Auth()
    const rawGrant = stringValue(auth.grantType || auth.grant_type)
    const grant_type =
      rawGrant === "client_credentials" ||
      rawGrant === "implicit" ||
      rawGrant === "password"
        ? rawGrant
        : "authorization_code"
    return {
      ...defaults,
      grant_type,
      authorization_url: convertTpl(stringValue(auth.authorizationUrl)),
      access_token_url: convertTpl(stringValue(auth.accessTokenUrl)),
      refresh_token_url: convertTpl(stringValue(auth.refreshTokenUrl)),
      client_id: convertTpl(stringValue(auth.clientId)),
      client_secret: convertTpl(stringValue(auth.clientSecret)),
      username: convertTpl(stringValue(auth.username)),
      password: convertTpl(stringValue(auth.password)),
      scope: convertTpl(stringValue(auth.scope)),
      audience: convertTpl(stringValue(auth.audience)),
      redirect_uri:
        convertTpl(stringValue(auth.redirectUrl || auth.redirectUri)) ||
        defaults.redirect_uri,
      pkce: auth.usePkceGrant !== false,
      pkce_method: auth.pkceMethod === "plain" ? "plain" : "S256",
      credentials_placement:
        auth.credentialsInBody === false ? "basic" : "body",
      token_placement: auth.addTo === "query" ? "query" : "header",
      token_prefix: stringValue(auth.tokenPrefix) || defaults.token_prefix,
    }
  }
  return { type: "none" }
}

function mapBody(
  value: unknown,
): Pick<Request, "body" | "bodyType" | "formData" | "filePath"> {
  const body = asRecord(value)
  if (!body) return {}
  const mimeType = stringValue(body.mimeType)
    .split(";", 1)[0]!
    .trim()
    .toLowerCase()

  if (typeof body.fileName === "string") {
    return { bodyType: "binary", filePath: convertTpl(body.fileName) }
  }

  if (mimeType === "application/x-www-form-urlencoded") {
    return { bodyType: "urlencoded", formData: mapFormData(body.params) }
  }
  if (mimeType === "multipart/form-data") {
    return { bodyType: "multipart", formData: mapFormData(body.params) }
  }

  const text = typeof body.text === "string" ? convertTpl(body.text) : undefined
  if (text === undefined) return {}
  if (mimeType === "application/json" || mimeType.endsWith("+json")) {
    return { body: text, bodyType: "json" }
  }
  if (
    mimeType === "application/xml" ||
    mimeType === "text/xml" ||
    mimeType.endsWith("+xml")
  ) {
    return { body: text, bodyType: "xml" }
  }
  return { body: text }
}

function mapFormData(value: unknown): FormEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const pair = asRecord(item)
    const name = stringValue(pair?.name).trim()
    if (!name) return []
    const isFile = pair?.type === "file" || typeof pair?.fileName === "string"
    return [
      {
        name,
        value: convertTpl(
          stringValue(isFile ? (pair?.fileName ?? pair?.value) : pair?.value),
        ),
        enabled: pair?.disabled !== true,
        type: isFile ? "file" : "text",
      },
    ]
  })
}

function mapRequest(resource: RawResource, id: string): Request | undefined {
  const rawMethod = resource.method
  if (
    rawMethod !== undefined &&
    rawMethod !== null &&
    typeof rawMethod !== "string"
  ) {
    return undefined
  }
  const methodKey =
    typeof rawMethod === "string" ? rawMethod.trim().toLowerCase() : ""
  const method = methodKey === "" ? "GET" : METHOD_UPPER[methodKey]
  if (!method) return undefined
  const followRedirects = resource.settingFollowRedirects
  return {
    id,
    name: stringValue(resource.name) || "Untitled Request",
    method,
    url: convertTpl(stringValue(resource.url) || "$base_url"),
    timeout: 0,
    ...(followRedirects === "always" ? { followRedirects: true } : {}),
    ...(followRedirects === "never" ? { followRedirects: false } : {}),
    headers: mapHeaders(resource.headers),
    params: mapPairs(resource.parameters),
    pathParams: mapPairs(resource.pathParameters),
    ...mapBody(resource.body),
    auth: mapAuth(resource.authentication),
  }
}

function envValue(value: unknown): string | undefined {
  return typeof value === "string"
    ? convertTpl(value).replace(/\r\n?|\n/g, "\\n")
    : JSON.stringify(value)
}

function metaSortKey(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function mapEnvironmentVars(
  resource: RawResource,
  byId: Map<string, RawResource>,
): Record<string, string> {
  const chain: RawResource[] = []
  const seen = new Set<string>()
  let current: RawResource | undefined = resource

  while (current) {
    const id = stringValue(current._id)
    if (id && seen.has(id)) break
    if (id) seen.add(id)
    chain.push(current)

    const parent = byId.get(stringValue(current.parentId))
    current = parent?._type === "environment" ? parent : undefined
  }

  const vars: Record<string, string> = {}
  for (const environment of chain.reverse()) {
    const data = asRecord(environment.data)
    if (!data) continue
    for (const [key, value] of Object.entries(data)) {
      const serialized = envValue(value)
      if (serialized !== undefined) setOwn(vars, key, serialized)
    }
  }
  return vars
}

function mapEnvironments(
  resources: RawResource[],
  workspaceId: string,
): Environment[] {
  const byId = new Map(
    resources.flatMap((resource) => {
      const id = resource._id
      return typeof id === "string" ? [[id, resource] as const] : []
    }),
  )
  const envs: Environment[] = []
  const usedNames = new Set<string>()
  for (const resource of resources) {
    if (resource._type !== "environment" || typeof resource._id !== "string") {
      continue
    }
    const parentId = stringValue(resource.parentId)
    const parent = byId.get(parentId)
    if (parentId !== workspaceId && parent?._type !== "environment") continue
    const vars = mapEnvironmentVars(resource, byId)
    if (Object.keys(vars).length > 0) {
      const name = uniqueId(
        (stringValue(resource.name) || "default")
          .replace(/\.\./g, "-")
          .replace(/[\\/]/g, "-") || "default",
        usedNames,
      )
      usedNames.add(name)
      envs.push({
        name,
        vars,
      })
    }
  }
  return envs
}

export function mapExport(root: RawResource): ImportResult {
  const rawResources = root.resources
  if (
    !Array.isArray(rawResources) ||
    rawResources.some((item) => !asRecord(item))
  ) {
    throw new Error(
      "converters.insomnia.import: resources must be an array of objects",
    )
  }
  const resources = rawResources as RawResource[]
  const workspaces = resources.filter(
    (resource) => resource._type === "workspace",
  )
  if (workspaces.length !== 1) {
    throw new Error(
      "converters.insomnia.import: expected exactly one workspace; export a single project instead",
    )
  }
  const workspace = workspaces[0]!
  const workspaceId = stringValue(workspace._id)
  if (!workspaceId) {
    throw new Error("converters.insomnia.import: workspace is missing _id")
  }

  const children = new Map<string, RawResource[]>()
  for (const resource of resources) {
    const parentId = stringValue(resource.parentId)
    if (!parentId) continue
    const items = children.get(parentId) ?? []
    items.push(resource)
    children.set(parentId, items)
  }
  for (const items of children.values()) {
    items.sort((a, b) => {
      const aKey = metaSortKey(a.metaSortKey)
      const bKey = metaSortKey(b.metaSortKey)
      if (aKey === undefined) return bKey === undefined ? 0 : 1
      if (bKey === undefined) return -1
      return aKey - bKey
    })
  }

  const usedIds = new Set<string>()
  function mapItems(
    parentId: string,
    parentPath: string,
    ancestorIds = new Set<string>(),
  ): CollectionItem[] {
    const items: CollectionItem[] = []
    let index = 0
    for (const resource of children.get(parentId) ?? []) {
      index++
      if (resource._type === "request_group" || resource._type === "folder") {
        const resourceId = stringValue(resource._id)
        if (resourceId && ancestorIds.has(resourceId)) continue
        const folderId = uniqueId(
          slugify(stringValue(resource.name)) || `folder-${index}`,
          usedIds,
        )
        usedIds.add(folderId)
        const path = parentPath ? `${parentPath}/${folderId}` : folderId
        const childAncestorIds = new Set(ancestorIds)
        if (resourceId) childAncestorIds.add(resourceId)
        items.push({
          type: "folder",
          data: {
            id: folderId,
            name: stringValue(resource.name) || folderId,
            path,
            children: mapItems(resourceId, path, childAncestorIds),
          },
        })
      } else if (resource._type === "request") {
        const baseId = slugify(
          `${stringValue(resource.method) || "GET"}-${stringValue(resource.name)}`,
        )
        const requestId = uniqueId(
          parentPath
            ? `${parentPath}/${baseId || `request-${index}`}`
            : baseId || `request-${index}`,
          usedIds,
        )
        const request = mapRequest(resource, requestId)
        if (!request) continue
        usedIds.add(requestId)
        items.push({ type: "request", data: request })
      }
    }
    return items
  }

  const name = stringValue(workspace.name) || "insomnia-import"
  return {
    collection: {
      id: slugify(name) || "insomnia-import",
      name,
      items: mapItems(workspaceId, ""),
    },
    environments: mapEnvironments(resources, workspaceId),
  }
}
