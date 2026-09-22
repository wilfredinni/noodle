import { createHash, createHmac, randomBytes } from "node:crypto"
import releaseVariant from "@jitl/quickjs-singlefile-mjs-release-sync"
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
} from "quickjs-emscripten-core"
import type { Environment, JsonValue, Method, Response } from "./schema"
import { responseByteSize, responseText } from "./responseBody"
import { CookieValidationError, type CollectionCookieJar } from "./cookies"
import { isExternalScriptSource } from "./lang/scriptSource"
import type { SubstitutedRequest } from "./requests/substitute"
import { withDefaultHttpsScheme } from "./requests/url"
import { RunScope, secretRedactionValues } from "./runScope"
import { createRandomHandlers, RANDOM_GENERATORS } from "./scriptRandom"
import { createTimeHandlers, TIME_METHODS } from "./scriptTime"
import {
  ScriptEvaluationError,
  ScriptScheduler,
  SCRIPT_WRAPPER_PREFIX,
} from "./scriptAsync"
import type {
  ScriptRequestOptions,
  ScriptRequestResult,
  ScriptRequestSummary,
} from "./scriptRequests"
import {
  environmentSecretValues,
  redactKnownSecrets,
  requestSensitiveValues,
  responseSensitiveValues,
  sensitiveHeaderValues,
} from "./secrets/redact"

export const SCRIPT_LIMITS = Object.freeze({
  deadlineMs: 500,
  wallTimeMs: 30_000,
  requestCalls: 10,
  requestDepth: 4,
  runtimeMemoryBytes: 32 * 1024 * 1024,
  stackBytes: 512 * 1024,
  sourceBytes: 256 * 1024,
  consoleEntries: 100,
  consoleBytes: 64 * 1024,
  randomBytes: 4096,
  bridgeValueBytes: 256 * 1024,
  bridgeJsonDepth: 32,
  consoleDepth: 4,
  responseBodyBytes: 5 * 1024 * 1024,
  persistenceKeys: 100,
  persistenceBytes: 256 * 1024,
})

export type ScriptPhase = "pre" | "post" | "tests"

export type ScriptApiDescriptor = Readonly<{
  global: "noodle" | "console" | "test" | "expect"
  member: string
  kind: "global" | "property" | "method"
  signature: string
  description: string
  phases: readonly ScriptPhase[]
}>

const api = (
  namespace:
    | "noodle"
    | "request"
    | "env"
    | "run"
    | "crypto"
    | "random"
    | "time"
    | "console"
    | "response"
    | "cookies",
  member: string,
  kind: ScriptApiDescriptor["kind"],
  signature: string,
  description: string,
  phases: readonly ScriptPhase[] = kind === "method" &&
  isRequestMutation(`${namespace}.${member}`)
    ? ["pre"]
    : ["pre", "post", "tests"],
): ScriptApiDescriptor =>
  Object.freeze({
    global: namespace === "console" ? "console" : "noodle",
    member:
      namespace === "console" || namespace === "noodle"
        ? member
        : member
          ? `${namespace}.${member}`
          : namespace,
    kind:
      kind === "global" && namespace !== "console" && namespace !== "noodle"
        ? "property"
        : kind,
    signature:
      kind === "global" && namespace !== "console" && namespace !== "noodle"
        ? `noodle.${signature}`
        : signature,
    description,
    phases: Object.freeze(
      namespace === "run" && (member === "set" || member === "unset")
        ? (["pre", "post"] as const)
        : phases,
    ),
  })

export const TEST_MATCHERS = Object.freeze([
  "toBe",
  "toEqual",
  "toBeTruthy",
  "toBeFalsy",
  "toBeDefined",
  "toBeNull",
  "toContain",
  "toMatch",
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual",
] as const)

export const SCRIPT_API_CONTRACT: readonly ScriptApiDescriptor[] =
  Object.freeze([
    api("noodle", "", "global", "noodle: Noodle", "Noodle scripting APIs."),
    api(
      "noodle",
      "runRequest",
      "method",
      "runRequest(id): Promise<ScriptResponse>",
      "Run a saved request in the current collection.",
      ["pre", "post"],
    ),
    api(
      "noodle",
      "sendRequest",
      "method",
      "sendRequest(options): Promise<ScriptResponse>",
      "Send a literal HTTP request.",
      ["pre", "post"],
    ),
    api(
      "random",
      "",
      "global",
      "random: Random",
      "Bounded English test-data generators.",
    ),
    ...RANDOM_GENERATORS.map(({ name, signature, description }) =>
      api("random", name, "method", signature, description),
    ),
    api("time", "", "global", "time: Time", "Date and elapsed-time helpers."),
    ...TIME_METHODS.map(({ name, signature, description }) =>
      api("time", name, "method", signature, description),
    ),
    api("request", "", "global", "request: Request", "Prepared request."),
    api("request", "url", "property", "string", "Request URL."),
    api("request", "method", "property", "Method", "HTTP method."),
    api("request", "headers", "property", "Headers", "Request headers."),
    api(
      "request",
      "headers.get",
      "method",
      "get(name): string | null",
      "Read the first matching header.",
    ),
    api(
      "request",
      "headers.has",
      "method",
      "has(name): boolean",
      "Test for a matching header.",
    ),
    api(
      "request",
      "headers.set",
      "method",
      "set(name, value): void",
      "Set one header.",
    ),
    api(
      "request",
      "headers.delete",
      "method",
      "delete(name): void",
      "Delete matching headers.",
    ),
    api("request", "params", "property", "Params", "Enabled query parameters."),
    api(
      "request",
      "params.get",
      "method",
      "get(name): string | null",
      "Read the first enabled parameter.",
    ),
    api(
      "request",
      "params.getAll",
      "method",
      "getAll(name): string[]",
      "Read enabled parameters.",
    ),
    api(
      "request",
      "params.set",
      "method",
      "set(name, value): void",
      "Replace enabled parameters.",
    ),
    api(
      "request",
      "params.append",
      "method",
      "append(name, value): void",
      "Append an enabled parameter.",
    ),
    api(
      "request",
      "params.delete",
      "method",
      "delete(name): void",
      "Delete enabled parameters.",
    ),
    api("request", "body", "property", "Body", "Request body."),
    api(
      "request",
      "body.text",
      "method",
      "text(): string | null",
      "Read a textual body.",
    ),
    api(
      "request",
      "body.json",
      "method",
      "json(): JsonValue",
      "Parse a textual body as JSON.",
    ),
    api(
      "request",
      "body.setText",
      "method",
      "setText(value): void",
      "Replace the body with text.",
    ),
    api(
      "request",
      "body.setJson",
      "method",
      "setJson(value): void",
      "Replace the body with compact JSON.",
    ),
    api("request", "body.clear", "method", "clear(): void", "Clear the body."),
    api("request", "auth", "property", "Auth", "Request authentication."),
    api(
      "request",
      "auth.clear",
      "method",
      "clear(): void",
      "Clear authentication.",
    ),
    api(
      "request",
      "auth.setBearer",
      "method",
      "setBearer(token): void",
      "Set bearer authentication.",
    ),
    api(
      "request",
      "auth.setBasic",
      "method",
      "setBasic(username, password): void",
      "Set basic authentication.",
    ),
    api(
      "request",
      "auth.setApiKey",
      "method",
      "setApiKey(key, value, placement): void",
      "Set API-key authentication.",
    ),
    api("env", "", "global", "env: Environment", "Selected environment."),
    api(
      "env",
      "get",
      "method",
      "get(name): string | undefined",
      "Read an environment value.",
    ),
    api("run", "", "global", "run: RunScope", "Current collection run scope."),
    api(
      "run",
      "get",
      "method",
      "get(name): JsonValue | undefined",
      "Read a run value.",
    ),
    api(
      "run",
      "set",
      "method",
      'set(name, value, options?: { persist: "environment" | "secret" }): void',
      "Set a run value after success, optionally persisting its snapshot.",
    ),
    api(
      "run",
      "unset",
      "method",
      'unset(name, options?: { persist: "environment" | "secret" }): void',
      "Remove a run value after success, optionally deleting its stored value.",
    ),
    api(
      "crypto",
      "",
      "global",
      "crypto: Crypto",
      "Bounded cryptographic helpers.",
    ),
    api(
      "crypto",
      "sha256",
      "method",
      "sha256(value, encoding): string",
      "Hash a UTF-8 string.",
    ),
    api(
      "crypto",
      "hmacSha256",
      "method",
      "hmacSha256(secret, value, encoding): string",
      "Authenticate a UTF-8 string.",
    ),
    api(
      "crypto",
      "randomBytes",
      "method",
      "randomBytes(size, encoding): string",
      "Generate bounded random bytes.",
    ),
    api(
      "console",
      "",
      "global",
      "console: Console",
      "Bounded captured logging.",
    ),
    api(
      "console",
      "log",
      "method",
      "log(...values): void",
      "Capture a log message.",
    ),
    api(
      "console",
      "info",
      "method",
      "info(...values): void",
      "Capture an info message.",
    ),
    api(
      "console",
      "warn",
      "method",
      "warn(...values): void",
      "Capture a warning message.",
    ),
    api(
      "console",
      "error",
      "method",
      "error(...values): void",
      "Capture an error message.",
    ),
    api(
      "response",
      "",
      "global",
      "response: Response",
      "Completed HTTP response.",
      ["post", "tests"],
    ),
    ...["status", "statusText", "timeMs"].map((member) =>
      api(
        "response",
        member,
        "property",
        member === "statusText" ? "string" : "number",
        "Response metadata.",
        ["post", "tests"],
      ),
    ),
    api("response", "headers", "property", "Headers", "Response headers.", [
      "post",
      "tests",
    ]),
    api(
      "response",
      "headers.get",
      "method",
      "get(name): string | null",
      "Read a case-insensitive header.",
      ["post", "tests"],
    ),
    api(
      "response",
      "headers.has",
      "method",
      "has(name): boolean",
      "Test a case-insensitive header.",
      ["post", "tests"],
    ),
    api(
      "response",
      "text",
      "method",
      "text(): string",
      "Read bounded response text.",
      ["post", "tests"],
    ),
    api(
      "response",
      "json",
      "method",
      "json(): JsonValue",
      "Parse and cache response JSON in the sandbox.",
      ["post", "tests"],
    ),
    api(
      "cookies",
      "",
      "global",
      "cookies: Cookies",
      "URL-scoped cookie transaction when enabled.",
      ["post", "tests"],
    ),
    api(
      "cookies",
      "get",
      "method",
      "get(name): string | null",
      "Read the first applicable cookie.",
      ["post", "tests"],
    ),
    api(
      "cookies",
      "set",
      "method",
      "set(input): void",
      "Stage a host-only cookie.",
      ["post"],
    ),
    api(
      "cookies",
      "delete",
      "method",
      "delete(name): void",
      "Stage deletion of all applicable same-name cookies.",
      ["post"],
    ),
    ...(["test", "expect"] as const).map((global) =>
      Object.freeze({
        global,
        member: "",
        kind: "global" as const,
        signature:
          global === "test"
            ? "test(name, callback): void | Promise<void>"
            : "expect(actual): Matchers",
        description:
          global === "test"
            ? "Run a synchronous named test."
            : "Assert against a sandbox value.",
        phases: Object.freeze(["tests"] as const),
      }),
    ),
    ...["not", ...TEST_MATCHERS].map((member) =>
      Object.freeze({
        global: "expect" as const,
        member,
        kind: member === "not" ? ("property" as const) : ("method" as const),
        signature: member === "not" ? "Matchers" : `${member}(expected?): void`,
        description:
          member === "not"
            ? "Negate the matcher."
            : "Synchronous value assertion.",
        phases: Object.freeze(["tests"] as const),
      }),
    ),
  ])

