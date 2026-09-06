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
import {
  runLoopbackAuthorization,
  validateLoopbackRedirect,
} from "../src/requests/oauth2Browser"
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
      discovery_url: "https://auth.example",
      discovery_url_kind: "document" as const,
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
      discovery_url: "https://auth.example/.well-known/openid-configuration",
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
    expect(() =>
      parseRequest(
        "oauth",
        "name: OAuth\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth2\n  discovery_url: 42\n",
      ),
    ).toThrow("lang.parseRequest: auth.oauth2.discovery_url must be a string")
    expect(() =>
      parseRequest(
        "oauth",
        "name: OAuth\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth2\n  discovery_url_kind: auto\n",
      ),
    ).toThrow(
      'lang.parseRequest: auth.oauth2.discovery_url_kind must be one of issuer|document, got "auto"',
    )
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

  it("rejects OAuth 1 PLAINTEXT signing over non-loopback HTTP", async () => {
    await expect(
      signOAuth1Request(
        "http://identity.example/resource",
        { method: "GET" },
        {
          ...defaultOAuth1Auth(),
          consumer_key: "consumer",
          consumer_secret: "consumer-secret",
          signature_method: "PLAINTEXT",
        },
      ),
    ).rejects.toThrow("requires HTTPS")
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

  it("does not forward an OAuth 1 PLAINTEXT form signature across a 307 redirect", async () => {
    const originalFetch = globalThis.fetch
    const bodies: string[] = []
    let calls = 0
    globalThis.fetch = (async (_url, init) => {
      calls++
      bodies.push(String(init?.body ?? ""))
      return calls === 1
        ? new Response(null, {
            status: 307,
            headers: { location: "http://identity.example/final" },
          })
        : new Response("ok")
    }) as typeof globalThis.fetch

    try {
      await send({
        id: "plaintext-redirect",
        name: "PLAINTEXT redirect",
        method: "POST",
        url: "http://127.0.0.1:9876/start",
        timeout: 5_000,
        headers: {},
        params: [],
        bodyType: "urlencoded",
        formData: [
          { name: "field", value: "value", enabled: true, type: "text" },
        ],
        auth: {
          ...defaultOAuth1Auth(),
          consumer_key: "consumer",
          consumer_secret: "consumer-secret",
          access_token: "token",
          access_token_secret: "token-secret",
          signature_method: "PLAINTEXT",
          placement: "body",
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(new URLSearchParams(bodies[0]).get("oauth_signature")).toBe(
      "consumer-secret&token-secret",
    )
    expect(new URLSearchParams(bodies[1]).get("oauth_signature")).toBeNull()
    expect(new URLSearchParams(bodies[1]).get("field")).toBe("value")
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

  it("isolates cached credentials by discovery URL", () => {
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      discovery_url: "https://identity.example/one",
      client_id: "client",
    }
    expect(oauth2CredentialKey(auth)).not.toBe(
      oauth2CredentialKey({
        ...auth,
        discovery_url: "https://identity.example/two",
      }),
    )
    expect(oauth2CredentialKey(auth)).not.toBe(
      oauth2CredentialKey({ ...auth, discovery_url_kind: "document" }),
    )
  })

  it("discovers issuer endpoints once across concurrent and cached calls", async () => {
    let discoveryCalls = 0
    let tokenCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/issuer/.well-known/openid-configuration") {
          discoveryCalls++
          return Response.json({
            issuer: `http://127.0.0.1:${serverPort}/issuer`,
            authorization_endpoint: `http://127.0.0.1:${serverPort}/authorize`,
            token_endpoint: `http://127.0.0.1:${serverPort}/token`,
          })
        }
        if (url.pathname === "/token") {
          tokenCalls++
          expect(
            new URLSearchParams(await request.text()).get("grant_type"),
          ).toBe("client_credentials")
          return Response.json({
            access_token: "discovered-token",
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
      discovery_url: `http://127.0.0.1:${server.port}/issuer/`,
      client_id: "discovery-client",
      credentials_id: `discovery-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })
    const request = resourceRequest(
      `http://127.0.0.1:${server.port}/resource`,
      auth,
    )
    const [first, second] = await Promise.all([
      send(request, { oauthMode: "cached-only" }),
      send(request, { oauthMode: "cached-only" }),
    ])
    const third = await send(request, { oauthMode: "cached-only" })

    expect(first.body).toBe("Bearer discovered-token")
    expect(second.body).toBe("Bearer discovered-token")
    expect(third.body).toBe("Bearer discovered-token")
    expect(discoveryCalls).toBe(1)
    expect(tokenCalls).toBe(1)
  })

  it("accepts a custom discovery document URL", async () => {
    const paths: string[] = []
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        const path = new URL(request.url).pathname
        paths.push(path)
        if (path === "/oidc-metadata") {
          return new Response(
            JSON.stringify({
              issuer: `http://127.0.0.1:${serverPort}/custom`,
              token_endpoint: `http://127.0.0.1:${serverPort}/token`,
            }),
            { headers: { "content-type": "text/plain" } },
          )
        }
        return Response.json({ access_token: "direct-token" })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      discovery_url: `http://127.0.0.1:${server.port}/oidc-metadata`,
      discovery_url_kind: "document" as const,
      client_id: "direct-client",
      credentials_id: `direct-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })

    expect(
      (await resolveOAuth2Token(auth, { mode: "cached-only" })).token,
    ).toBe("direct-token")
    expect(paths).toEqual(["/oidc-metadata", "/token"])
  })

  it("keeps explicit endpoints authoritative and skips discovery", async () => {
    let discoveryCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        if (new URL(request.url).pathname.includes(".well-known")) {
          discoveryCalls++
          return Response.json({
            token_endpoint: "https://wrong.example/token",
          })
        }
        return Response.json({ access_token: "explicit-token" })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      discovery_url: `http://127.0.0.1:${server.port}`,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "explicit-client",
      credentials_id: `explicit-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })

    expect(
      (await resolveOAuth2Token(auth, { mode: "cached-only" })).token,
    ).toBe("explicit-token")
    expect(discoveryCalls).toBe(0)
  })

  it("uses an explicit refresh endpoint without discovery", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-refresh-url-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      `collection_id: ${crypto.randomUUID()}\n`,
    )
    let discoveryCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        if (new URL(request.url).pathname.includes(".well-known")) {
          discoveryCalls++
          return Response.json({})
        }
        return Response.json({ access_token: "refreshed-token" })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      discovery_url: `http://127.0.0.1:${server.port}`,
      refresh_token_url: `http://127.0.0.1:${server.port}/refresh`,
      client_id: "refresh-url-client",
      credentials_id: `refresh-url-${crypto.randomUUID()}`,
      auto_fetch_token: false,
    }
    authToClear.push({ auth, dir })
    await setOAuth2Credential(
      dir,
      oauth2CredentialKey(auth),
      JSON.stringify({
        access_token: "expired-token",
        refresh_token: "refresh-token",
        _noodle_expires_at: 1,
      }),
    )

    expect(
      (
        await resolveOAuth2Token(auth, {
          collectionDir: dir,
          mode: "cached-only",
        })
      ).token,
    ).toBe("refreshed-token")
    expect(discoveryCalls).toBe(0)
  })

  it("reports invalid discovery responses and unsafe discovered endpoints", async () => {
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        const path = new URL(request.url).pathname
        const issuer = `http://127.0.0.1:${serverPort}/${path.split("/")[1]}`
        if (path.startsWith("/status/"))
          return new Response("", { status: 503 })
        if (path.startsWith("/json/")) return new Response("{")
        if (path.startsWith("/missing-issuer/")) {
          return Response.json({
            token_endpoint: `http://127.0.0.1:${serverPort}/token`,
          })
        }
        if (path.startsWith("/missing/")) return Response.json({ issuer })
        if (path.startsWith("/wrong-type/")) {
          return Response.json({ issuer, token_endpoint: 42 })
        }
        if (path.startsWith("/issuer-mismatch/")) {
          return Response.json({
            issuer: `http://127.0.0.1:${serverPort}/other`,
            token_endpoint: `http://127.0.0.1:${serverPort}/token`,
          })
        }
        return Response.json({
          issuer,
          token_endpoint: "http://identity.example/token",
        })
      },
    })
    servers.push(server)
    const cases = [
      ["status", "OAuth 2 discovery endpoint returned HTTP 503"],
      ["json", "OAuth 2 discovery endpoint returned invalid JSON"],
      [
        "missing-issuer",
        "OAuth 2 discovery response field issuer must be a non-empty string",
      ],
      [
        "missing",
        "OAuth 2 discovery response field token_endpoint must be a non-empty string",
      ],
      [
        "wrong-type",
        "OAuth 2 discovery response field token_endpoint must be a non-empty string",
      ],
      [
        "issuer-mismatch",
        "OAuth 2 discovery response issuer does not match discovery_url",
      ],
      ["unsafe", "must use HTTPS unless it targets a loopback host"],
    ] as const

    for (const [path, message] of cases) {
      const auth = {
        ...defaultOAuth2Auth(),
        grant_type: "client_credentials" as const,
        discovery_url: `http://127.0.0.1:${server.port}/${path}`,
        client_id: "invalid-discovery-client",
        credentials_id: `${path}-${crypto.randomUUID()}`,
      }
      await expect(
        resolveOAuth2Token(auth, { mode: "cached-only" }),
      ).rejects.toThrow(message)
    }
    await expect(
      resolveOAuth2Token(
        {
          ...defaultOAuth2Auth(),
          grant_type: "client_credentials",
          discovery_url: "http://identity.example",
          client_id: "unsafe-discovery-client",
          credentials_id: `unsafe-url-${crypto.randomUUID()}`,
        },
        { mode: "cached-only" },
      ),
    ).rejects.toThrow("must use HTTPS unless it targets a loopback host")
  })

  it("cancels discovery with the caller signal", async () => {
    let markSeen!: () => void
    let release!: () => void
    const seen = new Promise<void>((resolve) => {
      markSeen = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch() {
        markSeen()
        await gate
        return Response.json({})
      },
    })
    servers.push(server)
    const controller = new AbortController()
    const pending = resolveOAuth2Token(
      {
        ...defaultOAuth2Auth(),
        grant_type: "client_credentials",
        discovery_url: `http://127.0.0.1:${server.port}`,
        client_id: "cancel-client",
        credentials_id: `cancel-${crypto.randomUUID()}`,
      },
      { mode: "cached-only", signal: controller.signal },
    )
    await seen
    controller.abort()
    await expect(pending).rejects.toThrow()
    release()
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
          expect(body.get("client_secret")).toBe("pa$word")
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
      client_secret: "$CLIENT_SECRET",
      credentials_id: "client-credentials-test",
    }
    const environment = {
      name: "dev",
      vars: { CLIENT_SECRET: "pa$word" },
    }
    authToClear.push({ auth, dir })
    const request = resourceRequest(
      `http://127.0.0.1:${server.port}/resource`,
      auth,
    )
    const [first, second] = await Promise.all([
      send(request, {
        collectionDir: dir,
        environment,
        oauthMode: "cached-only",
      }),
      send(request, {
        collectionDir: dir,
        environment,
        oauthMode: "cached-only",
      }),
    ])
    const third = await send(request, {
      collectionDir: dir,
      environment,
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
    let discoveryCalls = 0
    let refreshCalls = 0
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === "/issuer/.well-known/openid-configuration") {
          discoveryCalls++
          return Response.json({
            issuer: `http://127.0.0.1:${serverPort}/issuer`,
            token_endpoint: `http://127.0.0.1:${serverPort}/refresh`,
          })
        }
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
      discovery_url: `http://127.0.0.1:${server.port}/issuer`,
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
    expect(discoveryCalls).toBe(1)
    expect(refreshCalls).toBe(1)
    const stored = JSON.parse([...backend.values.values()][0]!)
    expect(stored.refresh_token).toBe("rotated-refresh")
  })

  it("fetches a new token when a stored refresh token is rejected", async () => {
    const backend = memoryBackend()
    setSecretBackendForTests(backend)
    const dir = await mkdtemp(join(tmpdir(), "noodle-oauth-refresh-fallback-"))
    tempDirs.push(dir)
    await writeFile(
      join(dir, "settings.yml"),
      "collection_id: 66666666-6666-4666-8666-666666666666\n",
    )
    let refreshCalls = 0
    let tokenCalls = 0
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === "/refresh") {
          refreshCalls++
          return Response.json(
            { error: "invalid_grant", error_description: "refresh revoked" },
            { status: 400 },
          )
        }
        tokenCalls++
        return Response.json({ access_token: "replacement-token" })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      refresh_token_url: `http://127.0.0.1:${server.port}/refresh`,
      client_id: "refresh-fallback-client",
      credentials_id: `refresh-fallback-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth, dir })
    await setOAuth2Credential(
      dir,
      oauth2CredentialKey(auth),
      JSON.stringify({
        access_token: "expired-token",
        refresh_token: "revoked-refresh",
        _noodle_expires_at: 1,
      }),
    )

    const result = await resolveOAuth2Token(auth, {
      collectionDir: dir,
      mode: "cached-only",
    })

    expect(result.token).toBe("replacement-token")
    expect(refreshCalls).toBe(1)
    expect(tokenCalls).toBe(1)
  })

  it("includes OAuth token endpoint error details", async () => {
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch() {
        return Response.json(
          { error: "invalid_client", error_description: "bad credentials" },
          { status: 400 },
        )
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "error-client",
      credentials_id: `error-${crypto.randomUUID()}`,
    }

    await expect(
      resolveOAuth2Token(auth, { mode: "cached-only" }),
    ).rejects.toThrow(
      "OAuth 2 token endpoint returned HTTP 400: invalid_client - bad credentials",
    )
  })

  it("does not coalesce forced and non-forced token acquisition", async () => {
    let tokenCalls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch() {
        const call = ++tokenCalls
        await gate
        return Response.json({ access_token: `token-${call}` })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "force-client",
      credentials_id: `force-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })

    const normal = resolveOAuth2Token(auth, { mode: "cached-only" })
    const forced = resolveOAuth2Token(
      auth,
      { mode: "cached-only" },
      { force: true },
    )
    await Bun.sleep(25)
    release()
    const results = await Promise.all([normal, forced])

    expect(tokenCalls).toBe(2)
    expect(new Set(results.map((result) => result.token)).size).toBe(2)
  })

  it("does not share token acquisition bound to a caller signal", async () => {
    let tokenCalls = 0
    let markFirstSeen!: () => void
    let releaseFirst!: () => void
    const firstSeen = new Promise<void>((resolve) => {
      markFirstSeen = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      async fetch() {
        const call = ++tokenCalls
        if (call === 1) {
          markFirstSeen()
          await firstGate
        }
        return Response.json({ access_token: `signal-token-${call}` })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "client_credentials" as const,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      client_id: "signal-client",
      credentials_id: `signal-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })
    const controller = new AbortController()

    const first = resolveOAuth2Token(auth, {
      mode: "cached-only",
      signal: controller.signal,
    })
    await firstSeen
    const second = resolveOAuth2Token(auth, { mode: "cached-only" })
    controller.abort()
    const firstStatus = await first.then(
      () => "fulfilled",
      () => "rejected",
    )
    releaseFirst()

    expect(firstStatus).toBe("rejected")
    expect((await second).token).toBe("signal-token-2")
    expect(tokenCalls).toBe(2)
  })

  it("does not coalesce cached-only and interactive token acquisition", async () => {
    const callbackPort = await unusedPort()
    const serverPort = await unusedPort()
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: serverPort,
      fetch(request) {
        if (new URL(request.url).pathname === "/token") {
          return Response.json({ access_token: "interactive-token" })
        }
        return new Response("not found", { status: 404 })
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      authorization_url: `http://127.0.0.1:${server.port}/authorize`,
      access_token_url: `http://127.0.0.1:${server.port}/token`,
      redirect_uri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      client_id: "mode-client",
      credentials_id: `mode-${crypto.randomUUID()}`,
    }
    authToClear.push({ auth })

    const cachedOnly = resolveOAuth2Token(auth, { mode: "cached-only" })
    const interactive = resolveOAuth2Token(auth, {
      mode: "interactive",
      openBrowser: async (authorizationUrl) => {
        const authorization = new URL(authorizationUrl)
        const callback = new URL(
          authorization.searchParams.get("redirect_uri")!,
        )
        callback.searchParams.set("code", "mode-code")
        callback.searchParams.set(
          "state",
          authorization.searchParams.get("state")!,
        )
        await fetch(callback)
      },
    })
    const [cachedResult, interactiveResult] = await Promise.allSettled([
      cachedOnly,
      interactive,
    ])

    expect(cachedResult.status).toBe("rejected")
    expect(interactiveResult.status).toBe("fulfilled")
    if (interactiveResult.status === "fulfilled") {
      expect(interactiveResult.value.token).toBe("interactive-token")
    }
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
          const completion = await fetch(callback)
          expect(await completion.text()).toContain("Authorization complete")
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
      fetch(request) {
        if (
          new URL(request.url).pathname ===
          "/issuer/.well-known/openid-configuration"
        ) {
          return Response.json({
            issuer: `http://127.0.0.1:${serverPort}/issuer`,
            authorization_endpoint: `http://127.0.0.1:${serverPort}/authorize`,
          })
        }
        return new Response(request.headers.get("authorization") ?? "")
      },
    })
    servers.push(server)
    const auth = {
      ...defaultOAuth2Auth(),
      grant_type: "implicit" as const,
      discovery_url: `http://127.0.0.1:${server.port}/issuer`,
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

  it("lets cancellation finish while the browser launcher is pending", async () => {
    const callbackPort = await unusedPort()
    const controller = new AbortController()
    let releaseLauncher!: () => void
    const launcher = new Promise<void>((resolve) => {
      releaseLauncher = resolve
    })
    const pending = runLoopbackAuthorization({
      authorizationUrl: "https://identity.example/authorize",
      redirectUri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      state: "pending-launcher",
      implicit: false,
      signal: controller.signal,
      openBrowser: () => launcher,
    })
    controller.abort()
    const outcome = await Promise.race([
      pending.then(
        () => "resolved",
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError"
            ? "aborted"
            : "rejected",
      ),
      Bun.sleep(50).then(() => "pending"),
    ])
    releaseLauncher()
    await pending.catch(() => {})

    expect(outcome).toBe("aborted")
  })

  it("does not leave browser authorization active after redirect validation fails", async () => {
    await expect(
      runLoopbackAuthorization({
        authorizationUrl: "https://identity.example/authorize",
        redirectUri: "https://identity.example/callback",
        state: "invalid-redirect",
        implicit: false,
      }),
    ).rejects.toThrow("must use http")

    const callbackPort = await unusedPort()
    const controller = new AbortController()
    const next = runLoopbackAuthorization({
      authorizationUrl: "https://identity.example/authorize",
      redirectUri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
      state: "valid-redirect",
      implicit: false,
      signal: controller.signal,
      openBrowser: async () => controller.abort(),
    })
    await expect(next).rejects.toMatchObject({ name: "AbortError" })
  })
})
