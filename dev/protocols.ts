import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { Agent, request as httpRequest } from "node:http"
import {
  createType1Message,
  createType3Message,
  parseType2Message,
} from "../src/requests/ntlm"
import { lang } from "../src/lang"
import { loadEnvironment } from "../src/env/load"
import { substitute } from "../src/requests/substitute"
import { send } from "../src/requests/send"
import { resolveOAuth2Token } from "../src/requests/oauth2"
import { runLoopbackAuthorization } from "../src/requests/oauth2Browser"
import type { Request as NoodleRequest, OAuth2Auth } from "../src/schema"
import type { startDevServer } from "./server"

export async function checkProtocols(
  services: Awaited<ReturnType<typeof startDevServer>>,
  root: string,
) {
  const { base_url: base, https_url: secure, proxy_url: proxy } = services.urls
  const direct = { kind: "direct" as const, source: "cli" as const }
  const request = (
    url: string,
    overrides: Partial<NoodleRequest> = {},
  ): NoodleRequest => ({
    id: "development",
    name: "Development protocol",
    method: "GET",
    url,
    timeout: 5000,
    headers: {},
    params: [],
    auth: { type: "none" },
    ...overrides,
  })
  const environment = await loadEnvironment(
    join(root, ".environments"),
    "development",
  )
  const parsed = async (id: string) => {
    const example = lang.parseRequest(
      id,
      await readFile(join(root, `${id}.yml`), "utf8"),
    )
    return { ...example, auth: substitute(example, environment).auth }
  }
  const proxyPolicy = {
    kind: "custom" as const,
    source: "collection" as const,
    url: proxy,
    bypass: [],
    auth: true,
    credentials: { username: "proxy-user", password: "proxy-pass" },
  }
  const tlsPolicy = {
    collectionDir: root,
    settings: { caBundle: "fixtures/tls/ca.pem" },
  }
  for (const url of [base, services.urls.alternate_url])
    assert.equal((await fetch(`${url}/health`)).status, 200)
  assert.equal(
    (
      await send(request(`${secure}/health`), {
        proxyPolicy: direct,
        tlsPolicy,
      })
    ).status,
    200,
  )
  await assert.rejects(
    send(request(`${secure}/health`), { proxyPolicy: direct }),
  )
  assert.equal(
    (
      await send(request(`${secure}/health`, { tls: { verify: false } }), {
        proxyPolicy: direct,
      })
    ).status,
    200,
  )
  await assert.rejects(
    send(request(`${services.urls.selfsigned_url}/health`), {
      proxyPolicy: direct,
      tlsPolicy,
    }),
  )
  assert.equal(
    (
      await send(
        request(`${services.urls.selfsigned_url}/health`, {
          tls: { verify: false },
        }),
        { proxyPolicy: direct },
      )
    ).status,
    200,
  )
  assert.equal(
    (await send(request(`${secure}/mtls`), { proxyPolicy: direct, tlsPolicy }))
      .status,
    403,
  )
  const mutual = {
    ...tlsPolicy,
    settings: {
      ...tlsPolicy.settings,
      clientCertificates: [
        {
          host: "localhost",
          port: Number(new URL(secure).port),
          certFile: "fixtures/tls/client.pem",
          keyFile: "fixtures/tls/client-key.pem",
        },
      ],
    },
  }
  assert.equal(
    (
      await send(request(`${secure}/mtls`), {
        proxyPolicy: direct,
        tlsPolicy: mutual,
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await send(request(`${secure}/mtls`), {
        proxyPolicy: direct,
        tlsPolicy: {
          ...mutual,
          settings: {
            ...mutual.settings,
            clientCertificates: [
              {
                ...mutual.settings.clientCertificates[0]!,
                keyFile: "fixtures/tls/client-encrypted-key.pem",
                secretId: "development-key",
              },
            ],
          },
          passphrases: { "development-key": "test-passphrase" },
        },
      })
    ).status,
    200,
  )
  const invalidClient = {
    ...mutual,
    settings: {
      ...mutual.settings,
      clientCertificates: [
        {
          ...mutual.settings.clientCertificates[0]!,
          certFile: "fixtures/tls/selfsigned.pem",
          keyFile: "fixtures/tls/selfsigned-key.pem",
        },
      ],
    },
  }
  assert.equal(
    (
      await send(request(`${secure}/mtls`), {
        proxyPolicy: direct,
        tlsPolicy: invalidClient,
      })
    ).status,
    403,
  )
  assert.equal(
    (await send(request(`${base}/echo`), { proxyPolicy })).status,
    200,
  )
  assert.equal(
    (await send(request(`${secure}/echo`), { proxyPolicy, tlsPolicy })).status,
    200,
  )
  const ntlm = await parsed("auth/ntlm/valid")
  ntlm.url = `${base}/auth/ntlm`
  assert.equal((await send(ntlm, { proxyPolicy })).status, 200)
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  const other = new Agent({ keepAlive: true, maxSockets: 1 })
  const handshake = (authorization: string, connection = agent) =>
    new Promise<{ status: number; challenge: string }>((resolve, reject) => {
      const req = httpRequest(
        `${base}/auth/ntlm`,
        { agent: connection, headers: { authorization } },
        (res) => {
          res.resume()
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              challenge: String(res.headers["www-authenticate"] ?? ""),
            }),
          )
        },
      )
      req.on("error", reject)
      req.end()
    })
  try {
    const offered = await handshake(
      `NTLM ${createType1Message().toString("base64")}`,
    )
    assert.equal(offered.status, 401)
    const type3 = createType3Message(
      parseType2Message(offered.challenge.slice(5)),
      {
        username: "User",
        password: "Password",
        domain: "Domain",
        workstation: "Development",
      },
    )
    const authorization = `NTLM ${type3.toString("base64")}`
    assert.equal((await handshake(authorization, other)).status, 401)
    assert.equal((await handshake(authorization)).status, 200)
    assert.equal((await handshake(authorization)).status, 401)
  } finally {
    agent.destroy()
    other.destroy()
  }
  const badProxy = {
    ...proxyPolicy,
    credentials: { username: "proxy-user", password: "wrong" },
  }
  await assert.rejects(send(ntlm, { proxyPolicy: badProxy }))
  const blocked = await fetch(proxy, {
    method: "GET",
    headers: { authorization: "unused" },
  })
  assert.equal(blocked.status, 400)
  const proxyCount = services.proxyRequests.length
  assert.equal(
    (await send(request(`${base}/echo`), { proxyPolicy: direct })).status,
    200,
  )
  assert.equal(services.proxyRequests.length, proxyCount)
  const controller = new AbortController()
  const pending = send(request(`${base}/delay/10000`), {
    proxyPolicy: direct,
    signal: controller.signal,
    onNetworkEvent: () => controller.abort(),
  })
  await assert.rejects(pending)

  const client = async (parameters: URLSearchParams) =>
    fetch(`${base}/oauth/token`, { method: "POST", body: parameters })
  const baseForm = {
    client_id: "noodle-client",
    client_secret: "noodle-client-secret",
  }
  const token = (await (
    await client(
      new URLSearchParams({ ...baseForm, grant_type: "client_credentials" }),
    )
  ).json()) as { access_token: string; refresh_token: string }
  assert.equal(
    (
      await fetch(`${base}/oauth/profile`, {
        headers: { authorization: `Bearer ${token.access_token}` },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await fetch(`${base}/oauth/expire`, {
        method: "POST",
        body: new URLSearchParams({ token: token.access_token }),
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await fetch(`${base}/oauth/profile`, {
        headers: { authorization: `Bearer ${token.access_token}` },
      })
    ).status,
    401,
  )
  const refreshed = await client(
    new URLSearchParams({
      ...baseForm,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  )
  assert.equal(refreshed.status, 200)
  const replacement = (await refreshed.json()) as { access_token: string }
  assert.notEqual(replacement.access_token, token.access_token)
  assert.equal(
    (
      await client(
        new URLSearchParams({
          ...baseForm,
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
        }),
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await client(
        new URLSearchParams({
          ...baseForm,
          grant_type: "password",
          username: "User",
          password: "wrong",
        }),
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await fetch(`${base}/oauth/profile`, {
        headers: { authorization: "Bearer expired-development-token" },
      })
    ).status,
    401,
  )

  for (const method of ["S256", "plain"] as const) {
    const verifier = "a".repeat(48)
    const challenge =
      method === "S256"
        ? createHash("sha256").update(verifier).digest("base64url")
        : verifier
    const parameters = new URLSearchParams({
      client_id: "noodle-client",
      response_type: "code",
      redirect_uri: "http://127.0.0.1:8765/oauth/callback",
      state: "local-state",
      code_challenge: challenge,
      code_challenge_method: method,
    })
    const response = await fetch(`${base}/oauth/authorize?${parameters}`, {
      redirect: "manual",
    })
    assert.equal(response.status, 302)
    const callback = new URL(response.headers.get("location")!)
    assert.equal(callback.searchParams.get("state"), "local-state")
    const code = callback.searchParams.get("code")!
    assert.equal(
      (
        await client(
          new URLSearchParams({
            ...baseForm,
            grant_type: "authorization_code",
            code,
            redirect_uri: "http://127.0.0.1:8765/oauth/callback",
            code_verifier: verifier,
          }),
        )
      ).status,
      200,
    )
    assert.equal(
      (
        await client(
          new URLSearchParams({
            ...baseForm,
            grant_type: "authorization_code",
            code,
            redirect_uri: "http://127.0.0.1:8765/oauth/callback",
            code_verifier: verifier,
          }),
        )
      ).status,
      400,
    )
    const invalid = await fetch(`${base}/oauth/authorize?${parameters}`, {
      redirect: "manual",
    })
    const badCode = new URL(invalid.headers.get("location")!).searchParams.get(
      "code",
    )!
    assert.equal(
      (
        await client(
          new URLSearchParams({
            ...baseForm,
            grant_type: "authorization_code",
            code: badCode,
            redirect_uri: "http://127.0.0.1:8765/oauth/callback",
            code_verifier: "wrong",
          }),
        )
      ).status,
      400,
    )
  }
  assert.equal(
    (
      await fetch(
        `${base}/oauth/authorize?${new URLSearchParams({ client_id: "noodle-client", redirect_uri: "https://example.test/callback", response_type: "code" })}`,
        { redirect: "manual" },
      )
    ).status,
    400,
  )

  // The actual Noodle browser callback path runs without opening the user's browser.
  const callbackServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  })
  const callbackPort = callbackServer.port
  callbackServer.stop(true)
  assert(callbackPort)
  const redirect = `http://127.0.0.1:${callbackPort}/oauth/callback`
  const openBrowser = async (url: string) => {
    const response = await fetch(url, { redirect: "manual" })
    assert.equal(response.status, 302)
    const destination = new URL(response.headers.get("location")!)
    if (destination.hash) {
      destination.search = destination.hash.slice(1)
      destination.hash = ""
    }
    await fetch(destination)
  }
  for (const id of [
    "oauth-code-s256",
    "oauth-code-plain",
    "oauth-implicit-token",
    "oauth-implicit-id_token",
    "oauth-implicit-token-id_token",
  ]) {
    const example = await parsed(`interactive/${id}`)
    const auth = example.auth as OAuth2Auth
    auth.authorization_url = `${base}/oauth/authorize`
    auth.access_token_url = `${base}/oauth/token`
    auth.refresh_token_url = `${base}/oauth/token`
    auth.redirect_uri = redirect
    const resolved = await resolveOAuth2Token(auth, {
      collectionDir: root,
      mode: "interactive",
      proxyPolicy: direct,
      openBrowser,
    })
    assert.equal(
      (
        await fetch(`${base}/oauth/profile`, {
          headers: { authorization: `Bearer ${resolved.token}` },
        })
      ).status,
      200,
    )
  }
  const deniedUrl = new URL(`${base}/oauth/authorize`)
  deniedUrl.search = new URLSearchParams({
    client_id: "noodle-client",
    response_type: "code",
    redirect_uri: redirect,
    state: "denied-state",
    deny: "true",
  }).toString()
  await assert.rejects(
    runLoopbackAuthorization({
      authorizationUrl: deniedUrl.toString(),
      redirectUri: redirect,
      state: "denied-state",
      implicit: false,
      openBrowser,
    }),
    /access_denied/,
  )
  await assert.rejects(
    runLoopbackAuthorization({
      authorizationUrl: deniedUrl.toString(),
      redirectUri: redirect,
      state: "expected-state",
      implicit: false,
      openBrowser,
    }),
    /state validation/,
  )
  const expiring = (await parsed("auth/oauth2/client-body")).auth as OAuth2Auth
  expiring.access_token_url = `${base}/oauth/token`
  expiring.refresh_token_url = `${base}/oauth/token`
  expiring.credentials_id = "noodle-local-expiry"
  expiring.additional_parameters.token.push({
    name: "short_lived",
    value: "true",
    enabled: true,
    placement: "body",
  })
  const context = {
    collectionDir: root,
    mode: "interactive" as const,
    proxyPolicy: direct,
  }
  const first = await resolveOAuth2Token(expiring, context)
  const second = await resolveOAuth2Token(expiring, context)
  assert.notEqual(first.token, second.token)
  assert.equal(
    (
      await fetch(`${base}/oauth/profile`, {
        headers: { authorization: `Bearer ${second.token}` },
      })
    ).status,
    200,
  )
  return {
    oauthCallbacks: 5,
    tls: true,
    proxy: true,
    cancellation: true,
    refresh: true,
  }
}