export type TestResult = {
  name: string
  passed: boolean
  message: string
  durationMs: number
}

export type ScriptLog = {
  level: "log" | "info" | "warn" | "error"
  message: string
}

export type ScriptExecutionError = {
  name: string
  message: string
  line?: number
  column?: number
}

export type ScriptExecutionResult = {
  phase: ScriptPhase
  scope: "request"
  sourceKind: "inline"
  success: boolean
  durationMs: number
  logs: ScriptLog[]
  error?: ScriptExecutionError
  persistence?: ScriptPersistenceOutcome[]
  requests?: ScriptRequestSummary[]
}

export type ScriptPersistenceIntent = {
  variable: string
  target: "environment" | "secret"
} & ({ operation: "set"; value: JsonValue } | { operation: "unset" })

export type ScriptPersistenceOutcome = {
  variable: string
  target: "environment" | "secret"
  operation: "set" | "unset"
  status: "saved" | "transient" | "failed"
  error?: ScriptExecutionError
}

export function scriptExecutionSucceeded(
  result: ScriptExecutionResult,
): boolean {
  return (
    result.success &&
    !result.persistence?.some((outcome) => outcome.status === "failed")
  )
}

export type PreRequestScriptResult = {
  request: SubstitutedRequest
  result: ScriptExecutionResult
  secretValues: string[]
  persistenceIntents?: ScriptPersistenceIntent[]
  tests?: TestResult[]
}

const METHODS = new Set<Method>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
])
const SAFE_NAME = /^\w+$/
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"])
const textEncoder = new TextEncoder()
const wasmMemory = new WebAssembly.Memory({ initial: 1024, maximum: 1024 })
let quickJSPromise:
  | ReturnType<typeof newQuickJSWASMModuleFromVariant>
  | undefined

function quickJS() {
  return (quickJSPromise ??= newQuickJSWASMModuleFromVariant(
    newVariant(releaseVariant, { wasmMemory, log: () => {} }),
  ))
}

export function scriptWasmMemoryForTests(): WebAssembly.Memory {
  return wasmMemory
}

type BridgeHandler = (args: unknown[]) => unknown

export async function runPreRequestScript(
  source: string,
  request: SubstitutedRequest,
  environment: Environment | null | undefined,
  runScope: RunScope,
  options: ScriptRequestOptions = {},
): Promise<PreRequestScriptResult> {
  return runRequestScript(
    "pre",
    source,
    request,
    environment,
    runScope,
    undefined,
    options,
  )
}

