import { evaluateAssertions, type AssertionResult } from "./assertions"
import type { Environment, JsonValue, Request, Response } from "./schema"
import type { ProxyPolicy } from "./proxy"
import type { TlsPolicy } from "./tls"
import {
  createResponseResolver,
  parseResponseExpression,
  type ResponseExpression,
} from "./response"
import { evaluateCaptures, type CaptureResult, RunScope } from "./runScope"
import {
  environmentSecretValues,
  executionResultSecrets,
  isSensitiveHeader,
  REDACTED,
  redactKnownSecrets,
  type RedactionSecret,
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
): RedactionSecret[] {
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
  secretValues: RedactionSecret[] = [],
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
  const sensitiveExpressions: ResponseExpression[] = []
  for (const result of rawCaptures ?? []) {
    if (result.success) {
      const parsed = parseResponseExpression(result.expression)
      const sensitive =
        request.captures?.[result.variable]?.persist === "secret" ||
        (parsed.kind === "header" && isSensitiveHeader(parsed.name))
      runScope.set(result.variable, result.value, sensitive)
      if (sensitive) sensitiveExpressions.push(parsed)
    }
  }
  const isSensitiveExpression = (expression: string) => {
    const parsed = parseResponseExpression(expression)
    return sensitiveExpressions.some((sensitive) =>
      responseExpressionsOverlap(sensitive, parsed),
    )
  }
  const redactResult = (value: string) =>
    redactKnownSecrets(
      value,
      executionResultSecrets([...secretValues, ...runScope.secretValues()]),
    )
  if (rawCaptures) onRawCaptures?.(rawCaptures)
  const captures = rawCaptures?.map((result): CaptureResult =>
    result.success
      ? {
          ...result,
          value: isSensitiveExpression(result.expression)
            ? REDACTED
            : redactExecutionValue(result.value, redactResult),
        }
      : { ...result, message: redact(result.message) },
  )
  const assertions = hasAssertions
    ? evaluateAssertions(request.assertions!, response, resolve).map(
        (result) => {
          const sensitive = isSensitiveExpression(result.expression)
          return {
            ...result,
            ...(Object.hasOwn(result, "expected")
              ? {
                  expected: sensitive
                    ? REDACTED
                    : redactExecutionValue(result.expected!, redactResult),
                }
              : {}),
            ...(Object.hasOwn(result, "actual")
              ? {
                  actual: sensitive
                    ? REDACTED
                    : redactExecutionValue(result.actual!, redactResult),
                }
              : {}),
            message: redact(result.message),
          } as AssertionResult
        },
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
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value)
    const redacted = redact(serialized)
    return redacted === serialized ? value : redacted
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactExecutionValue(item, redact))
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      redactExecutionValue(item, redact),
    ]),
  )
}

function responseExpressionsOverlap(
  left: ResponseExpression,
  right: ResponseExpression,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === "header" && right.kind === "header") {
    return left.name.toLowerCase() === right.name.toLowerCase()
  }
  if (left.kind !== "body" || right.kind !== "body") return true
  const length = Math.min(left.path.length, right.path.length)
  for (let index = 0; index < length; index++) {
    const leftPart = left.path[index]!
    const rightPart = right.path[index]!
    if (leftPart.kind !== rightPart.kind) return false
    if (
      leftPart.kind === "property" &&
      rightPart.kind === "property" &&
      leftPart.name !== rightPart.name
    ) {
      return false
    }
    if (
      leftPart.kind === "index" &&
      rightPart.kind === "index" &&
      leftPart.index !== rightPart.index
    ) {
      return false
    }
  }
  return true
}
