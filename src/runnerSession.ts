import type { CollectionItem, Request } from "./schema"
import type { CollectionRunResult, RequestRunDetail } from "./app/services"
import {
  INLINE_BODY_LIMIT,
  boundedDiagnosticText,
  boundedExecutionResults,
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
  details: Map<string, RequestRunDetail>
  selectedKey?: string
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
  const result: CollectionRunResult = {
    ...snapshot.result,
    results: snapshot.result.results.map((result) => ({
      ...result,
      ...boundedExecutionResults(result),
      ...(result.error ? { error: boundedDiagnosticText(result.error) } : {}),
      warnings: result.warnings?.map(boundedDiagnosticText),
      // The detail entry owns the sole retained body preview.
      response: result.response
        ? { ...result.response, body: undefined }
        : undefined,
    })),
  }
  const details = new Map(
    [...snapshot.details].map(([key, detail]) => {
      const entry = detail.entry
      return [
        key,
        {
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
        },
      ] as const
    }),
  )
  return structuredClone({ ...snapshot, result, details })
}