export async function runRequestScript(
  phase: ScriptPhase,
  source: string,
  request: SubstitutedRequest,
  environment: Environment | null | undefined,
  runScope: RunScope,
  post?: { response: Response; cookies?: CollectionCookieJar },
  options: ScriptRequestOptions = {},
): Promise<PreRequestScriptResult> {
  const label =
    phase === "pre"
      ? "Pre-request"
      : phase === "post"
        ? "Post-response"
        : "Test"
  const filename =
    phase === "pre"
      ? "pre-request.js"
      : phase === "post"
        ? "post-response.js"
        : "tests.js"
  const startedAt = performance.now()
  const invocationDate = new Date().toISOString()
  const stagedRequest = structuredClone(request)
  const stagedScope = runScope.fork()
  const persistenceIntents = new Map<string, ScriptPersistenceIntent>()
  const secretValues = new Set([
    ...(phase === "tests" ? environmentSecretValues(environment) : []),
    ...requestSensitiveValues(request),
    ...(phase !== "pre" && post ? responseSensitiveValues(post.response) : []),
    ...runScope
      .secretValues()
      .map((secret) => (typeof secret === "string" ? secret : secret.value)),
  ])
  if (phase !== "pre") {
    for (const cookie of [
      ...(post?.response.cookies ?? []),
      ...(post?.response.sentCookies ?? []),
    ])
      secretValues.add(cookie.value)
  }
  const logs: ScriptLog[] = []
  const testResults = new Map<number, TestResult>()
  const testStarts = new Map<number, { name: string; time: number }>()
  let testResultBytes = 0
  let testCount = 0
  let testLimitError: ScriptExecutionError | undefined
  const cookies =
    phase !== "pre" && request.sendCookies !== false
      ? post?.cookies?.scriptTransaction(request.url, (value) =>
          secretValues.add(value),
        )
      : undefined
  let consoleBytes = 0
  let consoleClosed = false
  let openConsoleEntry: ScriptLog | undefined

  const failure = (error: ScriptExecutionError): PreRequestScriptResult => ({
    request,
    ...(phase === "tests"
      ? {
          tests: [...testResults]
            .sort(([a], [b]) => a - b)
            .map(([, value]) => value),
        }
      : {}),
    secretValues: [...secretValues, ...requestSensitiveValues(stagedRequest)],
    result: {
      ...baseResult(phase, false, performance.now() - startedAt, logs, error),
      ...(options.requests?.length ? { requests: options.requests } : {}),
    },
  })

  if (byteLength(source) > SCRIPT_LIMITS.sourceBytes) {
    return failure({
      name: "ScriptSourceLimitError",
      message: `${label} script exceeds the ${SCRIPT_LIMITS.sourceBytes}-byte source limit`,
    })
  }
  if (isExternalScriptSource(source))
    return failure({
      name: "ScriptApiValidationError",
      message: `${label} scripts must be inline source; external script paths are not supported`,
    })

  const requireName = (value: unknown): string => {
    const name = requireString(value, "name")
    if (!SAFE_NAME.test(name) || UNSAFE_KEYS.has(name)) {
      throw apiError(
        "name must contain only letters, numbers, or _ and must be safe",
      )
    }
    return name
  }
  const stagePersistence = (
    name: string,
    options: unknown,
    value?: JsonValue,
  ) => {
    if (options === undefined) return
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).length !== 1 ||
      !Object.hasOwn(options, "persist")
    )
      throw apiError(
        'options must contain only persist: "environment" or "secret"',
      )
    const target = (options as { persist: unknown }).persist
    if (target !== "environment" && target !== "secret")
      throw apiError('persist must be "environment" or "secret"')
    if (name === "_color")
      throw apiError('"_color" is reserved environment metadata')
    if (target === "secret") {
      if (value !== undefined) {
        for (const secret of secretRedactionValues(value))
          secretValues.add(typeof secret === "string" ? secret : secret.value)
        if (value === "") throw apiError("secret value must not be empty")
      }
      const previous = environment?.vars[name]
      if (previous !== undefined) secretValues.add(previous)
      for (const secret of runScope.secretValuesFor(name))
        secretValues.add(typeof secret === "string" ? secret : secret.value)
    }
    const intent: ScriptPersistenceIntent =
      value === undefined
        ? { variable: name, target, operation: "unset" }
        : { variable: name, target, operation: "set", value }
    const candidate = new Map(persistenceIntents).set(name, intent)
    if (candidate.size > SCRIPT_LIMITS.persistenceKeys)
      throw apiError(
        `persistence exceeds ${SCRIPT_LIMITS.persistenceKeys} distinct keys`,
      )
    if (
      byteLength(JSON.stringify([...candidate.values()])) >
      SCRIPT_LIMITS.persistenceBytes
    )
      throw apiError(
        `persistence exceeds ${SCRIPT_LIMITS.persistenceBytes} bytes`,
      )
    persistenceIntents.set(name, intent)
  }
  const textualBody = (): string | null => {
    if (
      stagedRequest.body === undefined ||
      stagedRequest.bodyType === "none" ||
      stagedRequest.bodyType === "multipart" ||
      stagedRequest.bodyType === "urlencoded" ||
      stagedRequest.bodyType === "binary"
    )
      return null
    return stagedRequest.body
  }
  const clearIncompatibleBody = () => {
    stagedRequest.formData = undefined
    stagedRequest.filePath = undefined
  }

  const handlers: Record<string, BridgeHandler> = {
    "tests.clean": ([value]) => {
      const raw = requireString(value, "test diagnostic")
      // Preserve only canonical resource markers until group classification.
      const resource =
        /out of memory|memory limit|stack overflow|stack limit|interrupted/i.exec(
          raw,
        )
      if (resource) return resource[0].toLowerCase()
      const message = redactKnownSecrets(raw, [...secretValues])
      return byteLength(message) > 4096
        ? "[TRUNCATED]"
        : cleanErrorText(message, "Test failed")
    },
    "tests.start": ([value]) => {
      const name = requireString(value, "test name")
      if (!name.trim()) throw apiError("test name must be a non-empty string")
      testResultBytes += byteLength(JSON.stringify(name)) + 96
      if (testResultBytes > SCRIPT_LIMITS.bridgeValueBytes) {
        testLimitError = {
          name: "ScriptApiValidationError",
          message: "test results exceed the 262144-byte limit",
        }
        throw apiError(testLimitError.message)
      }
      const id = testCount++
      testStarts.set(id, { name, time: performance.now() })
      return id
    },
    "tests.finish": ([id, passedValue, messageValue]) => {
      if (typeof id !== "number" || !testStarts.has(id))
        throw apiError("invalid test result")
      const passed = requireBoolean(passedValue, "test passed")
      const message = cleanErrorText(
        requireString(messageValue, "test message"),
        "Test failed",
      )
      const start = testStarts.get(id)!
      testResultBytes += byteLength(JSON.stringify(message))
      if (testResultBytes > SCRIPT_LIMITS.bridgeValueBytes) {
        testLimitError = {
          name: "ScriptApiValidationError",
          message: "test results exceed the 262144-byte limit",
        }
        throw apiError(testLimitError.message)
      }
      testResults.set(id, {
        name: start.name,
        passed,
        message,
        durationMs: Math.max(0, Math.round(performance.now() - start.time)),
      })
      testStarts.delete(id)
    },
    ...createTimeHandlers(apiError),
    ...createRandomHandlers(
      apiError,
      (value) => secretValues.add(value),
      invocationDate,
    ),
    "response.status:get": () => post!.response.status,
    "response.statusText:get": () => post!.response.statusText,
    "response.timeMs:get": () => post!.response.timeMs,
    "response.headers.get": ([value]) => {
      const name = requireString(value, "header name").toLowerCase()
      return (
        Object.entries(post!.response.headers).find(
          ([key]) => key.toLowerCase() === name,
        )?.[1] ?? null
      )
    },
    "response.headers.has": ([value]) => {
      const name = requireString(value, "header name").toLowerCase()
      return Object.keys(post!.response.headers).some(
        (key) => key.toLowerCase() === name,
      )
    },
    "cookies.get": ([value]) =>
      cookies!.get(requireString(value, "cookie name")),
    "cookies.set": ([input]) => cookies!.set(input),
    "cookies.delete": ([value]) =>
      cookies!.delete(requireString(value, "cookie name")),
    "request.url:get": () => stagedRequest.url,
    "request.url:set": ([value]) => {
      stagedRequest.url = requireUrl(value)
    },
    "request.method:get": () => stagedRequest.method,
    "request.method:set": ([value]) => {
      const method = requireString(value, "request.method") as Method
      if (!METHODS.has(method)) throw apiError(`unsupported method "${method}"`)
      stagedRequest.method = method
    },
    "request.headers.get": ([value]) => {
      const name = requireString(value, "header name").toLowerCase()
      const match = Object.entries(stagedRequest.headers).find(
        ([key]) => key.toLowerCase() === name,
      )
      return match?.[1] ?? null
    },
    "request.headers.has": ([value]) => {
      const name = requireString(value, "header name").toLowerCase()
      return Object.keys(stagedRequest.headers).some(
        (key) => key.toLowerCase() === name,
      )
    },
    "request.headers.set": ([nameValue, headerValue]) => {
      const name = requireString(nameValue, "header name")
      const value = requireString(headerValue, "header value")
      for (const secret of sensitiveHeaderValues({ [name]: value })) {
        secretValues.add(secret)
      }
      const lower = name.toLowerCase()
      const entries = Object.entries(stagedRequest.headers)
      const first = entries.findIndex(([key]) => key.toLowerCase() === lower)
      stagedRequest.headers = Object.fromEntries(
        first < 0
          ? [...entries, [name, value]]
          : entries.flatMap(([key, current], index) =>
              key.toLowerCase() !== lower
                ? [[key, current]]
                : index === first
                  ? [[key, value]]
                  : [],
            ),
      )
    },
    "request.headers.delete": ([value]) => {
      const name = requireString(value, "header name").toLowerCase()
      stagedRequest.headers = Object.fromEntries(
        Object.entries(stagedRequest.headers).filter(
          ([key]) => key.toLowerCase() !== name,
        ),
      )
    },
    "request.params.get": ([value]) => {
      const name = requireString(value, "parameter name")
      return (
        stagedRequest.params.find(
          (entry) => entry.enabled && entry.name === name,
        )?.value ?? null
      )
    },
    "request.params.getAll": ([value]) => {
      const name = requireString(value, "parameter name")
      return stagedRequest.params
        .filter((entry) => entry.enabled && entry.name === name)
        .map((entry) => entry.value)
    },
    "request.params.set": ([nameValue, paramValue]) => {
      const name = requireString(nameValue, "parameter name")
      const value = requireString(paramValue, "parameter value")
      const first = stagedRequest.params.findIndex(
        (entry) => entry.enabled && entry.name === name,
      )
      if (first < 0) {
        stagedRequest.params.push({ name, value, enabled: true })
        return
      }
      stagedRequest.params = stagedRequest.params.flatMap((entry, index) =>
        !entry.enabled || entry.name !== name
          ? [entry]
          : index === first
            ? [{ name, value, enabled: true }]
            : [],
      )
    },
    "request.params.append": ([nameValue, paramValue]) => {
      stagedRequest.params.push({
        name: requireString(nameValue, "parameter name"),
        value: requireString(paramValue, "parameter value"),
        enabled: true,
      })
    },
    "request.params.delete": ([value]) => {
      const name = requireString(value, "parameter name")
      stagedRequest.params = stagedRequest.params.filter(
        (entry) => !entry.enabled || entry.name !== name,
      )
    },
    "request.body.text": () => textualBody(),
    "request.body.json": () => {
      const body = textualBody()
      if (body === null) throw apiError("request body is not textual")
      try {
        return validateJson(JSON.parse(body))
      } catch (error) {
        if (error instanceof ScriptApiValidationError) throw error
        throw apiError("request body is not valid JSON")
      }
    },
    "request.body.setText": ([value]) => {
      stagedRequest.body = requireString(value, "body text")
      stagedRequest.bodyType = undefined
      clearIncompatibleBody()
    },
    "request.body.setJson": ([value]) => {
      stagedRequest.body = JSON.stringify(validateJson(value))
      stagedRequest.bodyType = "json"
      clearIncompatibleBody()
    },
    "request.body.clear": () => {
      stagedRequest.body = undefined
      stagedRequest.bodyType = "none"
      clearIncompatibleBody()
    },
    "request.auth.clear": () => {
      stagedRequest.auth = { type: "none" }
    },
    "request.auth.setBearer": ([value]) => {
      const token = requireString(value, "bearer token")
      secretValues.add(token)
      stagedRequest.auth = { type: "bearer", token }
    },
    "request.auth.setBasic": ([userValue, passValue]) => {
      const user = requireString(userValue, "basic username")
      secretValues.add(user)
      const pass = requireString(passValue, "basic password")
      secretValues.add(pass)
      stagedRequest.auth = { type: "basic", user, pass }
    },
    "request.auth.setApiKey": ([keyValue, secretValue, placementValue]) => {
      const key = requireString(keyValue, "API-key name")
      const value = requireString(secretValue, "API-key value")
      secretValues.add(value)
      const placement = requireString(placementValue, "API-key placement")
      if (placement !== "header" && placement !== "query") {
        throw apiError('API-key placement must be "header" or "query"')
      }
      stagedRequest.auth = { type: "api_key", key, value, placement }
    },
    "env.get": ([value]) => {
      const name = requireName(value)
      const result =
        environment && Object.hasOwn(environment.vars, name)
          ? environment.vars[name]
          : undefined
      if (
        result !== undefined &&
        Object.hasOwn(environment?.secretVars ?? {}, name)
      ) {
        secretValues.add(result)
      }
      return result
    },
    "run.get": ([nameValue]) => {
      const name = requireName(nameValue)
      const value = stagedScope.get(name)
      for (const secret of stagedScope.secretValuesFor(name)) {
        secretValues.add(typeof secret === "string" ? secret : secret.value)
      }
      return value
    },
    "run.set": ([nameValue, value, options]) => {
      const name = requireName(nameValue)
      const validated = validateJson(value)
      stagePersistence(name, options, validated)
      stagedScope.set(name, validated, containsSecret(validated, secretValues))
    },
    "run.unset": ([value, options]) => {
      const name = requireName(value)
      stagePersistence(name, options)
      if (options !== undefined) stagedScope.suppress(name)
      else stagedScope.unset(name)
    },
    "crypto.sha256": ([value, encodingValue]) =>
      createHash("sha256")
        .update(requireString(value, "hash input"), "utf8")
        .digest(requireEncoding(encodingValue)),
    "crypto.hmacSha256": ([secretValue, value, encodingValue]) => {
      const secret = requireString(secretValue, "HMAC secret")
      secretValues.add(secret)
      return createHmac("sha256", secret)
        .update(requireString(value, "HMAC input"), "utf8")
        .digest(requireEncoding(encodingValue))
    },
    "crypto.randomBytes": ([sizeValue, encodingValue]) => {
      if (
        typeof sizeValue !== "number" ||
        !Number.isInteger(sizeValue) ||
        sizeValue < 0 ||
        sizeValue > SCRIPT_LIMITS.randomBytes
      )
        throw apiError(
          `random byte size must be an integer from 0 through ${SCRIPT_LIMITS.randomBytes}`,
        )
      const value = randomBytes(sizeValue).toString(
        requireEncoding(encodingValue),
      )
      secretValues.add(value)
      return value
    },
    ...Object.fromEntries(
      (["log", "info", "warn", "error"] as const).map((level) => [
        `console.${level}`,
        ([messageValue, completeValue]: unknown[]) => {
          const complete = requireBoolean(completeValue, "console completion")
          if (
            consoleClosed ||
            (!openConsoleEntry &&
              (logs.length >= SCRIPT_LIMITS.consoleEntries ||
                consoleBytes >= SCRIPT_LIMITS.consoleBytes))
          )
            return false
          const message = requireString(messageValue, "console message")
          const remaining = SCRIPT_LIMITS.consoleBytes - consoleBytes
          const retained = truncateUtf8(message, remaining)
          consoleClosed = byteLength(retained) < byteLength(message)
          if (openConsoleEntry) openConsoleEntry.message += retained
          else if (retained.length > 0 || message.length === 0) {
            openConsoleEntry = { level, message: retained }
            logs.push(openConsoleEntry)
          }
          consoleBytes += byteLength(retained)
          if (phase === "tests" && consoleClosed && openConsoleEntry) {
            if (byteLength(openConsoleEntry.message) < 11) logs.pop()
            else openConsoleEntry.message = "[TRUNCATED]"
          }
          if (complete || consoleClosed) openConsoleEntry = undefined
          return !consoleClosed
        },
      ]),
    ),
  }

  let context: QuickJSContext | undefined
  let normalizer: ReturnType<QuickJSContext["newFunction"]> | undefined
  let finishTests: ReturnType<QuickJSContext["newFunction"]> | undefined
  let scheduler: ScriptScheduler | undefined
  const responses: ScriptRequestResult[] = []
  try {
    const module = await quickJS()
    const runtime = module.newRuntime()
    try {
      runtime.setMemoryLimit(SCRIPT_LIMITS.runtimeMemoryBytes)
      runtime.setMaxStackSize(SCRIPT_LIMITS.stackBytes)
      runtime.removeModuleLoader()
      context = runtime.newContext()
      scheduler = new ScriptScheduler(
        context,
        SCRIPT_LIMITS.deadlineMs,
        SCRIPT_LIMITS.wallTimeMs,
        (error) => normalizeQuickJSError(context!, error, normalizer),
        options.signal,
        options.deadline,
      )
      scheduler.check()

      const bridge = context.newFunction(
        "__noodleBridge",
        (operation, payload, returnedValue) => {
          const operationName = context!.getString(operation)
          const payloadJson = context!.getString(payload)
          let response: BridgeResponse
          try {
            if (byteLength(payloadJson) > SCRIPT_LIMITS.bridgeValueBytes) {
              throw apiError(
                `bridged value exceeds ${SCRIPT_LIMITS.bridgeValueBytes} bytes`,
              )
            }
            const args = validateJson(JSON.parse(payloadJson))
            if (!Array.isArray(args)) throw apiError("invalid bridge arguments")
            if (
              operationName === "runRequest" ||
              operationName === "sendRequest"
            ) {
              if (phase === "tests")
                throw apiError("network calls are unavailable in tests")
              if (!options.execute)
                throw apiError("request execution is unavailable")
              if (args.length !== 1)
                throw apiError("request calls require exactly one argument")
              if (scheduler!.pending)
                throw apiError(
                  "await the previous request before starting another",
                )
              scheduler!.check()
              const deferred = context!.newPromise()
              const scope = stagedScope.fork()
              scope.rememberSecrets([...secretValues])
              // Start outside the VM slice so child execution is not charged to its parent.
              const task = Promise.resolve()
                .then(async () => {
                  let envelope: string
                  try {
                    const result = await options.execute!(
                      operationName === "runRequest" ? "saved" : "http",
                      args[0],
                      scope,
                      scheduler!.signal,
                      scheduler!.deadline,
                    )
                    const index = responses.length
                    responses.push(result)
                    const value = {
                      index,
                      failureCategories: result.failureCategories,
                      ...(result.error ? { error: result.error } : {}),
                      ...(result.execution
                        ? { execution: result.execution }
                        : {}),
                      ...(result.response
                        ? {
                            response: {
                              status: result.response.status,
                              statusText: result.response.statusText,
                              timeMs: result.response.timeMs,
                              headers: result.response.headers,
                            },
                          }
                        : {}),
                    }
                    envelope = JSON.stringify({
                      ok: true,
                      hasValue: true,
                      value,
                    })
                    if (byteLength(envelope) > SCRIPT_LIMITS.bridgeValueBytes)
                      throw apiError(
                        "request diagnostics exceed the bridged value limit",
                      )
                    if (
                      scheduler!.active &&
                      !scheduler!.signal.aborted &&
                      !result.failureCategories.length
                    )
                      stagedScope.merge(scope)
                  } catch (error) {
                    const normalized = normalizeHostError(error)
                    envelope = JSON.stringify({ ok: false, ...normalized })
                  } finally {
                    for (const secret of scope.secretValues())
                      secretValues.add(
                        typeof secret === "string" ? secret : secret.value,
                      )
                    runScope.rememberSecrets(scope.secretValues())
                  }
                  if (scheduler!.active && !scheduler!.signal.aborted) {
                    const value = context!.newString(envelope)
                    try {
                      deferred.resolve(value)
                    } finally {
                      value.dispose()
                    }
                  }
                })
                .catch((error) => {
                  scheduler!.hostFailure = normalizeHostError(error)
                })
                .finally(() => {
                  scheduler!.pending = undefined
                  deferred.dispose()
                })
              scheduler!.pending = task
              return deferred.handle
            }
            if (
              phase === "tests" &&
              (isRequestMutation(operationName) ||
                /^(?:run\.(?:set|unset)|cookies\.(?:set|delete)|(?:response|env)\..*:set)$/.test(
                  operationName,
                ))
            )
              throw apiError(
                `${operationName.split(".")[0]} is read-only in tests`,
              )
            if (phase === "post" && isRequestMutation(operationName))
              throw apiError("request is read-only in post-response scripts")
            if (
              (operationName === "response.text" && phase !== "pre") ||
              operationName === "requests.text"
            ) {
              const bodyResponse =
                operationName === "requests.text"
                  ? typeof args[0] === "number" && Number.isSafeInteger(args[0])
                    ? responses[args[0]]?.response
                    : undefined
                  : post?.response
              if (!bodyResponse) throw apiError("response is unavailable")
              if (
                bodyResponse.bodyKind === "binary" &&
                responseByteSize(bodyResponse) > SCRIPT_LIMITS.responseBodyBytes
              ) {
                return {
                  error: context!.newError({
                    name: "ScriptApiValidationError",
                    message: `response body exceeds ${SCRIPT_LIMITS.responseBodyBytes} bytes`,
                  }),
                }
              }
              const body = responseText(bodyResponse)
              if (
                Buffer.byteLength(body, "utf8") >
                SCRIPT_LIMITS.responseBodyBytes
              )
                return {
                  error: context!.newError({
                    name: "ScriptApiValidationError",
                    message: `response body exceeds ${SCRIPT_LIMITS.responseBodyBytes} bytes`,
                  }),
                }
              return context!.newString(body)
            }
            if (operationName.startsWith("tests.") && phase !== "tests")
              throw apiError("test API is only available in tests")
            if (operationName === "tests.isPromise") {
              const state = context!.getPromiseState(returnedValue!)
              const isPromise = state.type !== "fulfilled" || !state.notAPromise
              if (state.type === "fulfilled" && !state.notAPromise)
                state.value.dispose()
              else if (state.type === "rejected") state.error.dispose()
              return context!.newString(
                JSON.stringify({ ok: true, hasValue: true, value: isPromise }),
              )
            }
            const handler = handlers[operationName]
            if (!handler)
              throw apiError(`unknown API operation "${operationName}"`)
            const value = handler(args)
            if (value === undefined) response = { ok: true, hasValue: false }
            else
              response = {
                ok: true,
                hasValue: true,
                value: validateJson(value),
              }
          } catch (error) {
            const normalized =
              error instanceof ScriptApiValidationError ||
              error instanceof CookieValidationError
                ? normalizeHostError(error)
                : {
                    name: "ScriptRuntimeError",
                    message: "Script API call failed",
                  }
            response = {
              ok: false,
              name:
                error instanceof CookieValidationError
                  ? "ScriptApiValidationError"
                  : normalized.name,
              message: normalized.message,
            }
          }
          const responseJson = JSON.stringify(response)
          if (byteLength(responseJson) > SCRIPT_LIMITS.bridgeValueBytes) {
            return context!.newString(
              JSON.stringify({
                ok: false,
                name: "ScriptApiValidationError",
                message: `bridged value exceeds ${SCRIPT_LIMITS.bridgeValueBytes} bytes`,
              }),
            )
          }
          return context!.newString(responseJson)
        },
      )
      context.setProp(context.global, "__noodleBridge", bridge)
      bridge.dispose()

      const bootstrap = scheduler.run(() =>
        context!.evalCode(
          bootstrapSource(
            SCRIPT_API_CONTRACT.filter((descriptor) => {
              const namespace = descriptor.member.split(".")[0]
              return (
                (descriptor.global === "noodle" ||
                  descriptor.global === "console") &&
                (!(namespace === "runRequest" || namespace === "sendRequest") ||
                  phase !== "tests") &&
                (namespace !== "response" || phase !== "pre") &&
                (namespace !== "cookies" || cookies)
              )
            }),
            filename,
            phase === "tests",
          ),
          "noodle-script-api.js",
          { type: "global" },
        ),
      )
      if (bootstrap.error) {
        bootstrap.error.dispose()
        return failure({
          name: "ScriptRuntimeError",
          message: "Failed to initialize the script sandbox",
        })
      }
      bootstrap.value!.dispose()
      normalizer = context.getProp(context.global, "__noodleNormalizeThrown")
      if (phase === "tests")
        finishTests = context.getProp(context.global, "__noodleFinishTests")
      context
        .evalCode(
          "delete globalThis.__noodleNormalizeThrown; delete globalThis.__noodleFinishTests",
          "noodle-script-api.js",
        )
        .unwrap()
        .dispose()

      await scheduler.evaluate(source, filename, finishTests)
      scheduler.check()
      if (testLimitError) return failure(testLimitError)
      if (phase === "tests")
        return {
          request,
          tests: [...testResults]
            .sort(([a], [b]) => a - b)
            .map(([, value]) => value),
          secretValues: [...secretValues],
          result: baseResult(phase, true, performance.now() - startedAt, logs),
        }
      if (phase === "pre") validatePreparedRequest(stagedRequest)
      const commitRun = () => {
        for (const intent of persistenceIntents.values()) {
          if (intent.target === "secret" && intent.operation === "set")
            runScope.rememberSecrets(secretRedactionValues(intent.value))
        }
        runScope.merge(stagedScope, (value) =>
          containsSecret(value, secretValues),
        )
      }
      if (cookies) cookies.commit(commitRun)
      else commitRun()
      return {
        request: stagedRequest,
        secretValues: [...secretValues],
        ...(persistenceIntents.size
          ? { persistenceIntents: [...persistenceIntents.values()] }
          : {}),
        result: {
          ...baseResult(phase, true, performance.now() - startedAt, logs),
          ...(options.requests?.length ? { requests: options.requests } : {}),
        },
      }
    } finally {
      scheduler?.dispose()
      await scheduler?.pending
      finishTests?.dispose()
      normalizer?.dispose()
      context?.dispose()
      runtime.dispose()
    }
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Script cancelled", "AbortError")
    const classified = classifyScriptError(
      error instanceof ScriptEvaluationError
        ? error.diagnostic
        : normalizeHostError(error),
      false,
      label,
    )
    return failure(
      classified.name === "ScriptRuntimeError" &&
        !(error instanceof ScriptEvaluationError)
        ? {
            name: "ScriptRuntimeError",
            message: `${label} script execution failed`,
          }
        : classified,
    )
  }
}

