import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  timingSafeEqual,
} from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import OAuth from "oauth-1.0a"
import aws4 from "aws4"
import { importPKCS8, jwtVerify, SignJWT } from "jose"

// Public fixtures for the loopback development services only.
export const credentials = {
  user: "User",
  password: "Password",
  domain: "Domain",
  bearer: "noodle-dev-token",
  apiKey: "noodle-dev-api-key",
  consumer: "noodle-consumer",
  consumerSecret: "noodle-consumer-secret",
  oauthToken: "noodle-oauth-token",
  oauthSecret: "noodle-oauth-secret",
  client: "noodle-client",
  clientSecret: "noodle-client-secret",
  awsKey: "NOODLEDEVACCESS",
  awsSecret: "noodle-development-secret",
  awsSession: "noodle-development-session",
  proxyUser: "proxy-user",
  proxyPassword: "proxy-pass",
}
const fixtureDir = join(import.meta.dir, "collection", "fixtures")
const rsaPublic = createPublicKey(readFileSync(join(fixtureDir, "rsa.pem")))
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
const failure = (error = "invalid_credentials", status = 401) =>
  Response.json({ error }, { status })

export async function verifyOAuth1(request: Request): Promise<boolean> {
  const url = new URL(request.url)
  const rawBody = Buffer.from(await request.clone().arrayBuffer())
  const form = request.headers
    .get("content-type")
    ?.startsWith("application/x-www-form-urlencoded")
    ? new URLSearchParams(rawBody.toString("utf8"))
    : undefined
  const entries = [...url.searchParams, ...(form ?? [])]
  const auth = request.headers.get("authorization") ?? ""
  if (auth.startsWith("OAuth ")) {
    for (const match of auth.slice(6).matchAll(/(oauth_\w+)="([^"]*)"/g))
      entries.push([match[1]!, decodeURIComponent(match[2]!)])
  }
  const parameters: Record<string, string> = {}
  const data: Record<string, string | string[]> = {}
  for (const [name, value] of entries) {
    if (name.startsWith("oauth_")) parameters[name] = value
    else {
      const previous = data[name]
      data[name] =
        previous === undefined
          ? value
          : [...(Array.isArray(previous) ? previous : [previous]), value]
    }
  }
  const method = parameters.oauth_signature_method ?? ""
  if (
    !/^(HMAC|RSA)-SHA(1|256|512)$|^PLAINTEXT$/.test(method) ||
    parameters.oauth_consumer_key !== credentials.consumer ||
    parameters.oauth_token !== credentials.oauthToken ||
    !parameters.oauth_nonce ||
    !/^\d+$/.test(parameters.oauth_timestamp ?? "")
  )
    return false
  const digest = method.endsWith("256")
    ? "sha256"
    : method.endsWith("512")
      ? "sha512"
      : "sha1"
  if (
    parameters.oauth_body_hash &&
    !equal(
      parameters.oauth_body_hash,
      createHash(digest).update(rawBody).digest("base64"),
    )
  )
    return false
  const signature = parameters.oauth_signature ?? ""
  delete parameters.oauth_signature
  let valid = false
  const oauth = new OAuth({
    consumer: { key: credentials.consumer, secret: credentials.consumerSecret },
    signature_method: method,
    hash_function(base, key) {
      if (method.startsWith("RSA-")) {
        valid = createVerify(digest)
          .update(base)
          .verify(rsaPublic, signature, "base64")
        return signature
      }
      return method === "PLAINTEXT"
        ? key
        : createHmac(digest, key).update(base).digest("base64")
    },
  })
  const expected = oauth.getSignature(
    { url: `${url.origin}${url.pathname}`, method: request.method, data },
    credentials.oauthSecret,
    parameters as unknown as OAuth.Data,
  )
  return method.startsWith("RSA-") ? valid : equal(signature, expected)
}

