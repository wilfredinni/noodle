import { afterEach, describe, expect, it } from "bun:test"
import { createHash, generateKeyPairSync } from "node:crypto"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { jwtVerify } from "jose"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../src/auth/defaults"
import { parseFolder, serializeFolder } from "../src/lang/folder"
import { parseRequest } from "../src/lang/parse"
import { serializeRequest } from "../src/lang/serialize"
import { signOAuth1Request } from "../src/requests/oauth1"
import {
  clearOAuth2Token,
  oauth2CredentialKey,
  resolveOAuth2Token,
  validateOAuthEndpoint,
} from "../src/requests/oauth2"
import { validateLoopbackRedirect } from "../src/requests/oauth2Browser"
import { send } from "../src/requests/send"
import {
  setOAuth2Credential,
  setSecretBackendForTests,
  type SecretBackend,
} from "../src/secrets"
import type { OAuth2Auth, Request } from "../src/schema"

function memoryBackend(): SecretBackend & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get({ name }) {
      return values.get(name) ?? null
    },
    async set({ name, value }) {
      values.set(name, value)
    },
    async delete({ name }) {
      return values.delete(name)
    },
  }
}

async function unusedPort(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = 20_000 + Math.floor(Math.random() * 30_000)
    try {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        fetch: () => new Response("reserved"),
      })
      server.stop(true)
      return port
    } catch {
      // Try another high, unprivileged port.
    }
  }
  throw new Error("unable to reserve a loopback test port")
}

function resourceRequest(url: string, auth: OAuth2Auth): Request {
  return {
    id: "oauth-resource",
    name: "OAuth resource",
    method: "GET",
    url,
    timeout: 5_000,
    headers: {},
    params: [],
    auth,
  }
}

let tempDirs: string[] = []
let servers: Array<ReturnType<typeof Bun.serve>> = []
let authToClear: Array<{ auth: OAuth2Auth; dir?: string }> = []

afterEach(async () => {
  for (const server of servers) server.stop(true)
  servers = []
  for (const entry of authToClear) {
    await clearOAuth2Token(entry.auth, entry.dir)
  }
  authToClear = []
  setSecretBackendForTests(undefined)
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  )
  tempDirs = []
})

describe("OAuth language", () => {
  it("round-trips OAuth 1 and OAuth 2 request auth", () => {
    const oauth1 = {
      ...defaultOAuth1Auth(),
      consumer_key: "$OAUTH1_KEY",
      consumer_secret: "$OAUTH1_SECRET",
      signature_method: "RSA-SHA256" as const,
      private_key: "./keys/oauth.pem",
      private_key_type: "file" as const,
      placement: "query" as const,
      include_body_hash: true,
    }
    const oauth2 = {
      ...defaultOAuth2Auth(),
      authorization_url: "https://auth.example/authorize",
      access_token_url: "https://auth.example/token",
      client_id: "$CLIENT_ID",
      client_secret: "$CLIENT_SECRET",
      additional_parameters: {
        authorization: [
          {
            name: "prompt",
            value: "consent",
            enabled: true,
            placement: "query" as const,
          },
        ],
        token: [
          {
            name: "resource",
            value: "https://api.example",
            enabled: true,
            placement: "body" as const,
          },
        ],
        refresh: [],
      },
    }
    const base: Omit<Request, "auth"> = {
      id: "oauth",
      name: "OAuth",
      method: "GET",
      url: "https://api.example",
      timeout: 30_000,
      headers: {},
      params: [],
    }
    expect(
      parseRequest("oauth", serializeRequest({ ...base, auth: oauth1 })).auth,
    ).toEqual(oauth1)
    expect(
      parseRequest("oauth", serializeRequest({ ...base, auth: oauth2 })).auth,
    ).toEqual(oauth2)
  })

  it("shares OAuth parsing and serialization with folder overrides", () => {
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: "https://auth.example/token",
      client_id: "$CLIENT_ID",
      client_secret: "$CLIENT_SECRET",
    }
    const folder = {
      id: "secure",
      name: "Secure",
      path: "secure",
      children: [],
      overrides: { auth },
    }
    expect(parseFolder(serializeFolder(folder)).overrides?.auth).toEqual(auth)
  })

  it("loads incomplete OAuth config but rejects unknown fields", () => {
    const parsed = parseRequest(
      "oauth",
      "name: OAuth\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth2\n",
    )
    expect(parsed.auth).toMatchObject({
      type: "oauth2",
      grant_type: "authorization_code",
      pkce: true,
      pkce_method: "S256",
    })
    expect(() =>
      parseRequest(
        "oauth",
        "name: OAuth\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth1\n  surprise: true\n",
      ),
    ).toThrow('unknown field "surprise"')
  })
})