function isRequestMutation(operation: string): boolean {
  return (
    operation.startsWith("request.") &&
    !/(?::get|\.(?:get|getAll|has|text|json))$/.test(operation)
  )
}

type BridgeResponse =
  | { ok: true; hasValue: false }
  | { ok: true; hasValue: true; value: JsonValue }
  | { ok: false; name: string; message: string }

class ScriptApiValidationError extends Error {
  override name = "ScriptApiValidationError"
}

function apiError(message: string): ScriptApiValidationError {
  return new ScriptApiValidationError(message)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw apiError(`${label} must be a string`)
  return value
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw apiError(`${label} must be a boolean`)
  return value
}

function requireEncoding(value: unknown): "hex" | "base64" {
  if (value !== "hex" && value !== "base64") {
    throw apiError('encoding must be exactly "hex" or "base64"')
  }
  return value
}

function requireUrl(value: unknown): string {
  const url = requireString(value, "request.url")
  try {
    new URL(withDefaultHttpsScheme(url))
  } catch {
    throw apiError("request.url must be a valid HTTP or HTTPS URL")
  }
  return url
}

function validateJson(value: unknown): JsonValue {
  const seen = new Set<object>()
  const visit = (current: unknown, depth: number): JsonValue => {
    if (depth > SCRIPT_LIMITS.bridgeJsonDepth) {
      throw apiError(`JSON depth exceeds ${SCRIPT_LIMITS.bridgeJsonDepth}`)
    }
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    )
      return current
    if (typeof current === "number") {
      if (!Number.isFinite(current))
        throw apiError("JSON numbers must be finite")
      return current
    }
    if (typeof current !== "object") {
      throw apiError("value must be JSON-compatible")
    }
    if (seen.has(current)) throw apiError("JSON value must not contain cycles")
    const prototype = Object.getPrototypeOf(current)
    if (
      (Array.isArray(current) && prototype !== Array.prototype) ||
      (!Array.isArray(current) &&
        prototype !== Object.prototype &&
        prototype !== null)
    ) {
      throw apiError("JSON objects must have a plain or null prototype")
    }
    seen.add(current)
    let result: JsonValue
    if (Array.isArray(current)) {
      const values = new Map<number, unknown>()
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === "symbol") {
          throw apiError("JSON values must not contain symbol keys")
        }
        if (key === "length") continue
        if (UNSAFE_KEYS.has(key)) throw apiError(`unsafe JSON key "${key}"`)
        const index = Number(key)
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= current.length ||
          String(index) !== key
        ) {
          throw apiError("JSON arrays must not contain extra properties")
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw apiError("JSON array members must be enumerable data values")
        }
        if (descriptor.value === undefined) {
          throw apiError("JSON array members must not be undefined")
        }
        values.set(index, descriptor.value)
      }
      result = []
      for (let index = 0; index < current.length; index++) {
        if (!values.has(index)) {
          throw apiError("JSON array members must not be undefined")
        }
        result.push(visit(values.get(index), depth + 1))
      }
    } else {
      const object: Record<string, JsonValue> = Object.create(null)
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key === "symbol") {
          throw apiError("JSON values must not contain symbol keys")
        }
        if (UNSAFE_KEYS.has(key)) throw apiError(`unsafe JSON key "${key}"`)
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw apiError("JSON object members must be enumerable data values")
        }
        const item = descriptor.value
        if (item === undefined)
          throw apiError("JSON object members must not be undefined")
        Object.defineProperty(object, key, {
          value: visit(item, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      result = object
    }
    seen.delete(current)
    return result
  }
  const validated = visit(value, 0)
  if (byteLength(JSON.stringify(validated)) > SCRIPT_LIMITS.bridgeValueBytes) {
    throw apiError(
      `bridged value exceeds ${SCRIPT_LIMITS.bridgeValueBytes} bytes`,
    )
  }
  return validated
}

