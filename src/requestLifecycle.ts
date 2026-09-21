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
  redactResponseExecution,
  unevaluatedExecutionResults,
  type ResponseExecutionResults,
} from "./executionResults"
import {
  runPreRequestScript,
  runRequestScript,
  type ScriptExecutionResult,
  type ScriptPersistenceIntent,
  type ScriptPersistenceOutcome,
} from "./preRequestScript"
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
  persistScriptChanges?: (intents: ScriptPersistenceIntent[]) => Promise<{
    outcomes: ScriptPersistenceOutcome[]
    secretValues: string[]
  }>
  persistCaptures?: (
    request: Request,
    rawCaptures: CaptureResult[],
    execution: ResponseExecutionResults,
  ) => Promise<ResponseExecutionResults>
  onEnvironmentPersisted?: () => Promise<void>
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
  const scriptResults: ScriptExecutionResult[] = []
  const runtimeSecrets: string[] = []
  runScope.rememberSecrets(secretValues)
  const persistScripts = async (
    result: ScriptExecutionResult,
    intents: ScriptPersistenceIntent[] = [],
  ) => {
    if (!intents.length) return
    if (!options.persistScriptChanges) {
      result.persistence = intents.map(({ variable, target, operation }) => ({
        variable,
        target,
        operation,
        status: "transient",
      }))
      return
    }
    try {
      const batch = await options.persistScriptChanges(intents)
      result.persistence = batch.outcomes
      secretValues.push(...batch.secretValues)
      runScope.rememberSecrets(batch.secretValues)
    } catch (error) {
      result.persistence = intents.map(({ variable, target, operation }) => ({
        variable,
        target,
        operation,
        status: "failed",
        error: {
          name: "ScriptPersistenceError",
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    }
    if (result.persistence.some((outcome) => outcome.status === "saved"))
      await options.onEnvironmentPersisted?.().catch(() => {})
  }

  try {
    const merged =
      collection && requestPath
        ? mergeFolderOverrides(request, collection, requestPath)
        : request
    prepared = substitute(merged, effectiveEnvironment)
    timeline = timelineRequest(merged, prepared)
    secretValues.push(...requestSensitiveValues(prepared))

    if (merged.scripts?.pre !== undefined) {
      const scriptResult = await runPreRequestScript(
        merged.scripts.pre,
        prepared,
        environment,
        runScope,
      )
      secretValues.push(...scriptResult.secretValues)
      runScope.rememberSecrets(scriptResult.secretValues)
      scriptResults.push(scriptResult.result)
      if (!scriptResult.result.success) {
        const execution = withScriptResults(
          unevaluatedExecutionResults(merged),
          scriptResults,
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
      await persistScripts(scriptResult.result, scriptResult.persistenceIntents)
    }

    const transportRequest = { ...prepared }
    delete transportRequest.tests
    delete transportRequest.scripts
    delete transportRequest.captures
    delete transportRequest.assertions
    let sentRequest = transportRequest
    const rawResponse = await executor.send(transportRequest, {
      ...transport,
      knownSensitiveValues: [
        ...(transport.knownSensitiveValues ?? []),
        ...secretValues,
      ],
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
      onPreparedRequest:
        merged.scripts?.post !== undefined || merged.tests !== undefined
          ? (snapshot) => {
              sentRequest = snapshot
              transport.onPreparedRequest?.(snapshot)
            }
          : transport.onPreparedRequest,
    })
    secretValues.push(
      ...runtimeSecrets,
      ...responseSensitiveValues(rawResponse),
    )
    let rawCaptures: CaptureResult[] = []
    let postIntents: ScriptPersistenceIntent[] = []
    let responseExecution = await evaluateResponseExecution(
      prepared,
      rawResponse,
      runScope,
      secretValues,
      (results) => {
        rawCaptures = results
      },
      async () => {
        if (merged.scripts?.post === undefined) return
        const post = await runRequestScript(
          "post",
          merged.scripts.post,
          sentRequest,
          environment,
          runScope,
          { response: rawResponse, cookies: transport.cookies },
        )
        scriptResults.push(post.result)
        secretValues.push(...post.secretValues)
        runScope.rememberSecrets(post.secretValues)
        postIntents = post.persistenceIntents ?? []
      },
    )
    if (options.persistCaptures) {
      responseExecution = await options.persistCaptures(
        timeline,
        rawCaptures,
        responseExecution,
      )
      if (
        responseExecution.captures?.results.some(
          (capture) => capture.success && capture.persisted,
        )
      )
        await options.onEnvironmentPersisted?.().catch(() => {})
    }
    const postResult = scriptResults.find((result) => result.phase === "post")
    if (postResult) await persistScripts(postResult, postIntents)
    if (merged.tests !== undefined) {
      runScope.rememberSecrets(secretValues)
      const tested = await runRequestScript(
        "tests",
        merged.tests,
        sentRequest,
        environment,
        runScope,
        {
          response: rawResponse,
          cookies: transport.cookies,
        },
      )
      secretValues.push(...tested.secretValues)
      runScope.rememberSecrets(tested.secretValues)
      responseExecution.tests = {
        evaluated: true,
        results: tested.tests ?? [],
        logs: tested.result.logs,
        ...(tested.result.error ? { error: tested.result.error } : {}),
      }
    }
    secretValues.push(...runScope.secretValues())
    responseExecution = redactResponseExecution(responseExecution, secretValues)
    const execution =
      scriptResults.length > 0
        ? withScriptResults(responseExecution, scriptResults, secretValues)
        : responseExecution
    const response = {
      ...rawResponse,
      ...(rawResponse.network
        ? { network: redactNetworkEvents(rawResponse.network, secretValues) }
        : {}),
    }
    if (rawResponse.bodyBytes)
      Object.defineProperty(response, "bodyBytes", {
        value: rawResponse.bodyBytes,
        enumerable: false,
      })
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
    const normalized =
      error instanceof Error
        ? error
        : new Error(String(error), { cause: error })
    const safeError = redactLifecycleError(normalized, secretValues)
    const execution =
      scriptResults.length > 0
        ? withScriptResults(
            unevaluatedExecutionResults(request),
            scriptResults,
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

function withScriptResults(
  execution: ResponseExecutionResults,
  results: ScriptExecutionResult[],
  secretValues: readonly RedactionSecret[],
): ResponseExecutionResults {
  return {
    ...execution,
    scripts: {
      evaluated: true,
      results: results.map((result) =>
        redactScriptExecutionResult(
          result,
          executionResultSecrets(secretValues),
        ),
      ),
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
