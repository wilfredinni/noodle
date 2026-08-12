import { sign } from "aws4"
import type { Auth } from "../schema"

export type AwsSigV4Auth = Extract<Auth, { type: "aws_sigv4" }>

const SIGNER_HEADERS = [
  "authorization",
  "x-amz-date",
  "x-amz-security-token",
  "x-amz-content-sha256",
]

function required(value: string, field: string): void {
  if (value.trim() === "") {
    throw new Error(`requests.send: AWS SigV4 requires auth.${field}`)
  }
}

export function clearAwsSignerHeaders(headers: Headers): Headers {
  const clean = new Headers(headers)
  for (const name of SIGNER_HEADERS) clean.delete(name)
  return clean
}

export function signAwsRequest(
  url: string,
  init: RequestInit,
  auth: AwsSigV4Auth,
  signingDate?: Date,
): RequestInit {
  required(auth.access_key, "access_key")
  required(auth.secret_key, "secret_key")
  required(auth.region, "region")
  required(auth.service, "service")

  const parsed = new URL(url)
  const headers = clearAwsSignerHeaders(new Headers(init.headers))
  if (signingDate) {
    headers.set(
      "x-amz-date",
      signingDate.toISOString().replace(/[:-]|\.\d{3}/g, ""),
    )
  }

  const body = init.body
  if (
    body !== undefined &&
    body !== null &&
    typeof body !== "string" &&
    !Buffer.isBuffer(body) &&
    !(body instanceof Uint8Array)
  ) {
    throw new Error(
      "requests.send: AWS SigV4 only supports text and buffered binary bodies",
    )
  }

  const signed = sign(
    {
      hostname: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      method: init.method,
      path: `${parsed.pathname}${parsed.search}`,
      headers: Object.fromEntries(headers.entries()),
      body:
        typeof body === "string"
          ? body
          : body instanceof Uint8Array
            ? Buffer.from(body)
            : undefined,
      service: auth.service,
      region: auth.region,
      doNotEncodePath: auth.service === "s3",
    },
    {
      accessKeyId: auth.access_key,
      secretAccessKey: auth.secret_key,
      sessionToken: auth.session_token || undefined,
    },
  )

  return { ...init, headers: new Headers(signed.headers as HeadersInit) }
}
