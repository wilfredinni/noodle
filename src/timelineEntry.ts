import { randomUUID } from "node:crypto"
import type {
  Environment,
  NetworkError,
  Request,
  Response,
  TimelineEntry,
} from "./schema"
import type { ResponseExecutionResults } from "./executionResults"
import { redactExecutionValue } from "./executionResults"
import { interpolatePathParams } from "./requests/send"
import {
  environmentSecretValues,
  isSensitiveHeader,
  redactKnownSecrets,
  REDACTED,
  requestSensitiveValues,
} from "./secrets/redact"
import {
  replaceVariableReferences,
  variableReferences,
} from "./variableReference"

export type TimelineExecutionResult =
  | {
      status: "done"
      response: Response
      execution?: ResponseExecutionResults
    }
  | {
      status: "error"
      request?: Request
      error: Error
      execution?: ResponseExecutionResults
    }

function responseSize(body: string): number {
  return new TextEncoder().encode(body).length
}

export function buildTimelineEntry(
  req: Request,
  result: TimelineExecutionResult,
  envName?: string,
  environment?: Environment | null,
  settingsSecrets: string[] = [],
): TimelineEntry {
  const secretValues = [
    ...environmentSecretValues(environment),
    ...settingsSecrets,
  ]
  const resolvePublicVars = (value: string) =>
    environment
      ? replaceVariableReferences(value, (key) =>
          !Object.hasOwn(environment.secretVars ?? {}, key) &&
          Object.hasOwn(environment.vars, key)
            ? environment.vars[key]!
            : `$${key}`,
        )
      : replaceVariableReferences(value, (key) => `$${key}`)
  secretValues.push(
    ...requestSensitiveValues(req)
      .map(resolvePublicVars)
      .filter((value) => variableReferences(value).length === 0),
  )
  const redact = (value: string) => redactKnownSecrets(value, secretValues)
  const assertions = result.execution?.assertions
    ? {
        evaluated: result.execution.assertions.evaluated,
        results: result.execution.assertions.results.map((assertion) => ({
          ...assertion,
          ...(Object.hasOwn(assertion, "expected")
            ? {
                expected: redactExecutionValue(assertion.expected!, redact),
              }
            : {}),
          ...(Object.hasOwn(assertion, "actual")
            ? { actual: redactExecutionValue(assertion.actual!, redact) }
            : {}),
          message: redact(assertion.message),
        })),
      }
    : undefined
  let url = req.url
  try {
    url = interpolatePathParams(
      resolvePublicVars(req.url),
      (req.pathParams ?? []).map((param) => ({
        ...param,
        name: resolvePublicVars(param.name),
        value: resolvePublicVars(param.value),
      })),
    )
  } catch {
    // Preserve the template when substitution fails, matching send errors.
  }
  const requestHeaders = Object.fromEntries(
    Object.entries(req.headers).map(([key, value]) => [
      key,
      {
        ...value,
        value: isSensitiveHeader(key)
          ? REDACTED
          : redact(
              value.enabled ? resolvePublicVars(value.value) : value.value,
            ),
      },
    ]),
  )
  const redactAuth = (auth: Request["auth"]): Request["auth"] => {
    if (!auth || auth.type === "none" || auth.type === "inherit") return auth
    if (auth.type === "bearer") {
      return {
        type: "bearer",
        token: REDACTED,
      }
    }
    if (auth.type === "basic") {
      return {
        type: "basic",
        user: redact(resolvePublicVars(auth.user)),
        pass: REDACTED,
      }
    }
    if (auth.type === "ntlm") {
      return {
        type: "ntlm",
        username: redact(resolvePublicVars(auth.username)),
        password: REDACTED,
        domain: redact(resolvePublicVars(auth.domain)),
        workstation: redact(resolvePublicVars(auth.workstation)),
      }
    }
    if (auth.type === "aws_sigv4") {
      return {
        type: "aws_sigv4",
        access_key: REDACTED,
        secret_key: REDACTED,
        region: redact(resolvePublicVars(auth.region)),
        service: redact(resolvePublicVars(auth.service)),
        ...(auth.session_token ? { session_token: REDACTED } : {}),
      }
    }
    if (auth.type === "oauth1") {
      return {
        ...auth,
        consumer_key: redact(resolvePublicVars(auth.consumer_key)),
        consumer_secret: REDACTED,
        access_token: REDACTED,
        access_token_secret: REDACTED,
        private_key: REDACTED,
        callback_url: redact(resolvePublicVars(auth.callback_url)),
        verifier: REDACTED,
        timestamp: REDACTED,
        nonce: REDACTED,
        realm: redact(resolvePublicVars(auth.realm)),
      }
    }
    if (auth.type === "oauth2") {
      const redactParameters = (
        parameters: typeof auth.additional_parameters.token,
      ) =>
        parameters.map((parameter) => ({
          ...parameter,
          name: redact(resolvePublicVars(parameter.name)),
          value: REDACTED,
        }))
      return {
        ...auth,
        discovery_url: redact(resolvePublicVars(auth.discovery_url)),
        authorization_url: redact(resolvePublicVars(auth.authorization_url)),
        access_token_url: redact(resolvePublicVars(auth.access_token_url)),
        refresh_token_url: redact(resolvePublicVars(auth.refresh_token_url)),
        client_id: redact(resolvePublicVars(auth.client_id)),
        client_secret: REDACTED,
        username: redact(resolvePublicVars(auth.username)),
        password: REDACTED,
        scope: redact(resolvePublicVars(auth.scope)),
        audience: redact(resolvePublicVars(auth.audience)),
        redirect_uri: redact(resolvePublicVars(auth.redirect_uri)),
        credentials_id: redact(resolvePublicVars(auth.credentials_id)),
        client_assertion_key: REDACTED,
        client_assertion_issuer: redact(
          resolvePublicVars(auth.client_assertion_issuer),
        ),
        client_assertion_subject: redact(
          resolvePublicVars(auth.client_assertion_subject),
        ),
        client_assertion_audience: redact(
          resolvePublicVars(auth.client_assertion_audience),
        ),
        token_header: redact(resolvePublicVars(auth.token_header)),
        token_prefix: redact(resolvePublicVars(auth.token_prefix)),
        token_query_key: redact(resolvePublicVars(auth.token_query_key)),
        additional_parameters: {
          authorization: redactParameters(
            auth.additional_parameters.authorization,
          ),
          token: redactParameters(auth.additional_parameters.token),
          refresh: redactParameters(auth.additional_parameters.refresh),
        },
      }
    }
    return {
      ...auth,
      key: redact(resolvePublicVars(auth.key)),
      value: REDACTED,
    }
  }
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    envName,
    assertions,
    network:
      result.status === "done"
        ? result.response.network?.map((event) => ({
            ...event,
            message: redact(event.message),
          }))
        : (result.error as NetworkError).network?.map((event) => ({
            ...event,
            message: redact(event.message),
          })),
    request: {
      id: req.id,
      name: req.name,
      method: req.method,
      url: redact(url),
      headers: requestHeaders,
      params: req.params.map((param) => ({
        ...param,
        name: redact(
          param.enabled ? resolvePublicVars(param.name) : param.name,
        ),
        value: redact(
          param.enabled ? resolvePublicVars(param.value) : param.value,
        ),
      })),
      pathParams: (req.pathParams ?? []).map((param) => ({
        ...param,
        name: redact(resolvePublicVars(param.name)),
        value: redact(resolvePublicVars(param.value)),
      })),
      body:
        req.body === undefined
          ? undefined
          : redact(resolvePublicVars(req.body)),
      bodyType: req.bodyType,
      auth: redactAuth(req.auth),
    },
    response:
      result.status === "done"
        ? {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: result.response.headers,
            body: result.response.body,
            timeMs: result.response.timeMs,
            size: responseSize(result.response.body),
          }
        : undefined,
    error:
      result.status === "error"
        ? { message: redact(result.error.message) }
        : undefined,
  }
}