describe("OAuth 1 signing", () => {
  it("matches the RFC 5849 HMAC-SHA1 example", async () => {
    const signed = await signOAuth1Request(
      "http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "c2&a3=2+q",
      },
      {
        ...defaultOAuth1Auth(),
        consumer_key: "9djdj82h48djs9d2",
        consumer_secret: "j49sk3j29djd",
        access_token: "kkk9d7dh3k39sjv7",
        access_token_secret: "dh893hdasih9",
        signature_method: "HMAC-SHA1",
        nonce: "7d8f3e4a",
        timestamp: "137131201",
        version: "",
      },
    )
    const authorization =
      new Headers(signed.init.headers).get("authorization") ?? ""
    const match = authorization.match(/oauth_signature="([^"]+)"/)
    expect(match).not.toBeNull()
    expect(decodeURIComponent(match![1]!)).toBe("r6/TJjbCOr97/+UU0NsvSne7s5g=")
  })

  it("rejects body placement for non-form bodies and multipart hashing", async () => {
    await expect(
      signOAuth1Request(
        "https://example.com",
        {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        },
        { ...defaultOAuth1Auth(), consumer_key: "key", placement: "body" },
      ),
    ).rejects.toThrow("requires a URL-encoded body")
    await expect(
      signOAuth1Request(
        "https://example.com",
        { method: "POST", body: new FormData() },
        {
          ...defaultOAuth1Auth(),
          consumer_key: "key",
          include_body_hash: true,
        },
      ),
    ).rejects.toThrow("does not support multipart")
  })

  it("supports query, form-body, PLAINTEXT, body-hash, and RSA file signing", async () => {
    const fixed = {
      ...defaultOAuth1Auth(),
      consumer_key: "consumer",
      consumer_secret: "secret value",
      access_token: "token",
      access_token_secret: "token/secret",
      nonce: "fixed-nonce",
      timestamp: "1700000000",
    }
    const query = await signOAuth1Request(
      "https://example.com/resource?duplicate=one&duplicate=two",
      { method: "GET" },
      { ...fixed, placement: "query", signature_method: "PLAINTEXT" },
    )
    const queryUrl = new URL(query.url)
    expect(queryUrl.searchParams.getAll("duplicate")).toEqual(["one", "two"])
    expect(queryUrl.searchParams.get("oauth_signature")).toBe(
      "secret%20value&token%2Fsecret",
    )

    const body = await signOAuth1Request(
      "https://example.com/resource",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "name=value",
      },
      { ...fixed, placement: "body" },
    )
    const bodyParameters = new URLSearchParams(String(body.init.body))
    expect(bodyParameters.get("name")).toBe("value")
    expect(bodyParameters.get("oauth_signature")).not.toBeNull()
    expect(new Headers(body.init.headers).has("authorization")).toBe(false)

    const hashed = await signOAuth1Request(
      "https://example.com/resource",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"hello":"world"}',
      },
      { ...fixed, include_body_hash: true },
    )
    const hashHeader = new Headers(hashed.init.headers).get("authorization")!
    const encodedHash = hashHeader.match(/oauth_body_hash="([^"]+)"/)?.[1]
    expect(decodeURIComponent(encodedHash!)).toBe(
      createHash("sha1").update('{"hello":"world"}').digest("base64"),
    )

    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth1-key-"))
    tempDirs.push(dir)
    await writeFile(join(dir, "oauth.pem"), pem)
    const textSigned = await signOAuth1Request(
      "https://example.com/resource",
      { method: "GET" },
      {
        ...fixed,
        signature_method: "RSA-SHA256",
        private_key: pem,
        private_key_type: "text",
      },
    )
    const fileSigned = await signOAuth1Request(
      "https://example.com/resource",
      { method: "GET" },
      {
        ...fixed,
        signature_method: "RSA-SHA256",
        private_key: "oauth.pem",
        private_key_type: "file",
      },
      dir,
    )
    expect(new Headers(fileSigned.init.headers).get("authorization")).toBe(
      new Headers(textSigned.init.headers).get("authorization"),
    )
  })

  it("re-signs same-origin redirects and strips credentials across origins", async () => {
    let crossOriginAuthorization: string | null = "not-called"
    const targetPort = await unusedPort()
    const target = Bun.serve({
      hostname: "127.0.0.1",
      port: targetPort,
      fetch(request) {
        crossOriginAuthorization = request.headers.get("authorization")
        return new Response("cross-origin")
      },
    })
    servers.push(target)
    const signatures: string[] = []
    const sourcePort = await unusedPort()
    const source = Bun.serve({
      hostname: "127.0.0.1",
      port: sourcePort,
      fetch(request) {
        const url = new URL(request.url)
        signatures.push(request.headers.get("authorization") ?? "")
        if (url.pathname === "/same-start") {
          return new Response(null, {
            status: 302,
            headers: { location: "/same-final" },
          })
        }
        if (url.pathname === "/cross-start") {
          return new Response(null, {
            status: 302,
            headers: { location: `http://127.0.0.1:${target.port}/final` },
          })
        }
        return new Response("same-origin")
      },
    })
    servers.push(source)
    const auth = {
      ...defaultOAuth1Auth(),
      consumer_key: "consumer",
      consumer_secret: "secret",
      nonce: "fixed",
      timestamp: "1700000000",
    }
    const request = (path: string): Request => ({
      id: path,
      name: path,
      method: "GET",
      url: `http://127.0.0.1:${source.port}/${path}`,
      timeout: 5_000,
      headers: {},
      params: [],
      auth,
    })
    expect((await send(request("same-start"))).body).toBe("same-origin")
    expect(signatures).toHaveLength(2)
    expect(signatures[0]).toStartWith("OAuth ")
    expect(signatures[1]).toStartWith("OAuth ")
    expect(signatures[1]).not.toBe(signatures[0])
    signatures.length = 0
    expect((await send(request("cross-start"))).body).toBe("cross-origin")
    expect(crossOriginAuthorization).toBeNull()
  })
})

