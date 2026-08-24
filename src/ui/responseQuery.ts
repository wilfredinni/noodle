import { JSONPath } from "jsonpath-plus"
import { parseResponseBody } from "../response"

export type ResponseQueryResult =
  | { kind: "success"; body: string; matchCount: number }
  | { kind: "invalid-json"; message: string }
  | { kind: "invalid-expression"; message: string }

export interface ResponseQueryController {
  canOpen: () => boolean
  isOpen: () => boolean
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

export { parseResponseBody }

export function queryParsedResponseBody(
  value: unknown,
  expression: string,
): Exclude<ResponseQueryResult, { kind: "invalid-json" }> {
  try {
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
