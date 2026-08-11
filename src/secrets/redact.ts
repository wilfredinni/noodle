import type { Environment } from "../schema"

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
    normalized.includes("secret")
  )
}
