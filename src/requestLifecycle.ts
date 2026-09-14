import type {
  Collection,
  Environment,
  NetworkError,
  NetworkEvent,
  Request,
  Response,
} from "./schema"
import { executor } from "./requests"
import type { TransportExecutionOptions } from "./requests/send"
import { mergeFolderOverrides } from "./requests/mergeFolderOverrides"
import { substitute, type SubstitutedRequest } from "./requests/substitute"
import { RunScope, type CaptureResult } from "./runScope"
import {
  evaluateResponseExecution,
  executionSecretValues,
  redactScriptExecutionResult,
  unevaluatedExecutionResults,
  type ResponseExecutionResults,
} from "./executionResults"
import { runPreRequestScript } from "./preRequestScript"
import {
  executionResultSecrets,
  redactKnownSecrets,
  requestSensitiveValues,
  responseSensitiveValues,
  type RedactionSecret,
} from "./secrets/redact"

export type RequestLifecycleFailureCategory =
  | "execution"
  | "script"
  | "transport"

type LifecycleBase = {
  request: Request
  prepared?: SubstitutedRequest
  execution: ResponseExecutionResults
  secretValues: RedactionSecret[]
}

export type RequestLifecycleResult =
  | (LifecycleBase & {
      status: "done"
      prepared: SubstitutedRequest
      response: Response
      rawCaptures: CaptureResult[]
    })
  | (LifecycleBase & {
      status: "error"
      error: Error
      failureCategory: RequestLifecycleFailureCategory
    })

export async function executeRequestLifecycle(options: {
  request: Request
  runScope: RunScope
  environment?: Environment | null
  collection?: Collection
  requestPath?: string
  transport?: TransportExecutionOptions
}): Promise<RequestLifecycleResult> {
  const {
    request,
    runScope,
    environment,
    collection,
    requestPath,
    transport = {},
  } = options
  const effectiveEnvironment = runScope.environment(environment ?? undefined)
  const secretValues: RedactionSecret[] = [
    ...executionSecretValues(
      [environment, effectiveEnvironment],
      transport.proxyPolicy,
      transport.tlsPolicy,
    ),
    ...runScope.secretValues(),
  ]
  let prepared: SubstitutedRequest | undefined
  let timeline = request
  let scriptResult: Awaited<ReturnType<typeof runPreRequestScript>> | undefined
  const runtimeSecrets: string[] = []

  try {
    const merged =
      collection && requestPath
        ? mergeFolderOverrides(request, collection, requestPath)
        : request
    prepared = substitute(merged, effectiveEnvironment)
    timeline = timelineRequest(merged, prepared)
    secretValues.push(...requestSensitiveValues(prepared))

    if (merged.scripts) {
      scriptResult = await runPreRequestScript(
        merged.scripts.pre,
        prepared,
        environment,
        runScope,
      )
      secretValues.push(...scriptResult.secretValues)
      if (!scriptResult.result.success) {
        const execution = withScriptResult(
          unevaluatedExecutionResults(merged),
          scriptResult.result,
          secretValues,
        )
        const scriptError = new Error(
          scriptResult.result.error?.message ?? "Pre-request script failed",
        )
        scriptError.name =
          scriptResult.result.error?.name ?? "ScriptRuntimeError"
        const error = redactLifecycleError(scriptError, secretValues)
        return {
          status: "error",
          request: timeline,
          prepared,
          error,
          failureCategory: "script",
          execution,
          secretValues,
        }
      }
      prepared = scriptResult.request
      timeline = timelineRequest(merged, prepared)
      secretValues.push(...requestSensitiveValues(prepared))
    }

    const transportRequest = { ...prepared }
    delete transportRequest.scripts
    delete transportRequest.captures
    delete transportRequest.assertions
    const rawResponse = await executor.send(transportRequest, {
      ...transport,
      onNetworkEvent: transport.onNetworkEvent
        ? (network) =>
            transport.onNetworkEvent?.(
              redactNetworkEvents(network, [
                ...secretValues,
                ...runtimeSecrets,
              ]),
            )
        : undefined,
      onSensitiveValues: (values) => {
        runtimeSecrets.push(...values)
        transport.onSensitiveValues?.(values)
      },
    })
    secretValues.push(
      ...runtimeSecrets,
      ...responseSensitiveValues(rawResponse),
    )
    let rawCaptures: CaptureResult[] = []
    const responseExecution = evaluateResponseExecution(
      prepared,
      rawResponse,
      runScope,
      secretValues,
      (results) => {
        rawCaptures = results
      },
    )
    secretValues.push(...runScope.secretValues())
    const execution = scriptResult
      ? withScriptResult(responseExecution, scriptResult.result, secretValues)
      : responseExecution
    const response = {
      ...rawResponse,
      ...(rawResponse.network
        ? { network: redactNetworkEvents(rawResponse.network, secretValues) }
        : {}),
    }
    return {
      status: "done",
      request: timeline,
      prepared,
      response,
      rawCaptures,
      execution,
      secretValues,
    }
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError"
    if (aborted && transport.signal?.aborted) throw error
    secretValues.push(...runtimeSecrets, ...runScope.secretValues())
    const normalized = error instanceof Error ? error : new Error(String(error))
    const safeError = redactLifecycleError(normalized, secretValues)
    const execution = scriptResult
      ? withScriptResult(
          unevaluatedExecutionResults(request),
          scriptResult.result,
          secretValues,
        )
      : unevaluatedExecutionResults(request)
    return {
      status: "error",
      request: timeline,
      prepared,
      error: safeError,
      failureCategory:
        aborted || Array.isArray((normalized as NetworkError).network)
          ? "transport"
          : "execution",
      execution,
      secretValues,
    }
  }
}

