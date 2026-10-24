import type { CollectionItem, Request } from "./schema"
import type {
  CollectionRunResult,
  RequestRunDetail,
  RequestRunResult,
} from "./app/services"
import type { ScriptPhase, ScriptSource } from "./preRequestScript"
import { scriptExecutionSucceeded } from "./preRequestScript"
import { runResultKey } from "./iterationData"
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

export interface RunnerRetention {
  resultsOmitted: boolean
  failure?: string
  phase?: ScriptPhase | "assertions" | "captures"
  source?: ScriptSource
}

export const RUNNER_RETENTION_NOTICE =
  "Some details were omitted to limit session memory."

export interface RunnerDetail extends RequestRunDetail {
  request?: ResponseResultDeclarations
  retention?: RunnerRetention
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

function shortText(value: string): string {
  const bytes = new TextEncoder().encode(value.slice(0, 512))
  return value.length <= 512 && bytes.length <= 512
    ? value
    : new TextDecoder().decode(bytes.subarray(0, 512), { stream: true }) + "…"
}

function failureSummary(result: RequestRunResult): RunnerRetention {
  const script = result.scripts?.results.find(
    (script) => !scriptExecutionSucceeded(script) || script.cancelled,
  )
  const testError = result.tests?.errors?.[0] ?? result.tests?.error
  const test = result.tests?.results.find((test) => !test.passed)
  const assertion = result.assertions?.results.find(
    (assertion) => !assertion.passed,
  )
  const capture = result.captures?.results.find((capture) => !capture.success)
  const source = script?.source ?? testError?.source ?? test?.source
  const message =
    result.error ??
    script?.error?.message ??
    script?.persistence?.find((outcome) => outcome.status === "failed")?.error
      ?.message ??
    testError?.message ??
    test?.message ??
    assertion?.message ??
    capture?.message ??
    (result.cancelled
      ? "Cancelled"
      : !result.ok
        ? result.failureCategories.join(", ")
        : undefined)
  return {
    resultsOmitted: false,
    failure: message ? shortText(message) : undefined,
    phase:
      script?.phase ??
      (testError || test
        ? "tests"
        : assertion
          ? "assertions"
          : capture
            ? "captures"
            : undefined),
    source: source
      ? {
          ...source,
          path: boundedDiagnosticText(source.path),
          scopeId:
            source.scopeId === undefined
              ? undefined
              : boundedDiagnosticText(source.scopeId),
          sourcePath:
            source.sourcePath === undefined
              ? undefined
              : boundedDiagnosticText(source.sourcePath),
        }
      : undefined,
  }
}

function compactDeclarations(request: ResponseResultDeclarations | undefined) {
  if (!request) return undefined
  // Keep small declaration sets intact, but never reserve arbitrary expressions or source.
  const declarations = {
    ...request,
    scripts: request.scripts ? {} : undefined,
    tests: request.tests !== undefined ? "" : undefined,
  }
  if (byteSize(JSON.stringify(declarations)) <= 1024) return declarations
  return {
    scripts: declarations.scripts,
    tests: declarations.tests,
    assertions: request.assertions?.some(
      (assertion) => assertion.enabled !== false,
    )
      ? [{ expression: "[omitted]", operator: "exists" as const }]
      : undefined,
    captures: Object.values(request.captures ?? {}).some(
      (capture) => capture.enabled,
    )
      ? { "[omitted]": { value: "[omitted]", enabled: true } }
      : undefined,
  }
}

// Inputs have already crossed the lifecycle's redaction boundary.
export function retainRunnerSnapshot(snapshot: RunnerSnapshot): RunnerSnapshot {
  const summaries = new Map(
    snapshot.result.results.map((result) => [
      runResultKey(result.id, result.iteration),
      failureSummary(result),
    ]),
  )
  const result: CollectionRunResult = {
    ...snapshot.result,
    warnings: [
      ...(snapshot.result.warnings ?? []).map(boundedDiagnosticText),
      RUNNER_RETENTION_NOTICE,
    ],
    results: snapshot.result.results.map((row) => ({
      ...row,
      url: shortText(row.url),
      scripts: undefined,
      tests: undefined,
      assertions: undefined,
      captures: undefined,
      error: summaries.get(runResultKey(row.id, row.iteration))?.failure,
      warnings: row.warnings?.length
        ? [shortText(row.warnings[0]!)]
        : undefined,
      response: row.response
        ? {
            ...row.response,
            body: undefined,
            headers: {},
            cookies: undefined,
            statusText: shortText(row.response.statusText),
            contentType:
              row.response.contentType && shortText(row.response.contentType),
            filename: row.response.filename && shortText(row.response.filename),
            outputFile:
              row.response.outputFile && shortText(row.response.outputFile),
          }
        : undefined,
    })),
  }
  const details = new Map<string, RunnerDetail>()
  for (const [key, detail] of snapshot.details) {
    const entry = detail.entry
    const retention = summaries.get(key) ?? { resultsOmitted: true }
    details.set(key, {
      requestId: detail.requestId,
      iteration: detail.iteration,
      request: compactDeclarations(detail.request),
      retention,
      entry: {
        timestamp: entry.timestamp,
        cancelled: entry.cancelled,
        envName: entry.envName,
        error:
          entry.error || retention.failure
            ? { message: shortText(entry.error?.message ?? retention.failure!) }
            : undefined,
        request: {
          id: entry.request.id,
          name: shortText(entry.request.name),
          method: entry.request.method,
          url: shortText(entry.request.url),
          headers: {},
          params: [],
          bodyTruncated:
            entry.request.body !== undefined || entry.request.bodyTruncated,
        },
        response: entry.response
          ? {
              status: entry.response.status,
              statusText: shortText(entry.response.statusText),
              timeMs: entry.response.timeMs,
              size: entry.response.size,
              bodyKind: entry.response.bodyKind,
              contentType:
                entry.response.contentType &&
                shortText(entry.response.contentType),
              filename:
                entry.response.filename && shortText(entry.response.filename),
              headers: {},
              bodyTruncated:
                entry.response.body !== undefined ||
                entry.response.bodyTruncated,
            }
          : undefined,
      },
    })
  }
  const size = (value: unknown) => byteSize(JSON.stringify(value))
  // Reserve all navigation/configuration metadata and failure summaries before previews.
  // shortcut: required metadata may exceed 5 MiB; page results if a hard total cap is needed.
  let remainingBytes = Math.max(
    0,
    5 * 1024 * 1024 -
      size({
        ...snapshot,
        result,
        details: [...details],
      }),
  )
  const retain = <T>(minimal: T, full: T): T => {
    const extraBytes = Math.max(0, size(full) - size(minimal))
    if (extraBytes > remainingBytes) return minimal
    remainingBytes -= extraBytes
    return full
  }
  result.results = snapshot.result.results.map((row, index) => {
    const minimal = result.results[index]!
    const full = retain(minimal, {
      ...row,
      ...boundedExecutionResults(row),
      url: boundedDiagnosticText(row.url),
      error: row.error ? boundedDiagnosticText(row.error) : undefined,
      warnings: row.warnings?.map(boundedDiagnosticText),
      // The detail entry owns the sole retained body preview.
      response: row.response ? { ...row.response, body: undefined } : undefined,
    })
    summaries.get(runResultKey(row.id, row.iteration))!.resultsOmitted =
      full === minimal
    return full
  })
  for (const [key, detail] of snapshot.details) {
    const minimal = details.get(key)!
    const entry = detail.entry
    details.set(
      key,
      retain(minimal, {
        ...detail,
        retention: minimal.retention?.resultsOmitted
          ? minimal.retention
          : undefined,
        entry: {
          ...entry,
          ...boundedExecutionResults(entry),
          request: {
            ...entry.request,
            url: boundedDiagnosticText(entry.request.url),
            ...bodyPreview(entry.request.body),
          },
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
      }),
    )
  }
  if (
    ![...details.values()].some((detail) => detail.retention) &&
    ![...summaries.values()].some((summary) => summary.resultsOmitted)
  ) {
    result.warnings = snapshot.result.warnings?.map(boundedDiagnosticText)
  }
  return structuredClone({ ...snapshot, result, details })
}
