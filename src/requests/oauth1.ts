import { createHash, createHmac, createSign } from "node:crypto"
import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import OAuth from "oauth-1.0a"
import type { OAuth1Auth } from "../schema"
import { expandUserPath } from "../userPath"

const OAUTH_PARAMETER_PREFIX = "oauth_"

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1"
  )
}

export interface OAuth1SignedRequest {
  url: string
  init: RequestInit
}

function digestName(signatureMethod: OAuth1Auth["signature_method"]): string {
  if (signatureMethod.endsWith("SHA256")) return "sha256"
  if (signatureMethod.endsWith("SHA512")) return "sha512"
  return "sha1"
}

async function privateKey(
  auth: OAuth1Auth,
  collectionDir?: string,
): Promise<string> {
  if (!auth.signature_method.startsWith("RSA-")) return ""
  if (!auth.private_key) {
    throw new Error("requests.send: OAuth 1 RSA signing requires private_key")
  }
  if (auth.private_key_type === "text") return auth.private_key
  const expanded = expandUserPath(auth.private_key)
  const path = isAbsolute(expanded)
    ? expanded
    : resolve(collectionDir ?? process.cwd(), expanded)
  try {
    return await readFile(path, "utf8")
  } catch (e) {
    throw new Error(
      `requests.send: unable to read OAuth 1 private key "${auth.private_key}"`,
      { cause: e },
    )
  }
}

function bodyBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body === undefined || body === null)
    return Promise.resolve(new Uint8Array())
  if (typeof body === "string")
    return Promise.resolve(new TextEncoder().encode(body))
  if (body instanceof URLSearchParams) {
    return Promise.resolve(new TextEncoder().encode(body.toString()))
  }
  if (body instanceof Blob) {
    return body.arrayBuffer().then((value) => new Uint8Array(value))
  }
  if (body instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(body))
  if (ArrayBuffer.isView(body)) {
    return Promise.resolve(
      new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
    )
  }
  throw new Error("requests.send: OAuth 1 cannot hash this request body")
}

function stripOAuthParameters(url: string): URL {
  const parsed = new URL(url)
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith(OAUTH_PARAMETER_PREFIX)) parsed.searchParams.delete(key)
  }
  return parsed
}

function stripOAuthBody(body: string): URLSearchParams {
  const params = new URLSearchParams(body)
  for (const key of [...params.keys()]) {
    if (key.startsWith(OAUTH_PARAMETER_PREFIX)) params.delete(key)
  }
  return params
}

export function stripOAuth1Credentials(url: string): string {
  return stripOAuthParameters(url).toString()
}