export function validatePreparedRequest(request: SubstitutedRequest): void {
  requireUrl(request.url)
  if (!METHODS.has(request.method)) throw apiError("request.method is invalid")
  for (const [name, value] of Object.entries(request.headers)) {
    requireString(name, "header name")
    requireString(value, "header value")
  }
  for (const parameter of request.params) {
    requireString(parameter.name, "parameter name")
    requireString(parameter.value, "parameter value")
  }
}

function baseResult(
  phase: ScriptPhase,
  success: boolean,
  durationMs: number,
  logs: ScriptLog[],
  error?: ScriptExecutionError,
): ScriptExecutionResult {
  return {
    phase,
    scope: "request",
    sourceKind: "inline",
    success,
    durationMs: Math.max(0, Math.round(durationMs * 100) / 100),
    logs,
    ...(error ? { error } : {}),
  }
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength
}

function containsSecret(
  value: JsonValue,
  secrets: ReadonlySet<string>,
): boolean {
  const serialized = typeof value === "string" ? value : JSON.stringify(value)
  return [...secrets].some(
    (secret) => secret.length > 0 && serialized.includes(secret),
  )
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value
  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (byteLength(value.slice(0, middle)) <= maxBytes) low = middle
    else high = middle - 1
  }
  return value.slice(0, low)
}