function redactLifecycleError(
  error: Error,
  secretValues: readonly RedactionSecret[],
): Error {
  const redacted = new Error(
    redactKnownSecrets(error.message, executionResultSecrets(secretValues)),
  )
  redacted.name = redactKnownSecrets(
    error.name,
    executionResultSecrets(secretValues),
  )
  const network = (error as NetworkError).network
  if (Array.isArray(network)) {
    Object.assign(redacted, {
      network: redactNetworkEvents(network, secretValues),
    })
  }
  return redacted
}

function redactNetworkEvents(
  network: readonly NetworkEvent[],
  secretValues: readonly RedactionSecret[],
): NetworkEvent[] {
  return network.map((event) => ({
    ...event,
    message: redactKnownSecrets(event.message, secretValues),
  }))
}

function withScriptResult(
  execution: ResponseExecutionResults,
  result: Awaited<ReturnType<typeof runPreRequestScript>>["result"],
  secretValues: readonly RedactionSecret[],
): ResponseExecutionResults {
  return {
    ...execution,
    scripts: {
      evaluated: true,
      results: [
        redactScriptExecutionResult(
          result,
          executionResultSecrets(secretValues),
        ),
      ],
    },
  }
}

export function timelineRequest(
  source: Request,
  prepared: SubstitutedRequest,
): Request {
  const headers: Request["headers"] = {}
  const preparedEntries = Object.entries(prepared.headers)
  for (const [name, entry] of Object.entries(source.headers)) {
    if (!entry.enabled) {
      if (
        !preparedEntries.some(
          ([preparedName]) => preparedName.toLowerCase() === name.toLowerCase(),
        )
      ) {
        headers[name] = { ...entry }
      }
      continue
    }
    const preparedEntry = Object.hasOwn(prepared.headers, name)
      ? ([name, prepared.headers[name]!] as const)
      : preparedEntries.find(
          ([preparedName]) => preparedName.toLowerCase() === name.toLowerCase(),
        )
    if (preparedEntry && !Object.hasOwn(headers, preparedEntry[0])) {
      headers[preparedEntry[0]] = { value: preparedEntry[1], enabled: true }
    }
  }
  for (const [name, value] of preparedEntries) {
    if (!Object.hasOwn(headers, name)) headers[name] = { value, enabled: true }
  }
  const transientFree = { ...prepared }
  delete transientFree.scripts
  return { ...transientFree, headers }
}
