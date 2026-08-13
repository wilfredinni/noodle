import { afterEach, describe, it, expect, mock } from "bun:test"
import type { Collection, NetworkError, Request } from "../../src/schema"
import { send, interpolatePathParams } from "../../src/requests/send"
import type { CollectionCookieJar } from "../../src/cookies"

const servers: Bun.Server<undefined>[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})

function startServer(
  handler: (request: globalThis.Request) => Response | Promise<Response>,
): string {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })
  servers.push(server)
  return `http://127.0.0.1:${server.port}`
}

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "test",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: [],
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("send — param deduplication", () => {
  it("params block replaces inline URL value for same key", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42",
        params: [{ name: "userId", value: "99", enabled: true }],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("99")
      expect(parsed.searchParams.getAll("userId")).toEqual(["99"])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("replaces same-key inline param with multiple params block entries", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?id=1&sort=asc",
        params: [
          { name: "id", value: "a", enabled: true },
          { name: "id", value: "b", enabled: true },
        ],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("sort")).toBe("asc")
      expect(parsed.searchParams.getAll("id")).toEqual(["a", "b"])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("preserves param only in URL when not in params block", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts?userId=42",
        params: [],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("42")
    } finally {
      globalThis.fetch = orig
    }
  })

  it("appends param only in params block when not in URL", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts",
        params: [{ name: "userId", value: "42", enabled: true }],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.get("userId")).toBe("42")
    } finally {
      globalThis.fetch = orig
    }
  })

  it("supports multiple params with same key via array format", async () => {
    let captured: string | undefined
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured = url.toString()
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const req = makeReq({
        url: "https://api.example.com/posts",
        params: [
          { name: "filter", value: "active", enabled: true },
          { name: "filter", value: "pending", enabled: true },
        ],
      })
      await send(req)
      const parsed = new URL(captured!)
      expect(parsed.searchParams.getAll("filter")).toEqual([
        "active",
        "pending",
      ])
    } finally {
      globalThis.fetch = orig
    }
  })
})

