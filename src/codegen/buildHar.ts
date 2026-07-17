import type { Environment, KvEntry, Request } from "../schema"
import { hashVars } from "./variableHash"

const VAR_RE = /\$(\w+)/g

export interface HarQueryParam {
  name: string
  value: string
}

export interface HarHeader {
  name: string
  value: string
}

export interface HarPostData {
  mimeType: string
  text?: string
  params?: { name: string; value: string; fileName?: string }[]
}

export interface HarRequest {
  method: string
  url: string
  httpVersion: string
  cookies: { name: string; value: string }[]
  headers: HarHeader[]
  queryString: HarQueryParam[]
  headersSize: number
  bodySize: number
  postData: HarPostData | undefined
}

export interface BuildHarOutput {
  har: HarRequest
  unhash: (input: string) => string
}

export function buildHar(
  request: Request,
  env?: Environment,
  interpolate?: boolean,
): BuildHarOutput {
  const shouldInterpolate = interpolate ?? false

  let working = request

  if (shouldInterpolate && env) {
    working = interpolateRequest(request, env)
  }

  const { hashed: hashedUrl, restore: unhash } = hashVars(working.url)
  working = { ...working, url: hashedUrl }

  const headers = finalizeHeaders(working)

  const queryString = buildQueryString(working)

  const harUrl = stripQueryStringFromUrl(working.url)

  const har: HarRequest = {
    method: working.method,
    url: harUrl,
    httpVersion: "HTTP/1.1",
    cookies: [],
    headers,
    queryString,
    postData: buildPostData(working),
    headersSize: 0,
    bodySize: 0,
  }

  return { har, unhash }
}

function interpolateRequest(req: Request, env: Environment): Request {
  const resolveVar = (s: string): string => {
    return s.replace(VAR_RE, (_, name) => {
      if (Object.hasOwn(env.vars, name)) return env.vars[name]
      return `$${name}`
    })
  }

  const headers: Record<string, KvEntry> = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v.enabled) {
      headers[k] = { ...v }
      continue
    }
    headers[k] = { value: resolveVar(v.value), enabled: true }
  }

  const params = req.params.map((entry, _i) => {
    if (!entry.enabled) return { ...entry }
    return {
      name: resolveVar(entry.name),
      value: resolveVar(entry.value),
      enabled: entry.enabled,
    }
  })

  const auth = substituteAuth(req.auth, resolveVar)

  const formData =
    req.formData?.map((entry) => {
      if (!entry.enabled) return { ...entry }
      return {
        name: resolveVar(entry.name),
        value: resolveVar(entry.value),
        enabled: entry.enabled,
        type: entry.type,
      }
    }) ?? req.formData

  const filePath =
    req.filePath !== undefined ? resolveVar(req.filePath) : req.filePath

  return {
    ...req,
    headers,
    params,
    auth,
    formData,
    filePath,
    url: resolveVar(req.url),
    body: req.body !== undefined ? resolveVar(req.body) : req.body,
  }
}

function substituteAuth(
  auth: Request["auth"],
  resolveVar: (s: string) => string,
): Request["auth"] {
  if (!auth || auth.type === "none" || auth.type === "inherit") return auth
  if (auth.type === "bearer")
    return { type: "bearer", token: resolveVar(auth.token) }
  if (auth.type === "basic")
    return {
      type: "basic",
      user: resolveVar(auth.user),
      pass: resolveVar(auth.pass),
    }
  if (auth.type === "api_key")
    return {
      type: "api_key",
      key: resolveVar(auth.key),
      value: resolveVar(auth.value),
      placement: auth.placement,
    }
  return auth
}

function enabledHeaders(
  headers: Record<string, KvEntry>,
): { name: string; value: string }[] {
  return Object.entries(headers)
    .filter(([, entry]) => entry.enabled)
    .map(([name, entry]) => ({ name, value: entry.value }))
}

function finalizeHeaders(req: Request): HarHeader[] {
  const headers = enabledHeaders(req.headers)

  const bodyType = req.bodyType ?? "json"
  if (bodyType === "json" && req.body !== undefined) {
    setHeader(headers, "Content-Type", "application/json")
  } else if (bodyType === "binary" && req.filePath) {
    setHeader(headers, "Content-Type", "application/octet-stream")
  }

  const authHeader = requestAuthHeader(req)
  if (authHeader) setHeader(headers, authHeader.name, authHeader.value)

  return headers
}

function setHeader(
  headers: { name: string; value: string }[],
  name: string,
  value: string,
): void {
  const index = headers.findIndex(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )
  if (index === -1) headers.push({ name, value })
  else headers[index] = { name, value }
}

function requestAuthHeader(
  req: Request,
): { name: string; value: string } | null {
  const auth = req.auth
  if (!auth || auth.type === "none" || auth.type === "inherit") return null
  if (auth.type === "bearer")
    return { name: "Authorization", value: `Bearer ${auth.token}` }
  if (auth.type === "basic") {
    return {
      name: "Authorization",
      value: `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString("base64")}`,
    }
  }
  if (auth.type === "api_key" && auth.placement === "header")
    return { name: auth.key, value: auth.value }
  return null
}

function buildQueryString(req: Request): HarQueryParam[] {
  const query: HarQueryParam[] = []

  for (const param of req.params) {
    if (param.enabled) query.push({ name: param.name, value: param.value })
  }

  if (req.auth?.type === "api_key" && req.auth.placement === "query") {
    query.push({ name: req.auth.key, value: req.auth.value })
  }

  return query
}

function buildPostData(req: Request): HarPostData | undefined {
  const bodyType = req.bodyType ?? "json"

  switch (bodyType) {
    case "json": {
      if (req.body === undefined) return undefined
      return { mimeType: "application/json", text: req.body }
    }
    case "urlencoded": {
      const entries = (req.formData ?? []).filter((e) => e.enabled)
      if (entries.length === 0) return undefined
      const searchParams = new URLSearchParams()
      for (const entry of entries) {
        searchParams.append(entry.name, entry.value)
      }
      return {
        mimeType: "application/x-www-form-urlencoded",
        text: searchParams.toString(),
        params: entries.map((e) => ({ name: e.name, value: e.value })),
      }
    }
    case "multipart": {
      const entries = (req.formData ?? []).filter((e) => e.enabled)
      if (entries.length === 0) return undefined
      return {
        mimeType: "multipart/form-data",
        params: entries.map((e) => ({
          name: e.name,
          value: e.value,
          ...(e.type === "file" ? { fileName: e.value } : {}),
        })),
      }
    }
    case "binary": {
      if (!req.filePath) return undefined
      return {
        mimeType: "application/octet-stream",
        text: req.filePath,
      }
    }
    default:
      return undefined
  }
}

function stripQueryStringFromUrl(url: string): string {
  if (!url) return url
  const hashIdx = url.indexOf("#")
  const questionIdx = url.indexOf("?")

  if (questionIdx === -1) return url

  const before = url.slice(0, questionIdx)
  const after =
    hashIdx === -1 || hashIdx < questionIdx ? "" : url.slice(hashIdx)
  return before + after
}
