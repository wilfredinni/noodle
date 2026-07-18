import type {
  Auth,
  FormEntry,
  KvEntry,
  Method,
  ParamEntry,
  Request,
} from "../../schema"

export type ImportedCurlRequest = Omit<Request, "id" | "name">

interface DataPart {
  value: string
  urlencoded: boolean
}

const METHODS = new Set<Method>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
])

const IGNORED_FLAGS = new Set([
  "-s",
  "--silent",
  "-S",
  "--show-error",
  "-v",
  "--verbose",
  "-i",
  "--include",
])

export function parseCurl(command: string): ImportedCurlRequest {
  const tokens = tokenize(command)
  if (tokens.length === 0 || !["curl", "curl.exe"].includes(tokens[0]!)) {
    throw new Error("cURL command must start with curl")
  }

  let url = ""
  let method: Method | undefined
  let hasBody = false
  let useGet = false
  let uploadFile: string | undefined
  let followRedirects = false
  let maxRedirects = 5
  let timeout = 0
  let auth: Auth = { type: "none" }
  const headers: Record<string, KvEntry> = {}
  const params: ParamEntry[] = []
  const data: DataPart[] = []
  const formData: FormEntry[] = []

  const takeValue = (flag: string, index: number): string => {
    const value = tokens[index + 1]
    if (value === undefined) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === "--") {
      const next = tokens[i + 1]
      if (!next || i + 2 !== tokens.length) {
        throw new Error("cURL command must contain exactly one URL")
      }
      url = next
      break
    }
    if (IGNORED_FLAGS.has(token)) continue
    if (token === "-L" || token === "--location") {
      followRedirects = true
      maxRedirects = 50
      continue
    }
    if (token === "--no-location") {
      followRedirects = false
      continue
    }
    if (token === "-G" || token === "--get") {
      useGet = true
      continue
    }
    if (token === "-I" || token === "--head") {
      method = "HEAD"
      continue
    }

    const valueFlags: Record<string, (value: string) => void> = {
      "-X": (value) => {
        const nextMethod = value.toUpperCase() as Method
        if (!METHODS.has(nextMethod)) {
          throw new Error(`unsupported HTTP method: ${value}`)
        }
        method = nextMethod
      },
      "--request": (value) => {
        const nextMethod = value.toUpperCase() as Method
        if (!METHODS.has(nextMethod)) {
          throw new Error(`unsupported HTTP method: ${value}`)
        }
        method = nextMethod
      },
      "--url": (value) => {
        url = value
      },
      "-H": (value) => addHeader(headers, value),
      "--header": (value) => addHeader(headers, value),
      "-b": (value) => addHeader(headers, `Cookie: ${value}`),
      "--cookie": (value) => addHeader(headers, `Cookie: ${value}`),
      "-u": (value) => {
        auth = basicAuth(value)
      },
      "--user": (value) => {
        auth = basicAuth(value)
      },
      "--oauth2-bearer": (value) => {
        auth = { type: "bearer", token: value }
      },
      "-d": (value) => {
        data.push({ value, urlencoded: false })
        hasBody = true
      },
      "--data": (value) => {
        data.push({ value, urlencoded: false })
        hasBody = true
      },
      "--data-raw": (value) => {
        data.push({ value, urlencoded: false })
        hasBody = true
      },
      "--data-ascii": (value) => {
        data.push({ value, urlencoded: false })
        hasBody = true
      },
      "--data-urlencode": (value) => {
        data.push({ value, urlencoded: true })
        hasBody = true
      },
      "--data-binary": (value) => {
        if (!value.startsWith("@")) {
          throw new Error(
            "--data-binary is supported only with a file path (@file)",
          )
        }
        uploadFile = value.slice(1)
        hasBody = true
      },
      "-F": (value) => {
        formData.push(parseFormPart(value))
        hasBody = true
      },
      "--form": (value) => {
        formData.push(parseFormPart(value))
        hasBody = true
      },
      "-T": (value) => {
        uploadFile = value
        hasBody = true
      },
      "--upload-file": (value) => {
        uploadFile = value
        hasBody = true
      },
      "--max-redirs": (value) => {
        const parsed = Number.parseInt(value, 10)
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error("--max-redirs must be a non-negative integer")
        }
        maxRedirects = parsed
      },
      "--max-time": (value) => {
        const seconds = Number(value)
        if (!Number.isFinite(seconds) || seconds < 0) {
          throw new Error("--max-time must be a non-negative number")
        }
        timeout = Math.round(seconds * 1000)
      },
    }
    const handler = valueFlags[token]
    if (handler) {
      handler(takeValue(token, i))
      i++
      continue
    }
    if (token.startsWith("-")) {
      throw new Error(`unsupported cURL option: ${token}`)
    }
    if (url) throw new Error("cURL command must contain exactly one URL")
    url = token
  }

  if (!url) throw new Error("cURL command must include a URL")
  const detectedAuth = authFromAuthorizationHeader(headers)
  if (detectedAuth) auth = detectedAuth

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch (e) {
    throw new Error(`invalid cURL URL: ${url}`, { cause: e })
  }

  if (parsedUrl.search) {
    for (const [name, value] of parsedUrl.searchParams) {
      params.push({ name, value, enabled: true })
    }
    parsedUrl.search = ""
    url = parsedUrl.toString()
  }

  if (useGet) {
    for (const part of data) params.push(...toParams(part.value))
    data.length = 0
    hasBody = formData.length > 0 || uploadFile !== undefined
  }

  const request: ImportedCurlRequest = {
    method: method ?? (uploadFile ? "PUT" : hasBody ? "POST" : "GET"),
    url,
    timeout,
    followRedirects,
    maxRedirects,
    headers,
    params,
    auth,
    bodyType: "none",
    body: "",
  }

  if (formData.length > 0) {
    request.bodyType = "multipart"
    request.formData = formData
  } else if (uploadFile) {
    request.bodyType = "binary"
    request.filePath = uploadFile
  } else if (data.length > 0) {
    applyDataBody(request, data, headers)
  }
  return request
}