describe("send — AWS SigV4", () => {
  const awsAuth = {
    type: "aws_sigv4" as const,
    access_key: "AKIDEXAMPLE",
    secret_key: "secret",
    region: "us-east-1",
    service: "execute-api",
  }

  it("signs the final URL and exact JSON body", async () => {
    const originalFetch = globalThis.fetch
    let capturedUrl = ""
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock(async (url, init) => {
      capturedUrl = url.toString()
      capturedInit = init
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          method: "POST",
          url: "https://api.example.com/items?existing=1",
          params: [{ name: "filter", value: "active", enabled: true }],
          bodyType: "json",
          body: '{"ok":true}',
          auth: awsAuth,
        }),
      )
      const headers = new Headers(capturedInit?.headers)
      expect(capturedUrl).toContain("existing=1&filter=active")
      expect(capturedInit?.body).toBe('{"ok":true}')
      expect(headers.get("authorization")).toContain("AWS4-HMAC-SHA256")
      expect(headers.get("authorization")).toContain(
        "/execute-api/aws4_request",
      )
      expect(headers.get("x-amz-date")).not.toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("should substitute AWS auth fields before signing", async () => {
    const originalFetch = globalThis.fetch
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock(async (_url, init) => {
      capturedInit = init
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          auth: {
            type: "aws_sigv4",
            access_key: "$ACCESS",
            secret_key: "$SECRET",
            region: "$REGION",
            service: "$SERVICE",
            session_token: "$SESSION",
          },
        }),
        {
          environment: {
            name: "dev",
            vars: {
              ACCESS: "AKIDEXAMPLE",
              SECRET: "secret",
              REGION: "us-west-2",
              SERVICE: "execute-api",
              SESSION: "session-token",
            },
          },
        },
      )

      const headers = new Headers(capturedInit?.headers)
      expect(headers.get("authorization")).toContain("Credential=AKIDEXAMPLE/")
      expect(headers.get("authorization")).toContain(
        "/us-west-2/execute-api/aws4_request",
      )
      expect(headers.get("authorization")).not.toContain("$")
      expect(headers.get("x-amz-security-token")).toBe("session-token")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("re-signs same-origin redirects and stops signing cross-origin hops", async () => {
    const originalFetch = globalThis.fetch
    const authorizations: Array<string | null> = []
    let calls = 0
    globalThis.fetch = mock(async (_url, init) => {
      calls++
      authorizations.push(new Headers(init?.headers).get("authorization"))
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "/next" },
        })
      }
      if (calls === 2) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://other.example/final" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({ url: "https://api.example.com/start", auth: awsAuth }),
      )
      expect(authorizations[0]).toContain("AWS4-HMAC-SHA256")
      expect(authorizations[1]).toContain("AWS4-HMAC-SHA256")
      expect(authorizations[0]).not.toBe(authorizations[1])
      expect(authorizations[2]).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("rejects multipart before fetch", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls++
      return new Response("ok")
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(
        send(
          makeReq({
            method: "POST",
            auth: awsAuth,
            bodyType: "multipart",
            formData: [],
          }),
        ),
      ).rejects.toThrow("AWS SigV4 does not support multipart bodies")
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("send — NTLMv2", () => {
  const ntlmAuth = {
    type: "ntlm" as const,
    username: "$USER",
    password: "$PASSWORD",
    domain: "$DOMAIN",
    workstation: "$WORKSTATION",
  }

  function type2Token(targetInfo = Buffer.from([0, 0, 0, 0])): string {
    const message = Buffer.alloc(48 + targetInfo.length)
    Buffer.from("NTLMSSP\0", "ascii").copy(message)
    message.writeUInt32LE(2, 8)
    message.writeUInt32LE(0x00888205, 20)
    Buffer.from("0123456789abcdef", "hex").copy(message, 24)
    message.writeUInt16LE(targetInfo.length, 40)
    message.writeUInt16LE(targetInfo.length, 42)
    message.writeUInt32LE(48, 44)
    targetInfo.copy(message, 48)
    return message.toString("base64")
  }

  function environment() {
    return {
      name: "dev",
      vars: {
        USER: "alice",
        PASSWORD: "secret",
        DOMAIN: "EXAMPLE",
        WORKSTATION: "NOODLE",
      },
    }
  }

  it("performs the standard three-request handshake on replayable bodies", async () => {
    const headers: Array<string | null> = []
    const bodies: string[] = []
    const url = startServer(async (request) => {
      headers.push(request.headers.get("authorization"))
      bodies.push(await request.text())
      if (headers.length === 1) {
        return new Response("offer", {
          status: 401,
          headers: { "www-authenticate": "Negotiate, NTLM" },
        })
      }
      if (headers.length === 2) {
        return new Response("challenge", {
          status: 401,
          headers: { "www-authenticate": `NTLM ${type2Token()}` },
        })
      }
      return new Response("ok")
    })

    const result = await send(
      makeReq({
        url,
        method: "POST",
        auth: ntlmAuth,
        bodyType: "json",
        body: '{"ok":true}',
      }),
      { environment: environment() },
    )
    expect(result.status).toBe(200)
    expect(headers).toHaveLength(3)
    expect(headers[0]).toBeNull()
    expect(Buffer.from(headers[1]!.slice(5), "base64").readUInt32LE(8)).toBe(1)
    expect(Buffer.from(headers[2]!.slice(5), "base64").readUInt32LE(8)).toBe(3)
    expect(bodies).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}'])
    expect(
      result.network?.filter((event) => event.type === "request"),
    ).toHaveLength(3)
    expect(JSON.stringify(result.network)).not.toContain(headers[2])
  })

  it("captures Set-Cookie headers from every handshake response", async () => {
    let leg = 0
    const url = startServer(() => {
      leg++
      if (leg === 1) {
        return new Response("offer", {
          status: 401,
          headers: {
            "www-authenticate": "NTLM",
            "set-cookie": "offer=1; Path=/",
          },
        })
      }
      if (leg === 2) {
        return new Response("challenge", {
          status: 401,
          headers: {
            "www-authenticate": `NTLM ${type2Token()}`,
            "set-cookie": "challenge=1; Path=/",
          },
        })
      }
      return new Response("ok", {
        headers: { "set-cookie": "final=1; Path=/" },
      })
    })
    const captured: string[] = []
    const cookies = {
      refresh: async () => {},
      cookieHeaderFor: () => "",
      storeResponseCookies: (_url: string, headers: Headers) => {
        captured.push(headers.get("set-cookie") ?? "")
      },
    } as unknown as CollectionCookieJar

    await send(makeReq({ url, auth: ntlmAuth }), {
      environment: environment(),
      cookies,
    })

    expect(captured).toEqual([
      "offer=1; Path=/",
      "challenge=1; Path=/",
      "final=1; Path=/",
    ])
  })

  it("uses the two-request shortcut for an eager Type 2 without MIC", async () => {
    const headers: Array<string | null> = []
    const url = startServer((request) => {
      headers.push(request.headers.get("authorization"))
      if (headers.length === 1) {
        return new Response("challenge", {
          status: 401,
          headers: { "www-authenticate": `NTLM ${type2Token()}` },
        })
      }
      return new Response("ok")
    })

    await send(makeReq({ url, auth: ntlmAuth }), {
      environment: environment(),
    })
    expect(headers).toHaveLength(2)
    expect(Buffer.from(headers[1]!.slice(5), "base64").readUInt32LE(8)).toBe(3)
  })

  it("obtains a Type 1 transcript when an eager challenge requires MIC", async () => {
    const targetInfo = Buffer.alloc(16)
    targetInfo.writeUInt16LE(7, 0)
    targetInfo.writeUInt16LE(8, 2)
    targetInfo.writeBigUInt64LE(1n, 4)
    const token = type2Token(targetInfo)
    const headers: Array<string | null> = []
    const url = startServer((request) => {
      headers.push(request.headers.get("authorization"))
      if (headers.length < 3) {
        return new Response("challenge", {
          status: 401,
          headers: { "www-authenticate": `NTLM ${token}` },
        })
      }
      return new Response("ok")
    })

    await send(makeReq({ url, auth: ntlmAuth }), {
      environment: environment(),
    })
    expect(headers).toHaveLength(3)
    expect(Buffer.from(headers[1]!.slice(5), "base64").readUInt32LE(8)).toBe(1)
    const type3 = Buffer.from(headers[2]!.slice(5), "base64")
    expect(type3.readUInt32LE(8)).toBe(3)
    expect(type3.subarray(72, 88).equals(Buffer.alloc(16))).toBe(false)
  })

  it("returns the final 401 without looping and rejects malformed NTLM", async () => {
    let calls = 0
    const url = startServer(() => {
      calls++
      return new Response("no", {
        status: 401,
        headers: {
          "www-authenticate": calls === 1 ? "NTLM" : `NTLM ${type2Token()}`,
        },
      })
    })

    const result = await send(makeReq({ url, auth: ntlmAuth }), {
      environment: environment(),
    })
    expect(result.status).toBe(401)
    expect(calls).toBe(3)

    const malformedUrl = startServer(() => {
      return new Response("bad", {
        status: 401,
        headers: { "www-authenticate": "NTLM !!!" },
      })
    })
    await expect(
      send(makeReq({ url: malformedUrl, auth: ntlmAuth }), {
        environment: environment(),
      }),
    ).rejects.toThrow("invalid NTLM challenge")
  })

  it("does not send NTLM credentials across an origin-changing redirect", async () => {
    const headers: Array<string | null> = []
    const destination = startServer((request) => {
      headers.push(request.headers.get("authorization"))
      return new Response("protected", {
        status: 401,
        headers: { "www-authenticate": "NTLM" },
      })
    })
    const source = startServer((request) => {
      headers.push(request.headers.get("authorization"))
      return new Response(null, {
        status: 302,
        headers: { location: `${destination}/protected` },
      })
    })

    const result = await send(makeReq({ url: source, auth: ntlmAuth }), {
      environment: environment(),
    })
    expect(result.status).toBe(401)
    expect(headers).toEqual([null, null])
  })
})

describe("send — inherited auth", () => {
  it("should substitute auth inherited from a folder before sending", async () => {
    const originalFetch = globalThis.fetch
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock(async (_url, init) => {
      capturedInit = init
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch
    const collection: Collection = {
      id: "collection",
      name: "Collection",
      items: [
        {
          type: "folder",
          data: {
            id: "api",
            name: "API",
            path: "api",
            overrides: {
              auth: { type: "bearer", token: "$FOLDER_TOKEN" },
            },
            children: [],
          },
        },
      ],
    }

    try {
      await send(makeReq({ auth: { type: "inherit" } }), {
        collection,
        requestPath: "api/test",
        environment: {
          name: "dev",
          vars: { FOLDER_TOKEN: "inherited-token" },
        },
      })

      expect(new Headers(capturedInit?.headers).get("authorization")).toBe(
        "Bearer inherited-token",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("send — network trace", () => {
  it("uses Bun-backed app proxy credentials without environment overrides", async () => {
    const originalFetch = globalThis.fetch
    let proxy: string | undefined
    globalThis.fetch = mock(async (_url, init) => {
      const selected = (init as BunFetchRequestInit).proxy
      proxy = typeof selected === "string" ? selected : selected?.url
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(makeReq(), {
        environment: {
          name: "dev",
          vars: {
            NOODLE_TEST_APP_PROXY_USER: "collection-user",
            NOODLE_TEST_APP_PROXY_PASSWORD: "collection-password",
          },
        },
        proxyPolicy: {
          kind: "custom",
          source: "global",
          url: "http://proxy.test:8080",
          bypass: [],
          auth: true,
          credentials: {
            username: "bun-user",
            password: "bun-password",
          },
        },
      })

      expect(proxy).toBe("http://bun-user:bun-password@proxy.test:8080/")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to incomplete proxy authentication", async () => {
    let error: NetworkError | undefined
    try {
      await send(makeReq(), {
        proxyPolicy: {
          kind: "custom",
          source: "global",
          url: "http://proxy.test:8080",
          bypass: [],
          auth: true,
          credentials: {},
        },
      })
    } catch (caught) {
      error = caught as NetworkError
    }

    expect(error?.message).toContain(
      "authentication is enabled for the global proxy, but its username secret is missing",
    )
    expect(error?.network?.map((event) => event.type)).toEqual(["error"])
  })

  it("passes the resolved proxy to fetch and reports the selected route", async () => {
    const originalFetch = globalThis.fetch
    let proxy: string | undefined
    globalThis.fetch = mock(async (_url, init) => {
      const selected = (init as BunFetchRequestInit).proxy
      proxy = typeof selected === "string" ? selected : selected?.url
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(makeReq(), {
        proxyPolicy: {
          kind: "custom",
          source: "global",
          url: "http://proxy.test:8080",
          bypass: [],
        },
      })
      expect(proxy).toBe("http://proxy.test:8080")
      expect(response.network?.map((event) => event.type)).toEqual([
        "proxy",
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[0]?.message).toBe("Proxy: global")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("re-evaluates bypass rules for every redirect hop", async () => {
    const originalFetch = globalThis.fetch
    const proxies: Array<string | undefined> = []
    let calls = 0
    globalThis.fetch = mock(async (_url, init) => {
      const selected = (init as BunFetchRequestInit).proxy
      proxies.push(typeof selected === "string" ? selected : selected?.url)
      calls++
      return calls === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://internal.test/next" },
          })
        : new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://public.test/start" }),
        {
          proxyPolicy: {
            kind: "custom",
            source: "global",
            url: "http://proxy.test:8080",
            bypass: ["internal.test"],
          },
        },
      )
      expect(proxies).toEqual(["http://proxy.test:8080", undefined])
      expect(
        response.network
          ?.filter((event) => event.type === "proxy")
          .map((event) => event.message),
      ).toEqual(["Proxy: global", "Proxy: bypassed"])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("records request, response, body, and completion", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () => new Response("ok", { status: 200 }),
    ) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://api.example.com/users?token=secret" }),
      )
      expect(response.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[0]?.message).toBe(
        "GET https://api.example.com/users?...",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("reports each network event before the request settles", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () => new Response("ok", { status: 200 }),
    ) as unknown as typeof globalThis.fetch

    try {
      const snapshots: string[][] = []
      await send(makeReq(), {
        onNetworkEvent: (network) =>
          snapshots.push(network.map((event) => event.type)),
      })
      expect(snapshots).toEqual([
        ["request"],
        ["request", "response"],
        ["request", "response", "body"],
        ["request", "response", "body", "complete"],
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("records redirect hops", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls++
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "/v2/users" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      const response = await send(
        makeReq({ url: "https://api.example.com/users" }),
      )
      expect(response.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "redirect",
        "request",
        "response",
        "body",
        "complete",
      ])
      expect(response.network?.[2]?.message).toBe(
        "302 -> https://api.example.com/v2/users",
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("rejects redirects to non-HTTP protocols before another fetch", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls++
      return new Response(null, {
        status: 302,
        headers: { location: "file:///etc/hosts" },
      })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(send(makeReq())).rejects.toThrow(
        'redirect URL uses unsupported scheme "file:"',
      )
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("blocks HTTPS to HTTP redirect downgrades", async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls++
      return new Response(null, {
        status: 302,
        headers: { location: "http://api.example.com/insecure" },
      })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(send(makeReq())).rejects.toThrow(
        "refusing HTTPS to HTTP redirect downgrade",
      )
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("strips credentials on cross-origin redirects and keeps them stripped", async () => {
    const originalFetch = globalThis.fetch
    const captured: Headers[] = []
    let calls = 0
    globalThis.fetch = mock(async (_url, init) => {
      calls++
      captured.push(new Headers(init?.headers))
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://other.test/next" },
        })
      }
      if (calls === 2) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://api.example.com/final" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          headers: {
            Authorization: { value: "Bearer header-secret", enabled: true },
            "Proxy-Authorization": {
              value: "Basic proxy-secret",
              enabled: true,
            },
            Cookie: { value: "session=secret", enabled: true },
            Cookie2: { value: "legacy=secret", enabled: true },
            Host: { value: "api.example.com", enabled: true },
          },
          auth: {
            type: "api_key",
            key: "X-API-Key",
            value: "api-secret",
            placement: "header",
          },
        }),
      )
      expect(captured[0]?.get("authorization")).toBe("Bearer header-secret")
      expect(captured[0]?.get("proxy-authorization")).toBe("Basic proxy-secret")
      expect(captured[0]?.get("cookie")).toBe("session=secret")
      expect(captured[0]?.get("cookie2")).toBe("legacy=secret")
      expect(captured[0]?.get("host")).toBe("api.example.com")
      expect(captured[0]?.get("x-api-key")).toBe("api-secret")
      for (const headers of captured.slice(1)) {
        expect(headers.has("authorization")).toBe(false)
        expect(headers.has("proxy-authorization")).toBe(false)
        expect(headers.has("cookie")).toBe(false)
        expect(headers.has("cookie2")).toBe(false)
        expect(headers.has("host")).toBe(false)
        expect(headers.has("x-api-key")).toBe(false)
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("preserves credentials on same-origin redirects", async () => {
    const originalFetch = globalThis.fetch
    const captured: Headers[] = []
    let calls = 0
    globalThis.fetch = mock(async (_url, init) => {
      calls++
      captured.push(new Headers(init?.headers))
      return calls === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "/next" },
          })
        : new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          auth: { type: "bearer", token: "same-origin-secret" },
        }),
      )
      expect(captured.map((headers) => headers.get("authorization"))).toEqual([
        "Bearer same-origin-secret",
        "Bearer same-origin-secret",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("converts redirecting POST requests to GET for 301, 302, and 303", async () => {
    for (const status of [301, 302, 303]) {
      const originalFetch = globalThis.fetch
      const captured: RequestInit[] = []
      let calls = 0
      globalThis.fetch = mock(async (_url, init) => {
        calls++
        captured.push(init ?? {})
        return calls === 1
          ? new Response(null, { status, headers: { location: "/next" } })
          : new Response("ok", { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        await send(
          makeReq({
            method: "POST",
            bodyType: "json",
            body: '{"ok":true}',
          }),
        )
        expect(captured[0]?.method).toBe("POST")
        expect(captured[1]?.method).toBe("GET")
        expect(captured[1]?.body).toBeUndefined()
        expect(new Headers(captured[1]?.headers).has("content-type")).toBe(
          false,
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    }
  })

  it("preserves the method and body for 307 and 308 redirects", async () => {
    for (const status of [307, 308]) {
      const originalFetch = globalThis.fetch
      const captured: RequestInit[] = []
      let calls = 0
      globalThis.fetch = mock(async (_url, init) => {
        calls++
        captured.push(init ?? {})
        return calls === 1
          ? new Response(null, { status, headers: { location: "/next" } })
          : new Response("ok", { status: 200 })
      }) as unknown as typeof globalThis.fetch

      try {
        await send(
          makeReq({
            method: "POST",
            bodyType: "json",
            body: '{"ok":true}',
          }),
        )
        expect(captured.map((init) => init.method)).toEqual(["POST", "POST"])
        expect(captured[1]?.body).toBe('{"ok":true}')
        expect(new Headers(captured[1]?.headers).get("content-type")).toBe(
          "application/json",
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    }
  })

  it("attaches network activity to fetch errors", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      throw new Error("offline")
    }) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.message).toBe("requests.send: fetch failed")
      expect(error?.cause).toEqual(new Error("offline"))
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("redacts request credentials and query values from fetch errors", async () => {
    const originalFetch = globalThis.fetch
    const failure = new Error(
      "connection failed for user:password@example.com/path?token=query-secret",
    )
    globalThis.fetch = mock(async () => {
      throw failure
    }) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(
          makeReq({
            url: "https://user:password@example.com/path?token=query-secret",
          }),
        )
      } catch (caught) {
        error = caught as NetworkError
      }
      expect(error?.message).not.toContain("password")
      expect(error?.message).not.toContain("query-secret")
      expect(error?.message).toContain("requests.send: fetch failed")
      expect(error?.cause).toBe(failure)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to invalid redirect locations", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://[invalid" },
        }),
    ) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.message).toContain("invalid redirect location")
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity when redirects exceed the limit", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "/again" },
        }),
    ) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq({ maxRedirects: 0 }))
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("attaches network activity to response body read errors", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async () => {
      const response = new Response("ok", { status: 200 })
      await response.text()
      return response
    }) as unknown as typeof globalThis.fetch

    try {
      let error: NetworkError | undefined
      try {
        await send(makeReq())
      } catch (e) {
        error = e as NetworkError
      }
      expect(error?.network?.map((event) => event.type)).toEqual([
        "request",
        "response",
        "error",
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe("interpolatePathParams", () => {
  it("replaces :token with value in absolute URL", () => {
    const result = interpolatePathParams("https://api.example.com/users/:id", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("https://api.example.com/users/42")
  })

  it("replaces multiple tokens", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:userId/posts/:postId",
      [
        { name: "userId", value: "alice", enabled: true },
        { name: "postId", value: "99", enabled: true },
      ],
    )
    expect(result).toBe("https://api.example.com/users/alice/posts/99")
  })

  it("encodes special characters in value", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:name",
      [{ name: "name", value: "alice/bob", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/alice%2Fbob")
  })

  it("preserves suffix like .json after token", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:id.json",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/42.json")
  })

  it("does not partially replace unsupported token names", () => {
    const result = interpolatePathParams(
      "https://api.example.com/orders/:order~id",
      [{ name: "order", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/orders/:order~id")
  })

  it("handles relative URL", () => {
    const result = interpolatePathParams("/users/:id/posts", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("/users/42/posts")
  })

  it("throws on empty value", () => {
    expect(() =>
      interpolatePathParams("https://api.example.com/users/:id", [
        { name: "id", value: "", enabled: true },
      ]),
    ).toThrow('path parameter ":id" has no value')
  })

  it("ignores unsupported disabled state", () => {
    expect(
      interpolatePathParams("https://api.example.com/users/:id", [
        { name: "id", value: "42", enabled: false },
      ]),
    ).toBe("https://api.example.com/users/42")
  })

  it("throws when entry is missing", () => {
    expect(() =>
      interpolatePathParams("https://api.example.com/users/:id", []),
    ).toThrow('path parameter ":id" has no value')
  })

  it("returns url unchanged when no path tokens exist", () => {
    const result = interpolatePathParams("https://api.example.com/users", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("https://api.example.com/users")
  })

  it("returns url unchanged on malformed URL", () => {
    const result = interpolatePathParams("not a valid url", [
      { name: "id", value: "42", enabled: true },
    ])
    expect(result).toBe("not a valid url")
  })

  it("preserves query string after token interpolation", () => {
    const result = interpolatePathParams(
      "https://api.example.com/users/:id?verbose=true",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com/users/42?verbose=true")
  })

  it("preserves port in URL", () => {
    const result = interpolatePathParams(
      "https://api.example.com:8443/users/:id",
      [{ name: "id", value: "42", enabled: true }],
    )
    expect(result).toBe("https://api.example.com:8443/users/42")
  })
})

describe("send — URL scheme", () => {
  it("defaults remote URLs to HTTPS and local URLs to HTTP", async () => {
    const captured: string[] = []
    const orig = globalThis.fetch
    globalThis.fetch = mock(async (url: RequestInfo | URL) => {
      captured.push(url.toString())
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await send(
        makeReq({
          url: "www.example.com/users/:id",
          pathParams: [{ name: "id", value: "42", enabled: true }],
        }),
      )
      await send(makeReq({ url: "http://localhost:3000/health" }))
      await send(makeReq({ url: "localhost:3000/health" }))
      await send(makeReq({ url: "api.localhost:8080/health" }))
      await send(makeReq({ url: "api.example.com:8443/health" }))
      await send(makeReq({ url: "192.168.1.10:8080/health" }))
      await send(makeReq({ url: "127.0.0.1:8080/health" }))
      await send(makeReq({ url: "[::1]:8080/health" }))
      await send(makeReq({ url: "api:3000/health" }))
      await send(makeReq({ url: "ftp:21" }))

      expect(captured).toEqual([
        "https://www.example.com/users/42",
        "http://localhost:3000/health",
        "http://localhost:3000/health",
        "http://api.localhost:8080/health",
        "https://api.example.com:8443/health",
        "https://192.168.1.10:8080/health",
        "http://127.0.0.1:8080/health",
        "http://[::1]:8080/health",
        "https://api:3000/health",
        "https://ftp:21/",
      ])
    } finally {
      globalThis.fetch = orig
    }
  })

  it("rejects unsupported URL schemes", async () => {
    for (const [url, scheme] of [
      ["ftp://example.com/file", "ftp"],
      ["ws://example.com/socket", "ws"],
    ]) {
      await expect(send(makeReq({ url }))).rejects.toThrow(
        `unsupported URL scheme "${scheme}:"`,
      )
    }
  })
})

describe("send — required path parameters", () => {
  it("does not fetch for an empty value, with or without an environment", async () => {
    let calls = 0
    const orig = globalThis.fetch
    globalThis.fetch = mock(async () => {
      calls++
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const req = makeReq({
      url: "https://api.example.com/users/:id",
      pathParams: [{ name: "id", value: "", enabled: true }],
    })

    try {
      await expect(send(req)).rejects.toThrow(
        'path parameter ":id" has no value',
      )
      await expect(
        send(req, { environment: { name: "test", vars: {} } }),
      ).rejects.toThrow('path parameter ":id" has no value')
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = orig
    }
  })

  it("does not fetch for a missing path parameter row", async () => {
    let calls = 0
    const orig = globalThis.fetch
    globalThis.fetch = mock(async () => {
      calls++
      return new Response("ok", { status: 200 })
    }) as unknown as typeof globalThis.fetch

    try {
      await expect(
        send(makeReq({ url: "https://api.example.com/users/:id" })),
      ).rejects.toThrow('path parameter ":id" has no value')
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = orig
    }
  })
})