function normalizeHostError(error: unknown): ScriptExecutionError {
  if (error instanceof Error) {
    return {
      name: cleanErrorText(error.name, "Error"),
      message: cleanErrorText(error.message, "Script execution failed"),
    }
  }
  return {
    name: "Error",
    message: cleanErrorText(String(error), "Script execution failed"),
  }
}

function cleanErrorText(value: string, fallback: string): string {
  const cleaned = value.replace(/[\r\n\0]/g, " ").trim()
  return truncateUtf8(cleaned || fallback, 4096)
}

function normalizeQuickJSError(
  context: QuickJSContext,
  error: Parameters<QuickJSContext["dump"]>[0],
  normalizer?: Parameters<QuickJSContext["callFunction"]>[0],
): ScriptExecutionError {
  if (!normalizer) {
    const dumped = context.dump(error) as {
      name?: unknown
      message?: unknown
      stack?: unknown
    }
    return normalizedGuestParts(dumped.name, dumped.message, dumped.stack)
  }
  const result = context.callFunction(normalizer, context.undefined, error)
  if (result.error) {
    result.error.dispose()
    return { name: "ScriptRuntimeError", message: "Script execution failed" }
  }
  const json = context.getString(result.value!)
  result.value!.dispose()
  try {
    const parsed = JSON.parse(json) as {
      name?: unknown
      message?: unknown
      stack?: unknown
    }
    return normalizedGuestParts(parsed.name, parsed.message, parsed.stack)
  } catch {
    return { name: "ScriptRuntimeError", message: "Script execution failed" }
  }
}

function normalizedGuestParts(
  name: unknown,
  message: unknown,
  stack: unknown,
): ScriptExecutionError {
  const result: ScriptExecutionError = {
    name: cleanErrorText(typeof name === "string" ? name : "Error", "Error"),
    message: cleanErrorText(
      typeof message === "string" ? message : "Script execution failed",
      "Script execution failed",
    ),
  }
  if (typeof stack === "string") {
    const location =
      /(?:pre-request|post-response|tests)\.js:(\d+)(?::(\d+))?/.exec(stack)
    if (location) {
      result.line = Number(location[1])
      if (location[2]) result.column = Number(location[2])
      if (
        result.line === 1 &&
        result.column &&
        result.column > SCRIPT_WRAPPER_PREFIX.length
      )
        result.column -= SCRIPT_WRAPPER_PREFIX.length
    }
  }
  return result
}

function classifyScriptError(
  error: ScriptExecutionError,
  deadlineExpired: boolean,
  label: string,
): ScriptExecutionError {
  const text = `${error.name} ${error.message}`.toLowerCase()
  if (deadlineExpired || text.includes("interrupted")) {
    return {
      name: "ScriptTimeoutError",
      message: `${label} script exceeded the ${SCRIPT_LIMITS.deadlineMs} ms deadline`,
    }
  }
  if (text.includes("out of memory") || text.includes("memory limit")) {
    return {
      name: "ScriptMemoryLimitError",
      message: `${label} script exceeded its memory limit`,
    }
  }
  if (text.includes("stack overflow") || text.includes("stack limit")) {
    return {
      name: "ScriptStackLimitError",
      message: `${label} script exceeded its stack limit`,
    }
  }
  if (error.name === "SyntaxError") {
    return { ...error, name: "ScriptSyntaxError" }
  }
  if (error.name === "ScriptApiValidationError") return error
  if (
    [
      "ScriptRequestError",
      "ScriptWallTimeoutError",
      "ScriptPendingOperationError",
      "ScriptPendingPromiseError",
      "ScriptTimeoutError",
    ].includes(error.name)
  )
    return error
  return { ...error, name: "ScriptRuntimeError" }
}