function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaping = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!
    if (escaping) {
      if (char !== "\n") current += char
      escaping = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
    } else if (char === ";" || char === "|" || char === "&" || char === "`") {
      throw new Error("shell operators are not supported in cURL imports")
    } else {
      current += char
    }
  }
  if (escaping || quote)
    throw new Error("unterminated escape or quote in cURL command")
  if (current) tokens.push(current)
  return tokens
}

function addHeader(headers: Record<string, KvEntry>, value: string): void {
  const separator = value.indexOf(":")
  if (separator <= 0) throw new Error(`invalid header: ${value}`)
  const name = value.slice(0, separator).trim()
  if (!name) throw new Error(`invalid header: ${value}`)
  headers[name] = { value: value.slice(separator + 1).trim(), enabled: true }
}

function basicAuth(value: string): Auth {
  const separator = value.indexOf(":")
  return {
    type: "basic",
    user: separator === -1 ? value : value.slice(0, separator),
    pass: separator === -1 ? "" : value.slice(separator + 1),
  }
}

function authFromAuthorizationHeader(
  headers: Record<string, KvEntry>,
): Auth | null {
  const authorization = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "authorization",
  )
  if (!authorization) return null

  const [name, entry] = authorization
  const bearer = /^Bearer\s+(.+)$/i.exec(entry.value)
  if (bearer?.[1].trim()) {
    delete headers[name]
    return { type: "bearer", token: bearer[1].trim() }
  }

  const basic = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(entry.value)
  if (!basic?.[1]) return null
  const decoded = Buffer.from(basic[1], "base64").toString("utf8")
  const separator = decoded.indexOf(":")
  if (separator < 0) return null
  delete headers[name]
  return {
    type: "basic",
    user: decoded.slice(0, separator),
    pass: decoded.slice(separator + 1),
  }
}

function parseFormPart(value: string): FormEntry {
  const separator = value.indexOf("=")
  if (separator <= 0) throw new Error(`invalid form field: ${value}`)
  const name = value.slice(0, separator)
  const rawValue = value.slice(separator + 1)
  if (rawValue.startsWith("<")) {
    throw new Error("form fields loaded from files (<file) are not supported")
  }
  if (rawValue.startsWith("@")) {
    return {
      name,
      value: rawValue.slice(1).split(";")[0]!,
      enabled: true,
      type: "file",
    }
  }
  return { name, value: rawValue, enabled: true, type: "text" }
}

function toParams(value: string): ParamEntry[] {
  return [...new URLSearchParams(value)].map(([name, paramValue]) => ({
    name,
    value: paramValue,
    enabled: true,
  }))
}

function applyDataBody(
  request: ImportedCurlRequest,
  data: DataPart[],
  headers: Record<string, KvEntry>,
): void {
  const value = data.map((part) => part.value).join("&")
  const contentType = Object.entries(headers)
    .find(([name]) => name.toLowerCase() === "content-type")?.[1]
    .value.toLowerCase()
  if (
    data.some((part) => part.urlencoded) ||
    contentType?.includes("application/x-www-form-urlencoded") ||
    value.includes("=")
  ) {
    request.bodyType = "urlencoded"
    request.formData = toParams(value).map((entry) => ({
      ...entry,
      type: "text",
    }))
    return
  }
  if (contentType?.includes("application/json") || /^[{[]/.test(value.trim())) {
    try {
      JSON.parse(value)
    } catch (e) {
      throw new Error("JSON request body is invalid", { cause: e })
    }
    request.bodyType = "json"
    request.body = value
    return
  }
  throw new Error(
    "raw request data is unsupported; use JSON, URL-encoded data, multipart form data, or a file",
  )
}