export async function verifyAws(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization") ?? ""
  const match = authorization.match(
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/,
  )
  if (
    !match ||
    match[1] !== credentials.awsKey ||
    match[3] !== "us-east-1" ||
    match[4] !== "execute-api"
  )
    return false
  const session = request.headers.get("x-amz-security-token")
  if (session !== null && session !== credentials.awsSession) return false
  const date = request.headers.get("x-amz-date") ?? ""
  if (!/^\d{8}T\d{6}Z$/.test(date) || date.slice(0, 8) !== match[2])
    return false
  const instant = Date.parse(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`,
  )
  if (Math.abs(Date.now() - instant) > 5 * 60_000) return false
  const body = Buffer.from(await request.clone().arrayBuffer())
  const payloadHash = request.headers.get("x-amz-content-sha256")
  if (
    payloadHash !== null &&
    !equal(payloadHash, createHash("sha256").update(body).digest("hex"))
  )
    return false
  const headers: Record<string, string> = {}
  for (const name of match[5]!.split(";")) {
    const value = request.headers.get(name)
    if (value === null) return false
    headers[name] = value
  }
  const url = new URL(request.url)
  const signed = aws4.sign(
    {
      host: url.host,
      path: `${url.pathname}${url.search}`,
      method: request.method,
      service: match[4],
      region: match[3],
      headers,
      body: body.length ? body : undefined,
    },
    {
      accessKeyId: credentials.awsKey,
      secretAccessKey: credentials.awsSecret,
      ...(session ? { sessionToken: session } : {}),
    },
  )
  return equal(
    authorization,
    String(
      signed.headers?.Authorization ?? signed.headers?.authorization ?? "",
    ),
  )
}

export function createAuthService(origin: () => string) {
  const tokens = new Map<string, { expires: number }>()
  const refreshTokens = new Set<string>()
  const codes = new Map<
    string,
    { redirect: string; challenge: string; method: string }
  >()
  const reset = () => {
    tokens.clear()
    refreshTokens.clear()
    codes.clear()
  }
  async function issue(expiresIn = 3600, nonce?: string) {
    const access_token = crypto.randomUUID()
    const refresh_token = crypto.randomUUID()
    tokens.set(access_token, { expires: Date.now() + expiresIn * 1000 })
    refreshTokens.add(refresh_token)
    const key = await importPKCS8(
      readFileSync(join(fixtureDir, "rsa.pem"), "utf8"),
      "RS256",
    )
    const id_token = await new SignJWT({ ...(nonce ? { nonce } : {}) })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(origin())
      .setAudience(credentials.client)
      .setSubject(credentials.user)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key)
    tokens.set(id_token, { expires: Date.now() + 3600_000 })
    return {
      access_token,
      refresh_token,
      id_token,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: "openid profile",
    }
  }
  async function authenticateClient(request: Request, form: URLSearchParams) {
    const assertion = form.get("client_assertion")
    if (assertion) {
      try {
        const header = JSON.parse(
          Buffer.from(assertion.split(".")[0]!, "base64url").toString(),
        ) as { alg: string }
        if (!/^(HS|RS|PS|ES)(256|384|512)$/.test(header.alg)) return false
        const key = header.alg.startsWith("HS")
          ? new TextEncoder().encode(credentials.clientSecret)
          : header.alg.startsWith("ES")
            ? createPublicKey(
                readFileSync(join(fixtureDir, `ec${header.alg.slice(2)}.pem`)),
              )
            : rsaPublic
        const verified = await jwtVerify(assertion, key, {
          algorithms: [header.alg],
          issuer: credentials.client,
          subject: credentials.client,
          audience: `${origin()}/oauth/token`,
          maxTokenAge: "5m",
        })
        return typeof verified.payload.jti === "string"
      } catch {
        return false
      }
    }
    const basic = request.headers.get("authorization")
    if (basic?.startsWith("Basic "))
      return equal(
        basic.slice(6),
        Buffer.from(
          `${credentials.client}:${credentials.clientSecret}`,
        ).toString("base64"),
      )
    return (
      form.get("client_id") === credentials.client &&
      equal(form.get("client_secret") ?? "", credentials.clientSecret)
    )
  }
  async function handle(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url)
    const path = url.pathname
    if (
      path === "/.well-known/openid-configuration" ||
      path === "/oauth/.well-known/openid-configuration"
    )
      return Response.json({
        issuer: origin(),
        authorization_endpoint: `${origin()}/oauth/authorize`,
        token_endpoint: `${origin()}/oauth/token`,
        jwks_uri: `${origin()}/oauth/jwks`,
        response_types_supported: [
          "code",
          "token",
          "id_token",
          "token id_token",
        ],
        code_challenge_methods_supported: ["S256", "plain"],
      })
    if (path === "/oauth/jwks")
      return Response.json({
        keys: [
          {
            ...rsaPublic.export({ format: "jwk" }),
            kid: "noodle-dev",
            use: "sig",
            alg: "RS256",
          },
        ],
      })
    if (path === "/oauth/authorize") {
      const redirect = url.searchParams.get("redirect_uri") ?? ""
      let callback: URL
      try {
        callback = new URL(redirect)
      } catch {
        return failure("invalid_redirect_uri", 400)
      }
      if (
        callback.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(callback.hostname) ||
        !callback.port ||
        callback.pathname === "/" ||
        callback.username ||
        callback.password
      )
        return failure("invalid_redirect_uri", 400)
      if (url.searchParams.get("client_id") !== credentials.client)
        return failure("invalid_client")
      const params = new URLSearchParams({
        state: url.searchParams.get("state") ?? "",
      })
      const type = url.searchParams.get("response_type")
      if (url.searchParams.get("deny") === "true")
        params.set("error", "access_denied")
      else if (type === "code") {
        const code = crypto.randomUUID()
        codes.set(code, {
          redirect,
          challenge: url.searchParams.get("code_challenge") ?? "",
          method: url.searchParams.get("code_challenge_method") ?? "plain",
        })
        params.set("code", code)
      } else if (["token", "id_token", "token id_token"].includes(type ?? "")) {
        const token = await issue(
          3600,
          url.searchParams.get("nonce") ?? undefined,
        )
        if (type!.includes("token") && type !== "id_token")
          params.set("access_token", token.access_token)
        if (type!.includes("id_token")) params.set("id_token", token.id_token)
        params.set("expires_in", "3600")
        params.set("token_type", "Bearer")
      } else return failure("unsupported_response_type", 400)
      if (type === "code" || params.has("error"))
        callback.search = params.toString()
      else callback.hash = params.toString()
      return Response.redirect(callback.toString(), 302)
    }
    if (path === "/oauth/expire" && request.method === "POST") {
      const token = new URLSearchParams(await request.text()).get("token") ?? ""
      if (!tokens.has(token)) return failure("invalid_token", 400)
      tokens.set(token, { expires: 0 })
      return Response.json({ expired: true })
    }
    if (path === "/oauth/token") {
      const form = new URLSearchParams(await request.text())
      if (!(await authenticateClient(request, form)))
        return failure("invalid_client")
      const grant = form.get("grant_type")
      if (
        grant === "password" &&
        (form.get("username") !== credentials.user ||
          form.get("password") !== credentials.password)
      )
        return failure("invalid_grant", 400)
      if (
        grant === "refresh_token" &&
        !refreshTokens.delete(form.get("refresh_token") ?? "")
      )
        return failure("invalid_grant", 400)
      if (grant === "authorization_code") {
        const code = form.get("code") ?? "",
          record = codes.get(code)
        codes.delete(code)
        if (!record || record.redirect !== form.get("redirect_uri"))
          return failure("invalid_grant", 400)
        const verifier = form.get("code_verifier") ?? ""
        const challenge =
          record.method === "S256"
            ? createHash("sha256").update(verifier).digest("base64url")
            : verifier
        if (record.challenge && !equal(record.challenge, challenge))
          return failure("invalid_grant", 400)
      }
      if (
        ![
          "client_credentials",
          "password",
          "refresh_token",
          "authorization_code",
        ].includes(grant ?? "")
      )
        return failure("unsupported_grant_type", 400)
      return Response.json(
        await issue(form.get("short_lived") === "true" ? 1 : 3600),
      )
    }
    if (path === "/auth/basic") {
      if (
        !equal(
          request.headers.get("authorization") ?? "",
          `Basic ${Buffer.from(`${credentials.user}:${credentials.password}`).toString("base64")}`,
        )
      )
        return new Response("Unauthorized", {
          status: 401,
          headers: { "www-authenticate": 'Basic realm="Noodle development"' },
        })
    } else if (path === "/auth/bearer") {
      if (
        !equal(
          request.headers.get("authorization") ?? "",
          `Bearer ${credentials.bearer}`,
        )
      )
        return failure()
    } else if (path === "/auth/api-key") {
      if (
        (request.headers.get("x-api-key") ??
          url.searchParams.get("api_key")) !== credentials.apiKey
      )
        return failure()
    } else if (path === "/auth/oauth1") {
      if (!(await verifyOAuth1(request))) return failure("invalid_signature")
    } else if (path === "/auth/aws") {
      if (!(await verifyAws(request))) return failure("invalid_signature")
    } else if (path === "/oauth/profile") {
      const value =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ??
        request.headers.get("x-token") ??
        url.searchParams.get("access_token") ??
        ""
      if ((tokens.get(value)?.expires ?? 0) <= Date.now())
        return failure("invalid_token")
    } else return undefined
    return Response.json({ authenticated: true, user: credentials.user })
  }
  return { handle, reset }
}
