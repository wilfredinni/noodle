import { evaluateAssertions, type AssertionResult } from "./assertions"
import type { Environment, JsonValue, Request, Response } from "./schema"
import type { ProxyPolicy } from "./proxy"
import type { TlsPolicy } from "./tls"
import { createResponseResolver, parseResponseExpression } from "./response"
import { evaluateCaptures, type CaptureResult, RunScope } from "./runScope"
import {
  environmentSecretValues,
  isSensitiveHeader,
  REDACTED,
  redactKnownSecrets,
} from "./secrets/redact"

export interface ExecutionResultGroup<T> {
  evaluated: boolean
  results: T[]
}

export interface ResponseExecutionResults {
  assertions?: ExecutionResultGroup<AssertionResult>
  captures?: ExecutionResultGroup<CaptureResult>
}

export function executionSecretValues(
  environments: (Environment | null | undefined)[],
  proxyPolicy?: ProxyPolicy,
  tlsPolicy?: TlsPolicy,
): string[] {
  return [
    ...environments.flatMap((environment) =>
      environmentSecretValues(environment),
    ),
    ...(proxyPolicy?.kind === "custom"
      ? Object.values(proxyPolicy.credentials ?? {})
      : []),
    ...Object.values(tlsPolicy?.passphrases ?? {}),
  ].filter((value): value is string => Boolean(value))
}

export function unevaluatedExecutionResults(
  request: Pick<Request, "assertions" | "captures">,
): ResponseExecutionResults {
  const hasCaptures = Object.values(request.captures ?? {}).some(
    (capture) => capture.enabled,
  )
  const hasAssertions = request.assertions?.some(
    (assertion) => assertion.enabled !== false,
  )
  return {
    ...(hasCaptures ? { captures: { evaluated: false, results: [] } } : {}),
    ...(hasAssertions ? { assertions: { evaluated: false, results: [] } } : {}),
  }
}

export function evaluateResponseExecution(
  request: Pick<Request, "assertions" | "captures">,
  response: Response,
  runScope: RunScope,
  secretValues: string[] = [],
  onRawCaptures?: (results: CaptureResult[]) => void,
): ResponseExecutionResults {
  const resolve = createResponseResolver(response)
  const redact = (value: string) =>
    redactKnownSecrets(value, [...secretValues, ...runScope.secretValues()])
  const hasCaptures = Object.values(request.captures ?? {}).some(
    (capture) => capture.enabled,
  )
  const hasAssertions = request.assertions?.some(
    (assertion) => assertion.enabled !== false,
  )
  const rawCaptures = hasCaptures
    ? evaluateCaptures(request.captures!, resolve)
    : undefined
  for (const result of rawCaptures ?? []) {
    if (result.success) {
      const parsed = parseResponseExpression(result.expression)
      const sensitive =
        request.captures?.[result.variable]?.persist === "secret" ||
        (parsed.kind === "header" && isSensitiveHeader(parsed.name))
      runScope.set(result.variable, result.value, sensitive)
    }
  }
  if (rawCaptures) onRawCaptures?.(rawCaptures)
  const captures = rawCaptures?.map((result): CaptureResult =>
    result.success
      ? {
          ...result,
          value:
            request.captures?.[result.variable]?.persist === "secret"
              ? REDACTED
              : redactExecutionValue(result.value, redact),
        }
      : { ...result, message: redact(result.message) },
  )
  const assertions = hasAssertions
    ? evaluateAssertions(request.assertions!, response, resolve).map(
        (result): AssertionResult => ({
          ...result,
          ...(Object.hasOwn(result, "expected")
            ? { expected: redactExecutionValue(result.expected!, redact) }
            : {}),
          ...(Object.hasOwn(result, "actual")
            ? { actual: redactExecutionValue(result.actual!, redact) }
            : {}),
          message: redact(result.message),
        }),
      )
    : undefined

  return {
    ...(captures ? { captures: { evaluated: true, results: captures } } : {}),
    ...(assertions
      ? { assertions: { evaluated: true, results: assertions } }
      : {}),
  }
}

export function redactExecutionValue(
  value: JsonValue,
  redact: (value: string) => string,
): JsonValue {
  if (typeof value === "string") return redact(value)
  if (Array.isArray(value)) {
    return value.map((item) => redactExecutionValue(item, redact))
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactExecutionValue(item, redact),
      ]),
    )
  }
  return value
}
