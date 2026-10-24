import type { CollectionItem, Request } from "./schema"
import type { CollectionRunResult, RequestRunDetail } from "./app/services"
import type { ResponseResultDeclarations } from "./executionResults"
import {
  INLINE_BODY_LIMIT,
  boundedDiagnosticText,
  boundedExecutionResults,
  byteSize,
} from "./executionBounds"

export type RunnerDisplayItem =
  | { type: "request"; data: Pick<Request, "id" | "name" | "method"> }
  | {
      type: "folder"
      data: { name: string; path: string; children: RunnerDisplayItem[] }
    }

export interface RunnerConfiguration {
  scope: string | null
  selectedIds: string[]
  environmentName: string | null
  includeTags: string[]
  excludeTags: string[]
  failFast: boolean
  delayMs: number
  dataPath: string
  noProxy: boolean
  insecure: boolean
}

export interface RunnerSnapshot {
  configuration: RunnerConfiguration
  items: RunnerDisplayItem[]
  result: CollectionRunResult
  details: Map<string, RunnerDetail>
  selectedKey?: string
}

export interface RunnerDetail extends RequestRunDetail {
  request?: ResponseResultDeclarations
}

export function runnerRequestDeclarations(
  request: Request,
): ResponseResultDeclarations | undefined {
  const declarations: ResponseResultDeclarations = {
    scripts: request.scripts ? {} : undefined,
    tests: request.tests !== undefined ? "" : undefined,
    assertions: request.assertions?.map(
      ({ expression, operator, enabled }) => ({
        expression,
        operator,
        enabled,
      }),
    ),
    captures: request.captures
      ? Object.fromEntries(
          Object.entries(request.captures).map(([name, { value, enabled }]) => [
            name,
            { value, enabled },
          ]),
        )
      : undefined,
  }
  return Object.values(declarations).some((value) => value !== undefined)
    ? declarations
    : undefined
}

export function runnerDisplayItems(
  items: CollectionItem[],
): RunnerDisplayItem[] {
  return items.map((item) =>
    item.type === "request"
      ? {
          type: "request",
          data: {
            id: item.data.id,
            name: item.data.name,
            method: item.data.method,
          },
        }
      : {
          type: "folder",
          data: {
            path: item.data.path,
            name: item.data.name,
            children: runnerDisplayItems(item.data.children),
          },
        },
  )
}

function bodyPreview(body: string | undefined) {
  if (body === undefined) return {}
  const bytes = new TextEncoder().encode(body)
  return bytes.length <= INLINE_BODY_LIMIT
    ? { body }
    : {
        body: new TextDecoder().decode(bytes.subarray(0, INLINE_BODY_LIMIT), {
          stream: true,
        }),
        bodyTruncated: true,
      }
}

// Inputs have already crossed the lifecycle's redaction boundary.
export function retainRunnerSnapshot(snapshot: RunnerSnapshot): RunnerSnapshot {
  let remainingBytes = 5 * 1024 * 1024
  const retain = <T>(value: T): T | undefined => {
    if (remainingBytes === 0) return undefined
    const size = byteSize(JSON.stringify(value))
    if (size > remainingBytes) {
      remainingBytes = 0
      return undefined
    }
    remainingBytes -= size
    return value
  }
  const result: CollectionRunResult = {
    ...snapshot.result,
    results: snapshot.result.results.map((result) => {
      const bounded = {
        ...result,
        ...boundedExecutionResults(result),
        ...(result.error ? { error: boundedDiagnosticText(result.error) } : {}),
        warnings: result.warnings?.map(boundedDiagnosticText),
        // The detail entry owns the sole retained body preview.
        response: result.response
          ? { ...result.response, body: undefined }
          : undefined,
      }
      return (
        retain(bounded) ?? {
          ...bounded,
          scripts: undefined,
          tests: undefined,
          assertions: undefined,
          captures: undefined,
          error: undefined,
          warnings: undefined,
          response: bounded.response
            ? { ...bounded.response, headers: {}, cookies: undefined }
            : undefined,
        }
      )
    }),
  }
  const details = new Map(
    [...snapshot.details].map(([key, detail]) => {
      const entry = detail.entry
      return [
        key,
        retain({
          ...detail,
          entry: {
            ...entry,
            ...boundedExecutionResults(entry),
            request: { ...entry.request, ...bodyPreview(entry.request.body) },
            response: entry.response
              ? { ...entry.response, ...bodyPreview(entry.response.body) }
              : undefined,
            network: entry.network?.map((event) => ({
              ...event,
              message: boundedDiagnosticText(event.message),
            })),
            error: entry.error
              ? { message: boundedDiagnosticText(entry.error.message) }
              : undefined,
          },
        }) ?? {
          requestId: detail.requestId,
          iteration: detail.iteration,
          entry: {
            timestamp: entry.timestamp,
            cancelled: entry.cancelled,
            envName: entry.envName,
            request: {
              id: entry.request.id,
              name: entry.request.name,
              method: entry.request.method,
              url: entry.request.url,
              headers: {},
              params: [],
              bodyTruncated:
                entry.request.body !== undefined || entry.request.bodyTruncated,
            },
            response: entry.response
              ? {
                  status: entry.response.status,
                  statusText: entry.response.statusText,
                  timeMs: entry.response.timeMs,
                  size: entry.response.size,
                  bodyKind: entry.response.bodyKind,
                  contentType: entry.response.contentType,
                  filename: entry.response.filename,
                  headers: {},
                  bodyTruncated:
                    entry.response.body !== undefined ||
                    entry.response.bodyTruncated,
                }
              : undefined,
          },
        },
      ] as const
    }),
  )
  return structuredClone({ ...snapshot, result, details })
}