function bootstrapSource(
  contract: readonly ScriptApiDescriptor[],
  filename: string,
  tests = false,
): string {
  const shape = contract.map(({ global, member, kind }) => ({
    global,
    member,
    kind,
    container: contract.some(
      (candidate) =>
        candidate.global === global &&
        candidate.member.startsWith(`${member}.`),
    ),
  }))
  return `
(() => {
  "use strict";
  const bridge = globalThis.__noodleBridge;
  const ArrayCtor = Array;
  const ErrorCtor = Error;
  const NumberCtor = Number;
  const ObjectCtor = Object;
  const RegExpCtor = RegExp;
  const SetCtor = Set;
  const StringCtor = String;
  const SyntaxErrorCtor = SyntaxError;
  const PromiseCtor = Promise;
  const arrayPrototype = ArrayCtor.prototype;
  const objectPrototype = ObjectCtor.prototype;
  const uncurry = (fn) => Function.prototype.call.bind(fn);
  const arrayIsArray = ArrayCtor.isArray;
  const arrayJoin = uncurry(arrayPrototype.join);
  const arrayMap = uncurry(arrayPrototype.map);
  const arrayPush = uncurry(arrayPrototype.push);
  const getOwnPropertyDescriptor = ObjectCtor.getOwnPropertyDescriptor;
  const getPrototypeOf = ObjectCtor.getPrototypeOf;
  const hasOwn = uncurry(objectPrototype.hasOwnProperty);
  const jsonParse = JSON.parse;
  const jsonStringify = JSON.stringify;
  const numberIsFinite = NumberCtor.isFinite;
  const numberIsSafeInteger = NumberCtor.isSafeInteger;
  const objectCreate = ObjectCtor.create;
  const objectDefineProperty = ObjectCtor.defineProperty;
  const objectEntries = ObjectCtor.entries;
  const objectFreeze = ObjectCtor.freeze;
  const objectIs = ObjectCtor.is;
  const objectSetPrototypeOf = ObjectCtor.setPrototypeOf;
  const arrayPop = uncurry(arrayPrototype.pop);
  const stringTrim = uncurry(StringCtor.prototype.trim);
  const stringLower = uncurry(StringCtor.prototype.toLowerCase);
  const promiseThen = uncurry(PromiseCtor.prototype.then);
  const promiseResolve = PromiseCtor.resolve.bind(PromiseCtor);
  const regexpPrototype = RegExpCtor.prototype;
  const regexpSource = uncurry(getOwnPropertyDescriptor(regexpPrototype, "source").get);
  const regexpFlags = [];
  for (const [flag, name] of [["d", "hasIndices"], ["g", "global"], ["i", "ignoreCase"], ["m", "multiline"], ["s", "dotAll"], ["u", "unicode"], ["v", "unicodeSets"], ["y", "sticky"]]) {
    const getter = getOwnPropertyDescriptor(regexpPrototype, name)?.get;
    if (getter) arrayPush(regexpFlags, [flag, uncurry(getter)]);
  }
  const objectKeys = ObjectCtor.keys;
  const ownKeys = Reflect.ownKeys;
  const setAdd = uncurry(SetCtor.prototype.add);
  const setDelete = uncurry(SetCtor.prototype.delete);
  const setHas = uncurry(SetCtor.prototype.has);
  const stringSlice = uncurry(StringCtor.prototype.slice);
  const stringCharCodeAt = uncurry(StringCtor.prototype.charCodeAt);
  const stringIndexOf = uncurry(StringCtor.prototype.indexOf);
  const regexpExec = uncurry(RegExpCtor.prototype.exec);
  const locationPattern = /(?:pre-request|post-response|tests)\\.js:(\\d+)(?::(\\d+))?/;
  const forbidden = ["Bun", "process", "require", "module", "Deno", "fetch", "WebSocket", "Worker", "setTimeout", "setInterval", "setImmediate", "queueMicrotask"];
  for (const name of forbidden) { try { delete globalThis[name]; } catch {} }
  const unsafe = new SetCtor(["__proto__", "prototype", "constructor"]);
  const utf8ByteLength = (value) => {
    let bytes = 0;
    for (let index = 0; index < value.length; index++) {
      const code = stringCharCodeAt(value, index);
      if (code <= 0x7f) bytes++;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const next = stringCharCodeAt(value, index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          index++;
        } else bytes += 3;
      } else bytes += 3;
      if (bytes > ${SCRIPT_LIMITS.bridgeValueBytes}) return bytes;
    }
    return bytes;
  };
  const copyJson = (value) => {
    const seen = new SetCtor();
    const visit = (item, depth) => {
      if (depth > ${SCRIPT_LIMITS.bridgeJsonDepth}) throw apiError("JSON depth exceeds ${SCRIPT_LIMITS.bridgeJsonDepth}");
      if (item === null || typeof item === "string" || typeof item === "boolean") return item;
      if (typeof item === "number") {
        if (!numberIsFinite(item)) throw apiError("JSON numbers must be finite");
        return item;
      }
      if (typeof item !== "object") throw apiError("value must be JSON-compatible");
      if (setHas(seen, item)) throw apiError("JSON value must not contain cycles");
      const isArray = arrayIsArray(item);
      const prototype = getPrototypeOf(item);
      if ((isArray && prototype !== arrayPrototype) || (!isArray && prototype !== objectPrototype && prototype !== null)) {
        throw apiError("JSON objects must have a plain or null prototype");
      }
      setAdd(seen, item);
      const output = isArray ? objectSetPrototypeOf([], null) : objectCreate(null);
      if (isArray) {
        const values = objectCreate(null);
        const keys = ownKeys(item);
        for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
          const key = keys[keyIndex];
          if (typeof key === "symbol") throw apiError("JSON values must not contain symbol keys");
          if (key === "length") continue;
          if (setHas(unsafe, key)) throw apiError('unsafe JSON key "' + key + '"');
          const index = NumberCtor(key);
          if (!numberIsSafeInteger(index) || index < 0 || index >= item.length || StringCtor(index) !== key) {
            throw apiError("JSON arrays must not contain extra properties");
          }
          const descriptor = getOwnPropertyDescriptor(item, key);
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
            throw apiError("JSON array members must be enumerable data values");
          }
          if (descriptor.value === undefined) throw apiError("JSON array members must not be undefined");
          objectDefineProperty(values, key, { value: descriptor.value, enumerable: true });
        }
        for (let index = 0; index < item.length; index++) {
          if (!hasOwn(values, index)) {
            throw apiError("JSON array members must not be undefined");
          }
          arrayPush(output, visit(values[index], depth + 1));
        }
      } else {
        const keys = ownKeys(item);
        for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
          const key = keys[keyIndex];
          if (typeof key === "symbol") throw apiError("JSON values must not contain symbol keys");
          if (setHas(unsafe, key)) throw apiError('unsafe JSON key "' + key + '"');
          const descriptor = getOwnPropertyDescriptor(item, key);
          if (!descriptor.enumerable || !("value" in descriptor)) {
            throw apiError("JSON object members must be enumerable data values");
          }
          if (descriptor.value === undefined) throw apiError("JSON object members must not be undefined");
          output[key] = visit(descriptor.value, depth + 1);
        }
      }
      setDelete(seen, item);
      return output;
    };
    return visit(value, 0);
  };
  const encode = (value) => {
    const serialized = jsonStringify(copyJson(value));
    if (utf8ByteLength(serialized) > ${SCRIPT_LIMITS.bridgeValueBytes}) {
      throw apiError("bridged value exceeds ${SCRIPT_LIMITS.bridgeValueBytes} bytes");
    }
    return serialized;
  };
  const apiError = (message) => {
    const error = new ErrorCtor(message);
    error.name = "ScriptApiValidationError";
    return error;
  };
  const decode = (encoded) => {
    const response = jsonParse(encoded);
    if (!response.ok) {
      const error = new ErrorCtor(response.message);
      error.name = response.name;
      throw error;
    }
    return response.hasValue ? response.value : undefined;
  };
  const call = (operation, args) => decode(bridge(operation, encode(args)));
  let textCached = false;
  let responseText;
  let jsonState = "empty";
  let responseJson;
  let responseJsonError;
  const readResponseText = () => {
    if (!textCached) {
      responseText = bridge("response.text", "[]");
      textCached = true;
    }
    return responseText;
  };
  const freezeJson = (value) => {
    const pending = [value];
    while (pending.length) {
      const item = arrayPop(pending);
      if (item === null || typeof item !== "object") continue;
      const keys = objectKeys(item);
      for (let i = 0; i < keys.length; i++) arrayPush(pending, item[keys[i]]);
      objectFreeze(item);
    }
    return value;
  };
  const callRequest = async (operation, args) => {
    const result = decode(await bridge(operation, encode(args)));
    let response;
    if (result.response) {
      const metadata = result.response;
      const headers = objectCreate(null);
      const getHeader = (name) => {
        if (typeof name !== "string") throw apiError("header name must be a string");
        const wanted = stringLower(name);
        const keys = objectKeys(metadata.headers);
        for (let i = 0; i < keys.length; i++) if (stringLower(keys[i]) === wanted) return metadata.headers[keys[i]];
        return null;
      };
      headers.get = objectFreeze(getHeader);
      headers.has = objectFreeze((name) => getHeader(name) !== null);
      let text, cachedText = false, parsed = false, json, jsonError;
      const readText = () => {
        if (!cachedText) { text = bridge("requests.text", encode([result.index])); cachedText = true; }
        return text;
      };
      const readJson = () => {
        if (!parsed) {
          const body = readText();
          try { json = freezeJson(jsonParse(body)); }
          catch (error) {
            jsonError = error instanceof SyntaxErrorCtor ? apiError("response body is not valid JSON") : error === null ? new ErrorCtor("response JSON exceeded its memory limit") : error;
          }
          parsed = true;
        }
        if (jsonError) throw jsonError;
        return json;
      };
      response = objectCreate(null);
      response.status = metadata.status;
      response.statusText = metadata.statusText;
      response.timeMs = metadata.timeMs;
      response.headers = objectFreeze(headers);
      response.text = objectFreeze(readText);
      response.json = objectFreeze(readJson);
      if (result.execution) response.execution = freezeJson(result.execution);
      objectFreeze(response);
    }
    if (result.failureCategories.length) {
      const error = new ErrorCtor(result.error ? result.error.message : "Called request failed");
      error.name = "ScriptRequestError";
      error.failureCategories = freezeJson(result.failureCategories);
      if (response) error.response = response;
      if (result.execution) error.execution = freezeJson(result.execution);
      throw error;
    }
    return response;
  };
  const readResponseJson = () => {
    if (jsonState === "empty") {
      const text = readResponseText();
      try { responseJson = jsonParse(text); if (${tests}) freezeJson(responseJson); jsonState = "parsed"; }
      catch (error) {
        // QuickJS can throw null when native parsing cannot allocate its error.
        if (error === null) jsonState = "memory";
        else if (!(error instanceof SyntaxErrorCtor)) { responseJsonError = error; jsonState = "resource"; }
        else jsonState = "failed";
      }
    }
    if (jsonState === "memory") throw new ErrorCtor("response JSON exceeded its memory limit");
    if (jsonState === "resource") throw responseJsonError;
    if (jsonState === "failed") throw apiError("response body is not valid JSON");
    return responseJson;
  };
  const callConsole = (operation, message) => {
    if (message.length === 0) {
      call(operation, ["", true]);
      return;
    }
    let start = 0;
    while (start < message.length) {
      let end = start + 32768;
      if (end > message.length) end = message.length;
      if (end < message.length) {
        const last = stringCharCodeAt(message, end - 1);
        const next = stringCharCodeAt(message, end);
        if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
      }
      if (call(operation, [stringSlice(message, start, end), end === message.length]) === false) return;
      start = end;
    }
  };
  const display = (value, depth, seen) => {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "undefined") return "undefined";
    if (typeof value === "bigint") return StringCtor(value) + "n";
    if (typeof value === "symbol") return "[Symbol]";
    if (typeof value === "function") return "[Function]";
    if (typeof value !== "object") return StringCtor(value);
    if (setHas(seen, value)) return "[Circular]";
    if (depth >= ${SCRIPT_LIMITS.consoleDepth}) return "[Object]";
    setAdd(seen, value);
    try {
      if (arrayIsArray(value)) return "[" + arrayJoin(arrayMap(value, (item) => display(item, depth + 1, seen)), ", ") + "]";
      const parts = [];
      const keys = objectKeys(value);
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        const key = keys[keyIndex];
        let item;
        try { item = display(value[key], depth + 1, seen); } catch { item = "[Unserializable]"; }
        arrayPush(parts, key + ": " + item);
      }
      return "{" + arrayJoin(parts, ", ") + "}";
    } catch { return "[Unserializable]"; }
    finally { setDelete(seen, value); }
  };
  const roots = objectCreate(null);
  const objects = [];
  const getObject = (globalName, path) => {
    let current = roots[globalName] ||= objectCreate(null);
    for (const part of path) {
      if (!hasOwn(current, part)) {
        const nested = objectCreate(null);
        objectDefineProperty(current, part, { value: nested, enumerable: true });
        arrayPush(objects, nested);
      }
      current = current[part];
    }
    return current;
  };
  for (const descriptor of ${JSON.stringify(shape)}) {
    if (descriptor.kind === "global") { getObject(descriptor.global, []); continue; }
    if (descriptor.kind === "property" && descriptor.container) {
      getObject(descriptor.global, descriptor.member.split("."));
      continue;
    }
    const parts = descriptor.member.split(".");
    const name = parts.pop();
    const parent = getObject(descriptor.global, parts);
    const operation = descriptor.global === "noodle" ? descriptor.member : descriptor.global + "." + descriptor.member;
    if (descriptor.kind === "property") {
      if (hasOwn(parent, name)) continue;
      objectDefineProperty(parent, name, {
        get: () => call(operation + ":get", []),
        set: (value) => call(operation + ":set", [value]),
        enumerable: true,
      });
    } else {
      const fn = descriptor.global === "console"
        ? (...values) => callConsole(operation, arrayJoin(arrayMap(values, (value) => display(value, 0, new SetCtor())), " "))
        : operation === "response.text" ? readResponseText
        : operation === "response.json" ? readResponseJson
        : operation === "runRequest" || operation === "sendRequest" ? (...args) => callRequest(operation, args)
        : (...args) => call(operation, args);
      if (operation.startsWith("random.") || operation.startsWith("time.") || operation === "runRequest" || operation === "sendRequest") objectFreeze(fn);
      objectDefineProperty(parent, name, { value: fn, enumerable: true });
    }
  }
  for (let index = objects.length - 1; index >= 0; index--) objectFreeze(objects[index]);
  for (const [name, object] of objectEntries(roots)) {
    objectFreeze(object);
    objectDefineProperty(globalThis, name, { value: object, enumerable: true });
  }
  const normalizeThrown = (value) => {
    const diagnosticText = (text) => {
      if (!${tests}) return stringSlice(text, 0, 4096);
      // Never retain a partial secret when a diagnostic cannot fit the bridge.
      try { return call("tests.clean", [text]); }
      catch { return "[TRUNCATED]"; }
    };
    const data = (name) => {
      let current = value;
      for (let depth = 0; current != null && depth < 8; depth++, current = getPrototypeOf(current)) {
        const descriptor = getOwnPropertyDescriptor(current, name);
        if (descriptor && hasOwn(descriptor, "value")) return descriptor.value;
      }
    };
    const type = typeof value;
    const primitive = value == null || (type !== "object" && type !== "function");
    const rawName = data("name");
    const rawMessage = data("message");
    const rawStack = data("stack");
    const locationStart = typeof rawStack === "string" ? stringIndexOf(rawStack, ${JSON.stringify(`${filename}:`)}) : -1;
    const locationText = locationStart >= 0 ? stringSlice(rawStack, locationStart, locationStart + 64) : "";
    const location = regexpExec(locationPattern, locationText);
    return jsonStringify({
      name: diagnosticText(typeof rawName === "string" ? rawName : "Error"),
      message: diagnosticText(typeof rawMessage === "string" ? rawMessage : primitive ? StringCtor(value) : "Script execution failed"),
      stack: location ? location[0] : "",
    });
  };
  globalThis.__noodleNormalizeThrown = normalizeThrown;
  ${tests ? testBootstrapSource : ""}
  delete globalThis.__noodleBridge;
})();`
}

