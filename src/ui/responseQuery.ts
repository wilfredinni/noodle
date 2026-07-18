import jsonpath from "jsonpath"

export type ResponseQueryResult =
  | { kind: "success"; body: string; matchCount: number }
  | { kind: "invalid-json"; message: string }
  | { kind: "invalid-expression"; message: string }

export interface ResponseQueryController {
  canOpen: () => boolean
  open: () => boolean
}

export function queryResponseBody(
  body: string,
  expression: string,
): ResponseQueryResult {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return {
      kind: "invalid-json",
      message: "Response body is not valid JSON",
    }
  }

  try {
    const matches = jsonpath.query(value, expression)
    return {
      kind: "success",
      body: JSON.stringify(matches, null, 2),
      matchCount: matches.length,
    }
  } catch (error) {
    return {
      kind: "invalid-expression",
      message: `Invalid JSONPath: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
