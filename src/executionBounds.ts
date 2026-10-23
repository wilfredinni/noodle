import type {
  ScriptExecutionError,
  ScriptExecutionResult,
  ScriptLog,
} from "./preRequestScript"
import type { JsonValue } from "./schema"
import type { ResponseExecutionResults } from "./executionResults"

export const INLINE_BODY_LIMIT = 10_000

export function byteSize(body: string): number {
  return new TextEncoder().encode(body).length
}

export function boundedAssertionValue(value: JsonValue): JsonValue {
  return byteSize(JSON.stringify(value)) > INLINE_BODY_LIMIT
    ? "[TRUNCATED]"
    : value
}

export function boundedDiagnosticText(value: string): string {
  return byteSize(value) > INLINE_BODY_LIMIT ? "[TRUNCATED]" : value
}

function boundedScriptError(error: ScriptExecutionError | undefined) {
  return error
    ? {
        ...error,
        ...(error.source
          ? {
              source: {
                ...error.source,
                path: boundedDiagnosticText(error.source.path),
                ...(error.source.scopeId !== undefined
                  ? { scopeId: boundedDiagnosticText(error.source.scopeId) }
                  : {}),
                ...(error.source.sourcePath !== undefined
                  ? {
                      sourcePath: boundedDiagnosticText(
                        error.source.sourcePath,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
        name: boundedDiagnosticText(error.name),
        message: boundedDiagnosticText(error.message),
      }
    : undefined
}

function boundedScriptLogs(source: ScriptLog[]): ScriptLog[] {
  const logs: ScriptLog[] = []
  let logBytes = 0
  for (const log of source) {
    logBytes += byteSize(JSON.stringify(log))
    if (logBytes > INLINE_BODY_LIMIT) {
      logs.push({ level: "warn", message: "[TRUNCATED]" })
      break
    }
    logs.push({
      ...log,
      ...(log.source ? { source: { ...log.source } } : {}),
    })
  }
  return logs
}

function boundedScriptResult(
  result: ScriptExecutionResult,
): ScriptExecutionResult {
  return {
    ...result,
    ...(result.source
      ? {
          source: {
            ...result.source,
            path: boundedDiagnosticText(result.source.path),
            ...(result.source.scopeId !== undefined
              ? { scopeId: boundedDiagnosticText(result.source.scopeId) }
              : {}),
            ...(result.source.sourcePath !== undefined
              ? { sourcePath: boundedDiagnosticText(result.source.sourcePath) }
              : {}),
          },
        }
      : {}),
    logs: boundedScriptLogs(result.logs),
    error: boundedScriptError(result.error),
    ...(result.requests
      ? {
          requests: result.requests.slice(0, 11).map((request) => ({
            kind: request.kind,
            ...(request.requestId !== undefined
              ? { requestId: boundedDiagnosticText(request.requestId) }
              : {}),
            depth: request.depth,
            method: request.method,
            url: boundedDiagnosticText(request.url),
            ...(request.status !== undefined ? { status: request.status } : {}),
            durationMs: request.durationMs,
            success: request.success,
            failureCategories: request.failureCategories,
            error: boundedScriptError(request.error),
          })),
        }
      : {}),
    ...(result.persistence
      ? {
          persistence: result.persistence.map((outcome) => ({
            ...outcome,
            error: boundedScriptError(outcome.error),
          })),
        }
      : {}),
  }
}

export function boundedExecutionResults(
  source: ResponseExecutionResults,
): ResponseExecutionResults {
  return {
    scripts: source.scripts
      ? {
          evaluated: source.scripts.evaluated,
          results: source.scripts.results.map(boundedScriptResult),
        }
      : undefined,
    ...(source.tests
      ? {
          tests: {
            ...source.tests,
            results: source.tests.results.map((result) => ({
              ...result,
              ...(result.source
                ? {
                    source: {
                      ...result.source,
                      path: boundedDiagnosticText(result.source.path),
                      ...(result.source.scopeId !== undefined
                        ? {
                            scopeId: boundedDiagnosticText(
                              result.source.scopeId,
                            ),
                          }
                        : {}),
                      ...(result.source.sourcePath !== undefined
                        ? {
                            sourcePath: boundedDiagnosticText(
                              result.source.sourcePath,
                            ),
                          }
                        : {}),
                    },
                  }
                : {}),
              name: boundedDiagnosticText(result.name),
              message: boundedDiagnosticText(result.message),
            })),
            logs: boundedScriptLogs(source.tests.logs),
            ...(source.tests.invocations
              ? {
                  invocations:
                    source.tests.invocations.map(boundedScriptResult),
                }
              : {}),
            ...(source.tests.errors
              ? {
                  errors: source.tests.errors.map((error) =>
                    boundedScriptError(error)!,
                  ),
                }
              : {}),
            ...(source.tests.error
              ? { error: boundedScriptError(source.tests.error) }
              : {}),
          },
        }
      : {}),
    assertions: source.assertions
      ? {
          ...source.assertions,
          results: source.assertions.results.map((result) => ({
            ...result,
            ...(Object.hasOwn(result, "expected")
              ? { expected: boundedAssertionValue(result.expected!) }
              : {}),
            ...(Object.hasOwn(result, "actual")
              ? { actual: boundedAssertionValue(result.actual!) }
              : {}),
          })),
        }
      : undefined,
    ...(source.captures
      ? {
          captures: {
            ...source.captures,
            results: source.captures.results.map((result) =>
              result.success
                ? { ...result, value: boundedAssertionValue(result.value) }
                : { ...result, message: boundedDiagnosticText(result.message) },
            ),
          },
        }
      : {}),
  }
}