// Evaluated inside the same bootstrap closure, with captured intrinsics and bridge.
const testBootstrapSource = String.raw`
  const boundedValue = (value, jsonOnly = false) => {
    if (!jsonOnly && (value === undefined || (typeof value === "number" && !numberIsFinite(value)))) return value;
    const copy = copyJson(value);
    if (utf8ByteLength(jsonStringify(copy)) > ${SCRIPT_LIMITS.bridgeValueBytes}) throw apiError("matcher value exceeds the 262144-byte limit");
    return copy;
  };
  const equal = (left, right) => {
    if (objectIs(left, right)) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (arrayIsArray(left) !== arrayIsArray(right)) return false;
    const keys = objectKeys(left);
    if (keys.length !== objectKeys(right).length) return false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!hasOwn(right, key) || !equal(left[key], right[key])) return false;
    }
    return true;
  };
  const match = (name, actual, expected) => {
    const value = boundedValue(actual, name === "toEqual" || (name === "toContain" && arrayIsArray(actual)));
    switch (name) {
      case "toBe": boundedValue(expected); return objectIs(actual, expected);
      case "toEqual": return equal(value, boundedValue(expected, true));
      case "toBeTruthy": return !!actual;
      case "toBeFalsy": return !actual;
      case "toBeDefined": return actual !== undefined;
      case "toBeNull": return actual === null;
      case "toContain": {
        if (typeof value === "string") {
          if (typeof expected !== "string") throw apiError("toContain requires a string substring for string values");
          boundedValue(expected);
          return stringIndexOf(value, expected) >= 0;
        }
        if (!arrayIsArray(value)) throw apiError("toContain requires a string or array");
        const wanted = boundedValue(expected, true);
        for (let i = 0; i < value.length; i++) if (equal(value[i], wanted)) return true;
        return false;
      }
      case "toMatch": {
        if (typeof value !== "string") throw apiError("toMatch requires a string actual value");
        let source, flags = "";
        if (typeof expected === "string") source = expected;
        else {
          if (expected === null || typeof expected !== "object" || getPrototypeOf(expected) !== regexpPrototype) throw apiError("toMatch requires a string pattern or RegExp");
          const keys = ownKeys(expected);
          for (let i = 0; i < keys.length; i++) if (keys[i] !== "lastIndex") throw apiError("RegExp patterns must not contain extra properties");
          source = regexpSource(expected);
          for (let i = 0; i < regexpFlags.length; i++) if (regexpFlags[i][1](expected)) flags += regexpFlags[i][0];
        }
        boundedValue(source);
        let regex;
        try { regex = new RegExpCtor(source, flags); }
        catch { throw apiError("toMatch received an invalid regular expression"); }
        return regexpExec(regex, value) !== null;
      }
      default: {
        if (typeof actual !== "number" || !numberIsFinite(actual) || typeof expected !== "number" || !numberIsFinite(expected)) throw apiError(name + " requires finite numbers on both sides");
        if (name === "toBeGreaterThan") return actual > expected;
        if (name === "toBeGreaterThanOrEqual") return actual >= expected;
        if (name === "toBeLessThan") return actual < expected;
        return actual <= expected;
      }
    }
  };
  const expectValue = (actual) => {
    const positive = objectCreate(null), negative = objectCreate(null);
    for (const [target, negated] of [[positive, false], [negative, true]]) {
      for (const name of ${JSON.stringify(TEST_MATCHERS)}) {
        objectDefineProperty(target, name, { enumerable: true, value: objectFreeze((expected) => {
          const passed = match(name, actual, expected);
          if (passed === negated) {
            const error = new ErrorCtor("Expected value " + (negated ? "not " : "") + "to satisfy " + name);
            error.name = "TestAssertionError";
            throw error;
          }
        }) });
      }
    }
    objectDefineProperty(positive, "not", { enumerable: true, value: negative });
    objectDefineProperty(negative, "not", { enumerable: true, value: positive });
    objectFreeze(negative);
    return objectFreeze(positive);
  };
  const pendingTests = [];
  const runTest = (name, callback) => {
    if (typeof name !== "string" || !stringTrim(name)) throw apiError("test name must be a non-empty string");
    if (typeof callback !== "function") throw apiError("test callback must be a function");
    const id = call("tests.start", [name]);
    const finish = (error, failed = false) => {
      let message = "Test passed";
      if (failed) {
        const normalized = jsonParse(normalizeThrown(error));
        if (regexpExec(/out of memory|memory limit|stack overflow|stack limit|interrupted/, normalized.message)) throw error;
        message = normalized.message;
      }
      call("tests.finish", [id, !failed, message]);
    };
    try {
      const returned = callback();
      const promise = jsonParse(bridge("tests.isPromise", "[]", returned)).value;
      if (promise || (returned != null && (typeof returned === "object" || typeof returned === "function") && typeof returned.then === "function")) {
        const pending = promiseThen(promise ? returned : promiseResolve(returned), () => finish(), (error) => finish(error, true));
        arrayPush(pendingTests, pending);
        return pending;
      }
    } catch (error) {
      finish(error, true);
      return;
    }
    finish();
  };
  globalThis.__noodleFinishTests = async () => {
    for (let i = 0; i < pendingTests.length; i++) await pendingTests[i];
  };
  objectDefineProperty(globalThis, "test", { value: objectFreeze(runTest), enumerable: true });
  objectDefineProperty(globalThis, "expect", { value: objectFreeze(expectValue), enumerable: true });
`
