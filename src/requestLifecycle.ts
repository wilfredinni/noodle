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
import { requestScriptBlocks, labelScriptResult } from "./scriptInheritance"
import {
  createScriptSourceResolver,
  ScriptSourceError,
  type ResolvedScriptBlock,
  type ScriptSourceResolver,
} from "./scriptSourceResolver"
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
  testsSucceeded,
} from "./executionResults"
import {
  runPreRequestScript,
  runRequestScript,
  type ScriptExecutionResult,
  type ScriptPersistenceIntent,
  type ScriptPersistenceOutcome,
  SCRIPT_LIMITS,
  scriptExecutionSucceeded,
  validatePreparedRequest,
} from "./preRequestScript"
import type {
  ScriptRequestOptions,
  ScriptRequestResult,
  ScriptRequestSummary,
} from "./scriptRequests"
import { validateId } from "./requestId"
import { findRequestById } from "./ui/tree"
import {
  executionResultSecrets,
  redactKnownSecrets,
  requestSensitiveValues,
  responseSensitiveValues,
  type RedactionSecret,
} from "./secrets/redact"

export type RequestLifecycleFailureCategory =
  | "execution"
  | "configuration"
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

type ScriptCallContext = {
  budget: { calls: number }
  stack: string[]
  depth: number
  deadline?: number
}

