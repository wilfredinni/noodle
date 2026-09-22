import type { ResponseExecutionResults } from "./executionResults"
import type { ScriptExecutionError } from "./preRequestScript"
import type { RunScope } from "./runScope"
import type { Method, Response } from "./schema"

export type ScriptRequestSummary = {
  kind: "saved" | "http"
  requestId?: string
  depth: number
  method: Method
  url: string
  status?: number
  durationMs: number
  success: boolean
  failureCategories: string[]
  error?: ScriptExecutionError
}

export function formatScriptRequestSummary(
  request: ScriptRequestSummary,
): string {
  return `${"  ".repeat(Math.max(0, request.depth - 1))}${request.success ? "PASS" : "FAIL"} ${request.method} ${request.requestId ?? request.url}${request.status !== undefined ? ` (${request.status})` : ""}, ${request.durationMs}ms${request.failureCategories.length ? `, ${request.failureCategories.join(", ")}` : ""}`
}

export type ScriptRequestResult = {
  response?: Response
  execution?: ResponseExecutionResults
  failureCategories: string[]
  error?: ScriptExecutionError
}

export type ScriptRequestOptions = {
  diagnostics?: { consoleBytes: number; testBytes: number }
  sourceBytes?: number
  signal?: AbortSignal
  deadline?: number
  requests?: ScriptRequestSummary[]
  execute?: (
    kind: "saved" | "http",
    input: unknown,
    scope: RunScope,
    signal: AbortSignal,
    deadline: number,
  ) => Promise<ScriptRequestResult>
}
