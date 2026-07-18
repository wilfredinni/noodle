import { JSONPath } from "jsonpath-plus"

export type ResponseQueryResult =
  | { kind: "success"; body: string; matchCount: number }
  | { kind: "invalid-json"; message: string }
  | { kind: "invalid-expression"; message: string }

export type ParsedResponseBody =
  | { kind: "success"; value: unknown }
  | { kind: "invalid-json"; message: string }

export interface ResponseQueryController {
  canOpen: () => boolean
  open: () => boolean
}

export function queryResponseBody(
  body: string,
  expression: string,
): ResponseQueryResult {
  const parsed = parseResponseBody(body)
  if (parsed.kind === "invalid-json") return parsed
  return queryParsedResponseBody(parsed.value, expression)
}

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

export function queryParsedResponseBody(
  value: unknown,
  expression: string,
): Exclude<ResponseQueryResult, { kind: "invalid-json" }> {
  try {
    validateQuerySyntax(expression)
    const matches = JSONPath({
      path: expression,
      json: value as never,
      wrap: true,
    })
    return {
      kind: "success",
      body: JSON.stringify(matches, null, 2),
      matchCount: Array.isArray(matches) ? matches.length : 0,
    }
  } catch (error) {
    return {
      kind: "invalid-expression",
      message: `Invalid JSONPath: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function validateQuerySyntax(expression: string): void {
  const delimiters: string[] = []
  let quote: string | null = null
  let escaped = false

  for (const char of expression) {
    if (quote !== null) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = null
      continue
    }

    if (char === "'" || char === '"' || char === String.fromCharCode(96)) {
      quote = char
    } else if (char === "[" || char === "(" || char === "{") {
      delimiters.push(char)
    } else if (char === "]" || char === ")" || char === "}") {
      const opening = delimiters.pop()
      const expected = char === "]" ? "[" : char === ")" ? "(" : "{"
      if (opening !== expected) throw new Error("unbalanced delimiters")
    }
  }

  if (quote !== null || delimiters.length > 0) {
    throw new Error("unbalanced delimiters")
  }
}
