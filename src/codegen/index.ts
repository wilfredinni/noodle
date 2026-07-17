import {
  toGoWarn,
  toHttpieWarn,
  toJavaScriptWarn,
  toPythonWarn,
  toWgetWarn,
  type Warnings,
} from "curlconverter"
import type { Collection, KvEntry, Request } from "../schema"
import { mergeFolderOverrides } from "../requests/mergeFolderOverrides"

export const CODE_LANGUAGES = [
  "curl",
  "httpie",
  "wget",
  "javascript",
  "python",
  "go",
] as const

export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export interface GeneratedCode {
  language: CodeLanguage
  code: string
  warnings: string[]
  curlArgs: string[]
}

export function isCodeLanguage(value: string): value is CodeLanguage {
  return (CODE_LANGUAGES as readonly string[]).includes(value)
}

export function generateCode(
  request: Request,
  language: CodeLanguage,
  collection?: Collection,
): GeneratedCode {
  const effective =
    collection === undefined
      ? request
      : mergeFolderOverrides(request, collection, request.id)
  const curlArgs = toCurlArgs(effective)

  if (language === "curl") {
    return {
      language,
      code: formatCurl(curlArgs),
      warnings: [],
      curlArgs,
    }
  }

  try {
    const [code, warnings] = converterFor(language)(curlArgs)
    return { language, code, warnings: normalizeWarnings(warnings), curlArgs }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`codegen.generateCode: ${message}`, { cause: e })
  }
}

export function toCurlArgs(request: Request): string[] {
  const url = buildEffectiveUrl(request)

  const headers = enabledHeaders(request.headers)
  const bodyType = request.bodyType ?? "json"
  if (bodyType === "json" && request.body !== undefined) {
    setHeader(headers, "Content-Type", "application/json")
  } else if (bodyType === "binary" && request.filePath) {
    setHeader(headers, "Content-Type", "application/octet-stream")
  }

  const authHeader = requestAuthHeader(request)
  if (authHeader) setHeader(headers, authHeader.name, authHeader.value)

  const args = ["curl", "--request", request.method]
  if (request.followRedirects ?? true) args.push("--location")
  else args.push("--no-location")
  if (request.maxRedirects !== undefined)
    args.push("--max-redirs", String(request.maxRedirects))
  if (request.timeout > 0)
    args.push("--max-time", String(request.timeout / 1000))
  for (const [name, value] of headers)
    args.push("--header", `${name}: ${value}`)

  if (bodyType === "json" && request.body !== undefined) {
    args.push("--data-raw", request.body)
  } else if (bodyType === "urlencoded") {
    for (const entry of request.formData ?? []) {
      if (entry.enabled)
        args.push("--data-urlencode", `${entry.name}=${entry.value}`)
    }
  } else if (bodyType === "multipart") {
    for (const entry of request.formData ?? []) {
      if (!entry.enabled) continue
      args.push(
        "--form",
        entry.type === "file"
          ? `${entry.name}=@${entry.value}`
          : `${entry.name}=${entry.value}`,
      )
    }
  } else if (bodyType === "binary" && request.filePath) {
    args.push("--data-binary", `@${request.filePath}`)
  }

  args.push(url)
  return args
}

function buildEffectiveUrl(request: Request): string {
  const params = request.params.filter((entry) => entry.enabled)
  const apiKey =
    request.auth?.type === "api_key" && request.auth.placement === "query"
      ? request.auth
      : undefined

  try {
    const url = new URL(request.url)
    const paramKeys = new Set(params.map((entry) => entry.name))
    for (const key of paramKeys) url.searchParams.delete(key)
    for (const param of params) url.searchParams.append(param.name, param.value)
    if (apiKey) url.searchParams.append(apiKey.key, apiKey.value)
    return url.toString()
  } catch {
    const hashIndex = request.url.indexOf("#")
    const fragment = hashIndex === -1 ? "" : request.url.slice(hashIndex)
    const withoutFragment =
      hashIndex === -1 ? request.url : request.url.slice(0, hashIndex)
    const questionIndex = withoutFragment.indexOf("?")
    const base =
      questionIndex === -1
        ? withoutFragment
        : withoutFragment.slice(0, questionIndex)
    const query = new URLSearchParams(
      questionIndex === -1 ? "" : withoutFragment.slice(questionIndex + 1),
    )
    const paramKeys = new Set(params.map((entry) => entry.name))
    for (const key of paramKeys) query.delete(key)
    for (const param of params) query.append(param.name, param.value)
    if (apiKey) query.append(apiKey.key, apiKey.value)
    const serialized = query.toString()
    return `${base}${serialized ? `?${serialized}` : ""}${fragment}`
  }
}

function converterFor(
  language: Exclude<CodeLanguage, "curl">,
): (args: string[]) => [string, Warnings] {
  switch (language) {
    case "httpie":
      return toHttpieWarn
    case "wget":
      return toWgetWarn
    case "javascript":
      return toJavaScriptWarn
    case "python":
      return toPythonWarn
    case "go":
      return toGoWarn
  }
}

function enabledHeaders(headers: Record<string, KvEntry>): [string, string][] {
  return Object.entries(headers)
    .filter(([, entry]) => entry.enabled)
    .map(([name, entry]) => [name, entry.value])
}

function setHeader(
  headers: [string, string][],
  name: string,
  value: string,
): void {
  const index = headers.findIndex(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )
  if (index === -1) headers.push([name, value])
  else headers[index] = [name, value]
}

function requestAuthHeader(
  request: Request,
): { name: string; value: string } | null {
  const auth = request.auth
  if (!auth || auth.type === "none" || auth.type === "inherit") return null
  if (auth.type === "bearer")
    return { name: "Authorization", value: `Bearer ${auth.token}` }
  if (auth.type === "basic") {
    return {
      name: "Authorization",
      value: `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString("base64")}`,
    }
  }
  if (auth.placement === "header") return { name: auth.key, value: auth.value }
  return null
}

function normalizeWarnings(warnings: Warnings): string[] {
  return warnings
    .filter(([kind]) => kind !== "location" && kind !== "max-redirs")
    .map(([kind, message]) => `${kind}: ${message}`)
}

function formatCurl(args: string[]): string {
  const flagsWithValue = new Set([
    "--request",
    "--max-redirs",
    "--max-time",
    "--header",
    "--data-raw",
    "--data-urlencode",
    "--form",
    "--data-binary",
  ])
  const lines: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (flagsWithValue.has(arg) && args[i + 1] !== undefined) {
      lines.push(`${arg} ${shellQuote(args[i + 1]!)}`)
      i++
    } else {
      lines.push(shellQuote(arg))
    }
  }
  return lines.join(" \\\n  ")
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}