export function lifecycleFailureCategories(
  result: RequestLifecycleResult,
): (
  | RequestLifecycleFailureCategory
  | "http"
  | "capture"
  | "assertion"
  | "test"
)[] {
  if (result.status === "error") return [result.failureCategory]
  const categories: ReturnType<typeof lifecycleFailureCategories> = []
  if (
    result.execution.scripts?.results.some(
      (script) => !scriptExecutionSucceeded(script),
    )
  )
    categories.push("script")
  if (result.response.status >= 400) categories.push("http")
  if (result.execution.captures?.results.some((capture) => !capture.success))
    categories.push("capture")
  if (
    result.execution.assertions?.results.some((assertion) => !assertion.passed)
  )
    categories.push("assertion")
  if (!testsSucceeded(result.execution.tests)) categories.push("test")
  return categories
}
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
  scriptSources?: ScriptSourceResolver
  scriptContext?: ScriptCallContext
}): Promise<RequestLifecycleResult> {
  const {
    request,
    runScope,
    environment,
    collection,
    requestPath,
    transport = {},
  } = options
  const declarations = requestScriptBlocks(request, collection, requestPath)
  const scriptSources =
    options.scriptSources ?? createScriptSourceResolver(transport.collectionDir)
  let blocks: ResolvedScriptBlock[] = []
  const inherited = declarations.some(
    (block) => block.source.scope !== "request",
  )
  const diagnostics = inherited ? { consoleBytes: 0, testBytes: 0 } : undefined
  const declared = {
    ...request,
    scripts: declarations.some((block) => block.scripts)
      ? { pre: "" }
      : undefined,
    tests: declarations.some((block) => block.tests !== undefined)
      ? ""
      : undefined,
  }
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
  const scriptContext = options.scriptContext ?? {
    budget: { calls: 0 },
    stack: [request.id],
    depth: 0,
  }
  const scriptOptions = (): ScriptRequestOptions => {
    const requests: ScriptRequestSummary[] = []
    return {
      diagnostics,
      signal: transport.signal,
      deadline: scriptContext.deadline,
      requests,
      execute: async (kind, input, scope, signal, deadline) => {
        const started = performance.now()
        const summary: ScriptRequestSummary = {
          kind,
          ...(kind === "saved" && typeof input === "string"
            ? { requestId: input }
            : {}),
          depth: scriptContext.depth + 1,
          method: "GET",
          url: "",
          durationMs: 0,
          success: false,
          failureCategories: [],
        }
        let dispatched = false
        try {
          // Retain the first rejected call as well as the ten permitted calls.
          const call = ++scriptContext.budget.calls
          if (call <= SCRIPT_LIMITS.requestCalls + 1) requests.push(summary)
          if (call > SCRIPT_LIMITS.requestCalls)
            throw new Error(
              `Script request limit is ${SCRIPT_LIMITS.requestCalls} calls per top-level request`,
            )
          if (summary.depth > SCRIPT_LIMITS.requestDepth)
            throw new Error(
              `Script request depth limit is ${SCRIPT_LIMITS.requestDepth}`,
            )
          signal.throwIfAborted()
          const childTransport: TransportExecutionOptions = {
            ...transport,
            signal,
            oauthMode: "cached-only",
            onNetworkEvent: undefined,
            onPreparedRequest: undefined,
            knownSensitiveValues: [
              ...(transport.knownSensitiveValues ?? []),
              ...scope.secretValues(),
            ],
            onSensitiveValues: (values) => {
              scope.rememberSecrets(values)
              transport.onSensitiveValues?.(values)
            },
          }
          let result: ScriptRequestResult
          if (kind === "saved") {
            if (typeof input !== "string" || input.endsWith(".yml"))
              throw new Error("runRequest requires a request ID without .yml")
            validateId(input)
            summary.requestId = input
            if (!collection) throw new Error("runRequest requires a collection")
            const child = findRequestById(collection.items, input)
            if (!child)
              throw new Error(
                `Request "${input}" was not found in the current collection`,
              )
            summary.method = child.method
            summary.url = child.url
            if (scriptContext.stack.includes(input))
              throw new Error(
                `Recursive request call: ${[...scriptContext.stack, input].join(" -> ")}`,
              )
            dispatched = true
            const lifecycle = await executeRequestLifecycle({
              request: child,
              collection,
              requestPath: input,
              environment,
              runScope: scope,
              transport: childTransport,
              scriptSources,
              scriptContext: {
                budget: scriptContext.budget,
                stack: [...scriptContext.stack, input],
                depth: summary.depth,
                deadline,
              },
            })
            scope.rememberSecrets(lifecycle.secretValues)
            summary.url = lifecycle.prepared?.url ?? child.url
            summary.method = lifecycle.prepared?.method ?? child.method
            for (const script of lifecycle.execution.scripts?.results ?? [])
              requests.push(...(script.requests ?? []))
            result = {
              failureCategories: lifecycleFailureCategories(lifecycle),
              execution: lifecycle.execution,
              ...(lifecycle.status === "done"
                ? { response: lifecycle.response }
                : {
                    error: {
                      name: lifecycle.error.name,
                      message: lifecycle.error.message,
                    },
                  }),
            }
          } else {
            const child = literalScriptRequest(input, request.sendCookies)
            summary.method = child.method
            summary.url = child.url
            scope.rememberSecrets(requestSensitiveValues(child))
            childTransport.knownSensitiveValues = [
              ...(childTransport.knownSensitiveValues ?? []),
              ...scope.secretValues(),
            ]
            dispatched = true
            const response = await executor.send(child, childTransport)
            scope.rememberSecrets(responseSensitiveValues(response))
            result = {
              response,
              failureCategories: response.status >= 400 ? ["http"] : [],
            }
          }
          signal.throwIfAborted()
          summary.status = result.response?.status
          summary.failureCategories = result.failureCategories
          summary.success = result.failureCategories.length === 0
          if (!summary.success) {
            result.error ??= {
              name: "ScriptRequestError",
              message: `Called request failed: ${result.failureCategories.join(", ")}${result.response ? ` (HTTP ${result.response.status})` : ""}`,
            }
          }
          summary.error = result.error
          return result
        } catch (error) {
          const normalized = redactLifecycleError(
            error instanceof Error ? error : new Error(String(error)),
            scope.secretValues(),
          )
          summary.failureCategories = [
            dispatched ? "transport" : "configuration",
          ]
          summary.error = { name: normalized.name, message: normalized.message }
          return {
            failureCategories: summary.failureCategories,
            error: summary.error,
          }
        } finally {
          summary.durationMs = Math.max(
            0,
            Math.round((performance.now() - started) * 100) / 100,
          )
          runScope.rememberSecrets(scope.secretValues())
          secretValues.push(...scope.secretValues())
        }
      },
    }
  }
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
    blocks = await scriptSources.resolveBlocks(declarations)
    const merged =
      collection && requestPath
        ? mergeFolderOverrides(request, collection, requestPath)
        : request
    prepared = substitute(merged, effectiveEnvironment)
    timeline = timelineRequest(merged, prepared)
    secretValues.push(...requestSensitiveValues(prepared))

    for (const block of blocks) {
      if (block.pre === undefined) continue
      const scriptResult = await runPreRequestScript(
        block.pre.text,
        prepared,
        environment,
        runScope,
        scriptOptions(),
      )
      labelScriptResult(scriptResult, block.pre.source)
      secretValues.push(...scriptResult.secretValues)
      runScope.rememberSecrets(scriptResult.secretValues)
      scriptResults.push(scriptResult.result)
      if (!scriptResult.result.success) {
        const execution = withScriptResults(
          unevaluatedExecutionResults(declared),
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
      onPreparedRequest: blocks.some(
        (block) => block.post !== undefined || block.tests !== undefined,
      )
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
    const posts: {
      result: ScriptExecutionResult
      intents: ScriptPersistenceIntent[]
    }[] = []
    let responseExecution = await evaluateResponseExecution(
      prepared,
      rawResponse,
      runScope,
      secretValues,
      (results) => {
        rawCaptures = results
      },
      async () => {
        for (const block of blocks.toReversed()) {
          if (block.post === undefined) continue
          const post = await runRequestScript(
            "post",
            block.post.text,
            sentRequest,
            environment,
            runScope,
            { response: rawResponse, cookies: transport.cookies },
            scriptOptions(),
          )
          labelScriptResult(post, block.post.source)
          scriptResults.push(post.result)
          secretValues.push(...post.secretValues)
          runScope.rememberSecrets(post.secretValues)
          posts.push({
            result: post.result,
            intents: post.persistenceIntents ?? [],
          })
        }
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
    for (const post of posts) await persistScripts(post.result, post.intents)
    for (const block of blocks) {
      if (block.tests === undefined) continue
      runScope.rememberSecrets(secretValues)
      const tested = await runRequestScript(
        "tests",
        block.tests.text,
        sentRequest,
        environment,
        runScope,
        {
          response: rawResponse,
          cookies: transport.cookies,
        },
        {
          signal: transport.signal,
          deadline: scriptContext.deadline,
          diagnostics,
          sourceBytes: inherited
            ? Buffer.byteLength(JSON.stringify(block.tests.source))
            : undefined,
        },
      )
      labelScriptResult(tested, block.tests.source)
      secretValues.push(...tested.secretValues)
      runScope.rememberSecrets(tested.secretValues)
      const group = (responseExecution.tests ??= {
        evaluated: true,
        results: [],
        logs: [],
      })
      ;(group.invocations ??= []).push(tested.result)
      group.results.push(...(tested.tests ?? []))
      group.logs.push(...tested.result.logs)
      if (tested.result.error) {
        group.error ??= tested.result.error
        if (inherited) (group.errors ??= []).push(tested.result.error)
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
            unevaluatedExecutionResults(declared),
            scriptResults,
            secretValues,
          )
        : unevaluatedExecutionResults(declared)
    return {
      status: "error",
      request: timeline,
      prepared,
      error: safeError,
      failureCategory:
        error instanceof ScriptSourceError
          ? "configuration"
          : aborted || Array.isArray((normalized as NetworkError).network)
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

function literalScriptRequest(
  input: unknown,
  sendCookies?: boolean,
): SubstitutedRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("sendRequest options must be an object")
  const options = input as Record<string, unknown>
  for (const key of Object.keys(options))
    if (!["url", "method", "headers", "body", "timeout"].includes(key))
      throw new Error(`Unknown sendRequest option "${key}"`)
  if (typeof options.url !== "string")
    throw new Error("sendRequest url must be a string")
  if (options.method !== undefined && typeof options.method !== "string")
    throw new Error("sendRequest method must be a string")
  if (options.body !== undefined && typeof options.body !== "string")
    throw new Error("sendRequest body must be a string")
  if (
    options.headers !== undefined &&
    (!options.headers ||
      typeof options.headers !== "object" ||
      Array.isArray(options.headers))
  )
    throw new Error("sendRequest headers must be a string-valued object")
  const timeout =
    options.timeout === undefined ? SCRIPT_LIMITS.wallTimeMs : options.timeout
  if (
    typeof timeout !== "number" ||
    !Number.isSafeInteger(timeout) ||
    timeout < 0
  )
    throw new Error(
      "sendRequest timeout must be a non-negative safe integer in milliseconds",
    )
  const request: SubstitutedRequest = {
    id: "script-request",
    name: "Script request",
    method: (options.method ?? "GET") as Request["method"],
    url: options.url,
    timeout,
    headers: (options.headers ?? {}) as Record<string, string>,
    params: [],
    sendCookies,
    ...(options.body !== undefined ? { body: options.body as string } : {}),
  }
  validatePreparedRequest(request)
  new Headers(request.headers)
  return request
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