describe("OAuth 2 execution", () => {
  it("requires HTTPS OAuth endpoints except on loopback and validates callback shape", () => {
    expect(() =>
      validateOAuthEndpoint(
        "http://identity.example/token",
        "access_token_url",
      ),
    ).toThrow("must use HTTPS")
    expect(() =>
      validateOAuthEndpoint(
        "https://user:pass@identity.example/token#fragment",
        "access_token_url",
      ),
    ).toThrow("must not contain credentials")
    expect(
      validateOAuthEndpoint("http://127.0.0.1:9876/token", "access_token_url")
        .hostname,
    ).toBe("127.0.0.1")
    expect(() =>
      validateLoopbackRedirect("https://127.0.0.1:8765/oauth/callback"),
    ).toThrow("must use http")
    expect(() => validateLoopbackRedirect("http://127.0.0.1:8765/")).toThrow(
      "callback path",
    )
  })

  it("fetches client credentials, stores them in the vault, and sends the token", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 11111111-1111-4111-8111-111111111111\n",
    )
    let tokenCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/token") {
          tokenCalls++
          const body = new URLSearchParams(await request.text())
          expect(body.get("grant_type")).toBe("client_credentials")
          expect(body.get("client_id")).toBe("client")
          return Response.json({
            access_token: "vault-token",
            expires_in: 3600,
          })
        }
        return new Response(request.headers.get("authorization") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "client",
      client_secret: "secret",
      credentials_id: "client-credentials-test",
    }
    authToClear.push({ auth, dir })
    const request = resourceRequest(
      `http://127.0.0.1:${server.port}/resource`,
      auth,
    )
    const [first, second] = await Promise.all([
      send(request, { collectionDir: dir, oauthMode: "cached-only" }),
      send(request, { collectionDir: dir, oauthMode: "cached-only" }),
    ])
    const third = await send(request, {
      collectionDir: dir,
      oauthMode: "cached-only",
    })
    expect(first.body).toBe("Bearer vault-token")
    expect(second.body).toBe("Bearer vault-token")
    expect(third.body).toBe("Bearer vault-token")
    expect(tokenCalls).toBe(1)
    expect(backend.values.size).toBe(1)
  })

  it("does not forward OAuth 2 tokens across an origin-changing redirect", async () => {
    let forwardedAuthorization: string | null = "not-called"
    let forwardedQueryToken: string | null = "not-called"
    const targetPort = await unusedPort()
    const target = Bun.serve({
      hostname: "127.0.0.1",
      port: targetPort,
      fetch(request) {
        const url = new URL(request.url)
        forwardedAuthorization = request.headers.get("authorization")
        forwardedQueryToken = url.searchParams.get("access_token")
        return new Response("redirected")
      },
    })
    servers.push(target)
    const sourcePort = await unusedPort()
    const source = Bun.serve({
      hostname: "127.0.0.1",
      port: sourcePort,
      fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/token") {
          return Response.json({ access_token: "do-not-forward" })
        }
        return new Response(null, {
          status: 302,
          headers: { location: `http://127.0.0.1:${target.port}/target` },
        })
      },
    })
    servers.push(source)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${source.port}/token`,
      client_id: "redirect-client",
      credentials_id: `redirect-${crypto.randomUUID()}`,
    }
    const response = await send(
      resourceRequest(`http://127.0.0.1:${source.port}/start`, auth),
      { oauthMode: "cached-only" },
    )
    expect(response.body).toBe("redirected")
    expect(forwardedAuthorization).toBeNull()
    expect(forwardedQueryToken).toBeNull()
  })

  it("refreshes stored credentials, rotates refresh tokens, and delivers an ID token in the query", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-refresh-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 33333333-3333-4333-8333-333333333333\n",
    )
    const serverPort = await unusedPort()
    let refreshCalls = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/refresh") {
          refreshCalls++
          const body = new URLSearchParams(await request.text())
          expect(body.get("grant_type")).toBe("refresh_token")
          expect(body.get("refresh_token")).toBe("old-refresh")
          expect(body.get("tenant")).toBe("body-extra")
          expect(url.searchParams.get("resource")).toBe("query-extra")
          expect(request.headers.get("x-refresh-extra")).toBe("header-extra")
          return new Response(
            "access_token=new-access&id_token=new-id&refresh_token=rotated-refresh&expires_in=3600",
            {
              headers: { "content-type": "application/x-www-form-urlencoded" },
            },
          )
        }
        return new Response(url.searchParams.get("identity") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "authorization_code" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      refresh_token_url: `http://127.0.0.1:${server.port}/refresh`,
      client_id: "refresh-client",
      credentials_id: "refresh-test",
      token_source: "id_token" as const,
      token_placement: "query" as const,
      token_query_key: "identity",
      additional_parameters: {
        authorization: [],
        token: [],
        refresh: [
          {
            name: "tenant",
            value: "body-extra",
            enabled: true,
            placement: "body" as const,
          },
          {
            name: "resource",
            value: "query-extra",
            enabled: true,
            placement: "query" as const,
          },
          {
            name: "X-Refresh-Extra",
            value: "header-extra",
            enabled: true,
            placement: "header" as const,
          },
        ],
      },
    }
    authToClear.push({ auth, dir })
    await setOAuth2Credential(
      dir,
      oauth2CredentialKey(auth),
      JSON.stringify({
        access_token: "expired-access",
        id_token: "expired-id",
        refresh_token: "old-refresh",
        _noodle_expires_at: 1,
      }),
    )
    const response = await send(
      resourceRequest(`http://127.0.0.1:${server.port}/resource`, auth),
      { collectionDir: dir, oauthMode: "cached-only" },
    )
    expect(response.body).toBe("new-id")
    expect(refreshCalls).toBe(1)
    const stored = JSON.parse([...backend.values.values()][0]!)
    expect(stored.refresh_token).toBe("rotated-refresh")
  })

  it("authorizes with the injected browser, validates state, and sends S256 PKCE", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 22222222-2222-4222-8222-222222222222\n",
    )
    const callbackPort = await unusedPort()
    let verifier = ""
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/token") {
          const body = new URLSearchParams(await request.text())
          verifier = body.get("code_verifier") ?? ""
          expect(body.get("code")).toBe("approved-code")
          return Response.json({
            access_token: "browser-token",
            expires_in: 3600,
          })
        }
        return new Response(request.headers.get("authorization") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      authorization_url: `http://127.0.0.1:${server.port}/authorize`,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      redirect_uri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      client_id: "browser-client",
      credentials_id: "browser-test",
    }
    authToClear.push({ auth, dir })
    const response = await send(
      resourceRequest(`http://127.0.0.1:${server.port}/resource`, auth),
      {
        collectionDir: dir,
        oauthMode: "interactive",
        openOAuthBrowser: async (authorizationUrl) => {
          const url = new URL(authorizationUrl)
          expect(url.searchParams.get("code_challenge_method")).toBe("S256")
          const callback = new URL(url.searchParams.get("redirect_uri")!)
          callback.searchParams.set("code", "approved-code")
          callback.searchParams.set("state", url.searchParams.get("state")!)
          await fetch(callback)
        },
      },
    )
    expect(response.body).toBe("Bearer browser-token")
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })

  it("rejects a browser callback whose state does not match", async () => {
    const callbackPort = await unusedPort()
    const auth = {
      ...defaultOAuth2Auth(),
      authorization_url: "http://127.0.0.1:9876/authorize",
      access_token_url: "http://127.0.0.1:9876/token",
      redirect_uri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      client_id: "state-client",
      credentials_id: `state-${crypto.randomUUID()}`,
    }
    await expect(
      send(resourceRequest("http://127.0.0.1:9876/resource", auth), {
        oauthMode: "interactive",
        openOAuthBrowser: async (authorizationUrl) => {
          const authorization = new URL(authorizationUrl)
          const callback = new URL(
            authorization.searchParams.get("redirect_uri")!,
          )
          callback.searchParams.set("code", "stolen-code")
          callback.searchParams.set("state", "wrong-state")
          await fetch(callback)
        },
      }),
    ).rejects.toThrow("state validation failed")
  })

  it("supports the legacy password grant and reports its warning", async () => {
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/token") {
          const body = new URLSearchParams(await request.text())
          expect(body.get("grant_type")).toBe("password")
          expect(body.get("username")).toBe("user")
          expect(body.get("password")).toBe("pass")
          return Response.json({ access_token: "password-token" })
        }
        return new Response(request.headers.get("authorization") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "password" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "password-client",
      username: "user",
      password: "pass",
      credentials_id: `password-${crypto.randomUUID()}`,
    }
    const response = await send(
      resourceRequest(`http://127.0.0.1:${server.port}/resource`, auth),
      { oauthMode: "cached-only" },
    )
    expect(response.body).toBe("Bearer password-token")
    expect(
      response.network?.some(
        (event) => event.type === "auth" && event.message.includes("legacy"),
      ),
    ).toBe(true)
  })

  it("signs JWT client assertions and applies token-phase parameters", async () => {
    const assertionSecret = "a-client-assertion-secret-with-enough-entropy"
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/token") {
          const body = new URLSearchParams(await request.text())
          expect(body.get("grant_type")).toBe("client_credentials")
          expect(body.get("tenant")).toBe("one")
          expect(url.searchParams.get("resource")).toBe("two")
          expect(request.headers.get("x-token-extra")).toBe("three")
          expect(body.get("client_assertion_type")).toContain("jwt-bearer")
          const verified = await jwtVerify(
            body.get("client_assertion")!,
            new TextEncoder().encode(assertionSecret),
          )
          expect(verified.payload.iss).toBe("assertion-issuer")
          expect(verified.payload.sub).toBe("assertion-client")
          expect(verified.payload.aud).toBe(
            `http://127.0.0.1:${server.port}/token`,
          )
          return Response.json({ access_token: "assertion-token" })
        }
        return new Response(request.headers.get("authorization") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "assertion-client",
      client_authentication: "client_assertion" as const,
      client_assertion_algorithm: "HS256" as const,
      client_assertion_key: assertionSecret,
      client_assertion_issuer: "assertion-issuer",
      credentials_id: `assertion-${crypto.randomUUID()}`,
      additional_parameters: {
        authorization: [],
        token: [
          {
            name: "tenant",
            value: "one",
            enabled: true,
            placement: "body" as const,
          },
          {
            name: "resource",
            value: "two",
            enabled: true,
            placement: "query" as const,
          },
          {
            name: "X-Token-Extra",
            value: "three",
            enabled: true,
            placement: "header" as const,
          },
        ],
        refresh: [],
      },
    }
    const response = await send(
      resourceRequest(`http://127.0.0.1:${server.port}/resource`, auth),
      { oauthMode: "cached-only" },
    )
    expect(response.body).toBe("Bearer assertion-token")
  })

  it("completes the implicit fragment relay and can select an ID token", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-implicit-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 44444444-4444-4444-8444-444444444444\n",
    )
    const callbackPort = await unusedPort()
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch: (request) =>
        new Response(request.headers.get("authorization") ?? ""),
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "implicit" as const,
      authorization_url: `http://127.0.0.1:${server.port}/authorize`,
      redirect_uri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      client_id: "implicit-client",
      implicit_response_type: "id_token" as const,
      token_source: "id_token" as const,
      credentials_id: "implicit-test",
    }
    authToClear.push({ auth, dir })
    const response = await send(
      resourceRequest(`http://127.0.0.1:${server.port}/resource`, auth),
      {
        collectionDir: dir,
        oauthMode: "interactive",
        openOAuthBrowser: async (authorizationUrl) => {
          const authorization = new URL(authorizationUrl)
          expect(authorization.searchParams.get("response_type")).toBe(
            "id_token",
          )
          const callback = new URL(
            authorization.searchParams.get("redirect_uri")!,
          )
          const relay = await fetch(callback)
          expect(await relay.text()).toContain("location.hash")
          callback.searchParams.set("id_token", "implicit-id")
          callback.searchParams.set(
            "state",
            authorization.searchParams.get("state")!,
          )
          await fetch(callback)
        },
      },
    )
    expect(response.body).toBe("Bearer implicit-id")
  })

  it("uses session memory only when the credential vault is unavailable", async () => {
    const unavailable: SecretBackend = {
      async get() {
        throw new Error("vault offline")
      },
      async set() {
        throw new Error("vault offline")
      },
      async delete() {
        throw new Error("vault offline")
      },
    }
    setSecretBackendForTests(unavailable)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-memory-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 55555555-5555-4555-8555-555555555555\n",
    )
    let tokenCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        if (new URL(request.url).pathname === "/token") {
          tokenCalls++
          return Response.json({ access_token: "memory-token" })
        }
        return new Response("resource")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "memory-client",
      credentials_id: `memory-${crypto.randomUUID()}`,
    }
    const events: string[] = []
    const first = await resolveOAuth2Token(auth, {
      collectionDir: dir,
      mode: "cached-only",
      onAuthEvent: (message) => events.push(message),
    })
    const second = await resolveOAuth2Token(auth, {
      collectionDir: dir,
      mode: "cached-only",
    })
    expect(first.token).toBe("memory-token")
    expect(second.token).toBe("memory-token")
    expect(tokenCalls).toBe(1)
    expect(events.some((message) => message.includes("session memory"))).toBe(
      true,
    )
    expect(await readdir(dir)).toEqual(["settings.yml"])
  })

  it("never opens a browser in cached-only automation mode", async () => {
    const auth = {
      ...defaultOAuth2Auth(),
      authorization_url: "http://127.0.0.1:9001/authorize",
      access_token_url: "http://127.0.0.1:9001/token",
      client_id: "client",
      credentials_id: `missing-${crypto.randomUUID()}`,
    }
    let opened = false
    await expect(
      send(resourceRequest("http://127.0.0.1:9001/resource", auth), {
        oauthMode: "cached-only",
        openOAuthBrowser: async () => {
          opened = true
        },
      }),
    ).rejects.toThrow("Open this request in the Noodle TUI")
    expect(opened).toBe(false)
  })
})