export async function signOAuth1Request(
  url: string,
  init: RequestInit,
  auth: OAuth1Auth,
  collectionDir?: string,
): Promise<OAuth1SignedRequest> {
  if (!auth.consumer_key) {
    throw new Error("requests.send: OAuth 1 requires consumer_key")
  }

  const cleanUrl = stripOAuthParameters(url)
  if (
    auth.signature_method === "PLAINTEXT" &&
    cleanUrl.protocol !== "https:" &&
    !(cleanUrl.protocol === "http:" && isLoopbackHost(cleanUrl.hostname))
  ) {
    throw new Error(
      "requests.send: OAuth 1 PLAINTEXT signing requires HTTPS unless it targets a loopback host",
    )
  }
  const headers = new Headers(init.headers)
  const contentType = headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase()
  const isForm = contentType === "application/x-www-form-urlencoded"
  const isMultipart =
    contentType === "multipart/form-data" || init.body instanceof FormData

  if (auth.placement === "body" && (!isForm || typeof init.body !== "string")) {
    throw new Error(
      "requests.send: OAuth 1 body placement requires a URL-encoded body",
    )
  }
  if (auth.include_body_hash && isMultipart) {
    throw new Error(
      "requests.send: OAuth 1 body hashing does not support multipart bodies",
    )
  }

  const key = await privateKey(auth, collectionDir)
  const algorithm = digestName(auth.signature_method)
  const oauth = new OAuth({
    consumer: { key: auth.consumer_key, secret: auth.consumer_secret },
    signature_method: auth.signature_method,
    version: auth.version || "1.0",
    realm: auth.realm || undefined,
    hash_function: (baseString, signingKey) => {
      if (auth.signature_method === "PLAINTEXT") return signingKey
      if (auth.signature_method.startsWith("RSA-")) {
        return createSign(algorithm).update(baseString).sign(key, "base64")
      }
      return createHmac(algorithm, signingKey)
        .update(baseString)
        .digest("base64")
    },
  })

  const originalBody = typeof init.body === "string" ? init.body : undefined
  const form = isForm ? stripOAuthBody(originalBody ?? "") : undefined
  const data: Record<string, string | string[]> = {}
  const appendSigningParameter = (name: string, value: string) => {
    const current = data[name]
    if (current === undefined) data[name] = value
    else if (Array.isArray(current)) current.push(value)
    else data[name] = [current, value]
  }
  // Supply every query and form value through request.data. oauth-1.0a's
  // object merge would otherwise discard a duplicate name appearing in both
  // locations, even though OAuth normalization must preserve it.
  for (const [name, value] of cleanUrl.searchParams) {
    appendSigningParameter(name, value)
  }
  if (form) {
    for (const [name, value] of form) appendSigningParameter(name, value)
  }

  const request = {
    url: `${cleanUrl.protocol}//${cleanUrl.host}${cleanUrl.pathname}`,
    method: String(init.method ?? "GET"),
    data,
  }
  const token = auth.access_token
    ? { key: auth.access_token, secret: auth.access_token_secret }
    : undefined
  const oauthData = oauth.authorize(request, token) as OAuth.Authorization &
    Record<string, string | number>

  if (auth.callback_url) oauthData.oauth_callback = auth.callback_url
  if (auth.verifier) oauthData.oauth_verifier = auth.verifier
  if (auth.timestamp) {
    if (!/^\d+$/.test(auth.timestamp)) {
      throw new Error("requests.send: OAuth 1 timestamp must be an integer")
    }
    oauthData.oauth_timestamp = Number(auth.timestamp)
  }
  if (auth.nonce) oauthData.oauth_nonce = auth.nonce
  if (auth.version) oauthData.oauth_version = auth.version
  else Reflect.deleteProperty(oauthData, "oauth_version")
  if (auth.include_body_hash && !isForm) {
    const bytes = await bodyBytes(init.body)
    oauthData.oauth_body_hash = createHash(algorithm)
      .update(bytes)
      .digest("base64")
  }
  // authorize() signs once using its generated timestamp and nonce. Remove
  // that signature before signing again with any user-supplied overrides.
  Reflect.deleteProperty(oauthData, "oauth_signature")
  oauthData.oauth_signature = oauth.getSignature(
    request,
    token?.secret,
    oauthData as OAuth.Data,
  )

  if (auth.placement === "header") {
    headers.set(
      "authorization",
      oauth.toHeader(oauthData as OAuth.Authorization).Authorization,
    )
    return { url: cleanUrl.toString(), init: { ...init, headers } }
  }

  if (auth.placement === "query") {
    for (const [name, value] of Object.entries(oauthData).filter(([name]) =>
      name.startsWith(OAUTH_PARAMETER_PREFIX),
    )) {
      cleanUrl.searchParams.append(name, String(value))
    }
    headers.delete("authorization")
    return { url: cleanUrl.toString(), init: { ...init, headers } }
  }

  for (const [name, value] of Object.entries(oauthData).filter(([name]) =>
    name.startsWith(OAUTH_PARAMETER_PREFIX),
  )) {
    form!.append(name, String(value))
  }
  headers.delete("authorization")
  return {
    url: cleanUrl.toString(),
    init: { ...init, headers, body: form!.toString() },
  }
}
