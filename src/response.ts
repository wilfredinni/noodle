import type { JsonValue, Response } from "./schema"

export type ParsedResponseBody =
  | { kind: "success"; value: unknown }
  | { kind: "invalid-json"; message: string }

export type ResponsePathPart =
  | { kind: "property"; name: string }
  | { kind: "index"; index: number }

export type ResponseExpression =
  | { kind: "status" }
  | { kind: "response-time" }
  | { kind: "header"; name: string }
  | { kind: "body"; path: ResponsePathPart[] }

export type ResponseExpressionResult =
  | { kind: "value"; value: JsonValue }
  | { kind: "missing" }
  | { kind: "error"; message: string }

export type ResponseResolver = (expression: string) => ResponseExpressionResult

export interface ResponseExpressionSuggestion {
  value: string
  label: string
}

export type ResponseExpressionCompleter = (
  prefix: string,
) => ResponseExpressionSuggestion[]

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const PROPERTY_RE = /^[A-Za-z_][A-Za-z0-9_-]*/

export function parseResponseBody(body: string): ParsedResponseBody {
  try {
    return { kind: "success", value: JSON.parse(body) }
  } catch {
    return {
      kind: "invalid-json",
      message: "Response body is not valid JSON",
    }
  }
}

export function createResponseExpressionCompleter(
  response?: Pick<Response, "headers"> & { body?: string },
): ResponseExpressionCompleter {
  const staticSuggestions = [
    "status",
    "body",
    "body.",
    "headers.",
    "response.time",
  ].map((value) => ({ value, label: value }))
  const headerSuggestions = Object.keys(response?.headers ?? {}).flatMap(
    (name) => {
      const value = `headers.${name}`
      try {
        parseResponseExpression(value)
        return [{ value, label: name }]
      } catch {
        return []
      }
    },
  )
  const body = response?.body
  const parsedBody = body ? parseResponseBody(body) : undefined

  return (prefix) => {
    const suggestions = [...staticSuggestions]
    if (prefix.toLowerCase().startsWith("headers.")) {
      suggestions.push(...headerSuggestions)
    }
    if (parsedBody?.kind !== "success") {
      return matchingSuggestions(suggestions, prefix)
    }

    const indexMatch = /^(.*)\[(\d*)$/.exec(prefix)
    const propertyMatch = /^(.*)\.([A-Za-z0-9_-]*)$/.exec(prefix)
    const parentExpression = indexMatch?.[1] ?? propertyMatch?.[1]
    if (!parentExpression) return matchingSuggestions(suggestions, prefix)

    let parent: ResponseExpression
    try {
      parent = parseResponseExpression(parentExpression)
    } catch {
      return matchingSuggestions(suggestions, prefix)
    }
    if (parent.kind !== "body") {
      return matchingSuggestions(suggestions, prefix)
    }

    const value = bodyPathValue(parsedBody.value, parent.path)
    const candidates = Array.isArray(value)
      ? value.map((_, index) => ({
          value: `${parentExpression}[${index}]`,
          label: `[${index}]`,
        }))
      : value !== null && typeof value === "object"
        ? Object.keys(value).map((key) => ({
            value: `${parentExpression}.${key}`,
            label: key,
          }))
        : []

    for (const candidate of candidates) {
      try {
        parseResponseExpression(candidate.value)
        suggestions.push(candidate)
      } catch {
        // Ignore JSON keys that response expressions cannot address.
      }
    }
    return matchingSuggestions(suggestions, prefix)
  }
}

export function parseResponseExpression(
  expression: string,
): ResponseExpression {
  if (expression === "status") return { kind: "status" }
  if (expression === "response.time") return { kind: "response-time" }
  if (expression.startsWith("headers.")) {
    const name = expression.slice("headers.".length)
    if (HEADER_NAME_RE.test(name)) return { kind: "header", name }
    throw invalidExpression(expression)
  }
  if (!expression.startsWith("body")) throw invalidExpression(expression)

  const path: ResponsePathPart[] = []
  let offset = "body".length
  while (offset < expression.length) {
    if (expression[offset] === ".") {
      const match = PROPERTY_RE.exec(expression.slice(offset + 1))
      if (!match) throw invalidExpression(expression)
      path.push({ kind: "property", name: match[0] })
      offset += match[0].length + 1
      continue
    }
    if (expression[offset] === "[") {
      const end = expression.indexOf("]", offset + 1)
      if (end === -1) throw invalidExpression(expression)
      const rawIndex = expression.slice(offset + 1, end)
      if (!/^(0|[1-9]\d*)$/.test(rawIndex)) throw invalidExpression(expression)
      const index = Number(rawIndex)
      if (!Number.isSafeInteger(index)) throw invalidExpression(expression)
      path.push({ kind: "index", index })
      offset = end + 1
      continue
    }
    throw invalidExpression(expression)
  }
  return { kind: "body", path }
}

export function createResponseResolver(
  response: Pick<Response, "status" | "headers" | "body" | "timeMs">,
): ResponseResolver {
  let parsedBody: ParsedResponseBody | undefined
  const headers = new Map(
    Object.entries(response.headers).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  )

  return (expression) => {
    let parsedExpression: ResponseExpression
    try {
      parsedExpression = parseResponseExpression(expression)
    } catch (error) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      }
    }

    if (parsedExpression.kind === "status") {
      return { kind: "value", value: response.status }
    }
    if (parsedExpression.kind === "response-time") {
      return { kind: "value", value: response.timeMs }
    }
    if (parsedExpression.kind === "header") {
      const value = headers.get(parsedExpression.name.toLowerCase())
      return value === undefined
        ? { kind: "missing" }
        : { kind: "value", value }
    }

    parsedBody ??= parseResponseBody(response.body)
    if (parsedBody.kind === "invalid-json") {
      return { kind: "error", message: parsedBody.message }
    }
    let value = parsedBody.value
    for (const part of parsedExpression.path) {
      if (part.kind === "index") {
        if (!Array.isArray(value)) {
          return {
            kind: "error",
            message: `Cannot access index ${part.index} on a non-array value`,
          }
        }
        if (!Object.hasOwn(value, part.index)) return { kind: "missing" }
        value = value[part.index]
        continue
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {
          kind: "error",
          message: `Cannot access property "${part.name}" on a non-object value`,
        }
      }
      if (!Object.hasOwn(value, part.name)) return { kind: "missing" }
      value = (value as Record<string, unknown>)[part.name]
    }
    return { kind: "value", value: value as JsonValue }
  }
}

function invalidExpression(expression: string): Error {
  return new Error(
    `Invalid response expression "${expression}"; expected status, response.time, headers.<name>, or body with dot properties and array indexes`,
  )
}

function bodyPathValue(value: unknown, path: ResponsePathPart[]): unknown {
  for (const part of path) {
    if (part.kind === "index") {
      if (!Array.isArray(value) || !Object.hasOwn(value, part.index)) {
        return undefined
      }
      value = value[part.index]
      continue
    }
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.hasOwn(value, part.name)
    ) {
      return undefined
    }
    value = (value as Record<string, unknown>)[part.name]
  }
  return value
}

function matchingSuggestions(
  suggestions: ResponseExpressionSuggestion[],
  prefix: string,
): ResponseExpressionSuggestion[] {
  const normalized = prefix.toLowerCase()
  return suggestions.filter(({ value }) =>
    value.toLowerCase().startsWith(normalized),
  )
}
