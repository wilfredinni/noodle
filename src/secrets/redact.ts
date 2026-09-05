import type { Environment, KvEntry, Request, Response } from "../schema"

export const REDACTED = "[REDACTED]"

export function environmentSecretValues(
  environment: Environment | null | undefined,
): string[] {
  if (!environment?.secretVars) return []
  return [
    ...new Set(
      Object.keys(environment.secretVars)
        .map((key) => environment.vars[key])
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => b.length - a.length)
}

export function redactKnownSecrets(input: string, values: string[]): string {
  let output = input
  for (const value of [...new Set(values.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )) {
    output = output.split(value).join(REDACTED)
  }
  return output
}

export function isSensitiveHeader(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[_\s]/g, "-")
  return (
    normalized === "authorization" ||
    normalized === "proxy-authorization" ||
    normalized === "cookie" ||
    normalized === "set-cookie" ||
    normalized.includes("api-key") ||
    normalized.includes("apikey") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("credential") ||
    normalized.includes("signature")
  )
}

export function redactResponseHeaders(
  headers: Record<string, string>,
  secretValues: string[],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      isSensitiveHeader(name)
        ? REDACTED
        : redactKnownSecrets(value, secretValues),
    ]),
  )
}

export function sensitiveHeaderValues(
  headers: Record<string, string>,
): string[] {
  return normalizedSecrets(
    Object.entries(headers).flatMap(([name, value]) =>
      isSensitiveHeader(name) ? sensitiveHeaderParts(name, value) : [],
    ),
  )
}

export function requestSensitiveValues(
  request: Pick<Request, "auth"> & {
    headers: Record<string, string | KvEntry>
  },
): string[] {
  const values = Object.entries(request.headers).flatMap(([name, entry]) => {
    const value =
      typeof entry === "string" ? entry : entry.enabled ? entry.value : ""
    return isSensitiveHeader(name) ? sensitiveHeaderParts(name, value) : []
  })
  const auth = request.auth
  if (auth && auth.type !== "none" && auth.type !== "inherit") {
    if (auth.type === "bearer") values.push(auth.token)
    else if (auth.type === "basic") values.push(auth.pass)
    else if (auth.type === "ntlm") values.push(auth.password)
    else if (auth.type === "api_key") values.push(auth.value)
    else if (auth.type === "aws_sigv4") {
      values.push(auth.access_key, auth.secret_key, auth.session_token ?? "")
    } else if (auth.type === "oauth1") {
      values.push(
        auth.consumer_secret,
        auth.access_token,
        auth.access_token_secret,
        auth.private_key,
        auth.verifier,
      )
    } else {
      values.push(auth.client_secret, auth.password, auth.client_assertion_key)
    }
  }
  return normalizedSecrets(values)
}

export function responseSensitiveValues(
  response: Pick<Response, "headers" | "sentCookies" | "cookies">,
): string[] {
  return normalizedSecrets([
    ...sensitiveHeaderValues(response.headers),
    ...(response.sentCookies ?? []).map(({ value }) => value),
    ...(response.cookies ?? []).map(({ value }) => value),
  ])
}

function sensitiveHeaderParts(name: string, value: string): string[] {
  const normalized = name.toLowerCase().replace(/[_\s]/g, "-")
  if (normalized === "authorization" || normalized === "proxy-authorization") {
    return [value, value.replace(/^\S+\s+/, "")]
  }
  if (normalized === "cookie") {
    return [
      value,
      ...value.split(";").map((part) => part.trim().replace(/^[^=]*=/, "")),
    ]
  }
  return [value]
}

function normalizedSecrets(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
}
