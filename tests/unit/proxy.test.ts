import { describe, expect, it } from "bun:test"
import {
  buildStructuredProxyTemplate,
  createProxyFetcher,
  environmentForProxyPolicy,
  parseAppProxy,
  parseCollectionProxy,
  parseStructuredProxyTemplate,
  proxyForUrl,
  redactProxyUrl,
  resolveProxyPolicy,
  systemProxyFromEnv,
  takeSystemProxyFromEnv,
  validateProxyTemplate,
} from "../../src/proxy"

describe("proxy policy", () => {
  const system = systemProxyFromEnv({
    HTTP_PROXY: "http://system-http:8080",
    HTTPS_PROXY: "http://system-https:8080",
    NO_PROXY: "localhost, .internal.test",
  })
  it("prefers --noproxy over collection, app, and system settings", () => {
    const policy = resolveProxyPolicy({
      noProxy: true,
      appProxy: { mode: "custom", url: "http://app:8080" },
      collectionProxy: { mode: "custom", url: "http://collection:8080" },
      systemProxy: system,
    })

    expect(proxyForUrl(policy, "https://example.com")).toEqual({
      kind: "direct",
      reason: "cli",
    })
  })

  it("uses a collection custom proxy ahead of app and system settings", () => {
    const policy = resolveProxyPolicy({
      appProxy: { mode: "custom", url: "http://app:8080" },
      collectionProxy: { mode: "custom", url: "http://collection:8080" },
      systemProxy: system,
    })

    expect(proxyForUrl(policy, "https://example.com")).toEqual({
      kind: "proxy",
      source: "collection",
      url: "http://collection:8080",
    })
  })

  it("injects Bun-backed credentials without environment overrides", () => {
    const policy = resolveProxyPolicy({
      appProxy: { mode: "custom", url: "https://proxy.test:8443", auth: true },
      appCredentials: { username: "bun-user", password: "bun-password" },
      systemProxy: system,
    })
    expect(proxyForUrl(policy, "https://example.com")).toEqual({
      kind: "proxy",
      source: "global",
      url: "https://bun-user:bun-password@proxy.test:8443/",
    })
    expect(environmentForProxyPolicy(policy, {}).HTTPS_PROXY).toBe(
      "https://bun-user:bun-password@proxy.test:8443/",
    )
  })

  it("allows an optional proxy password and fails clearly without a username", () => {
    const optionalPassword = resolveProxyPolicy({
      appProxy: { mode: "custom", url: "http://proxy.test:8080", auth: true },
      appCredentials: { username: "bun-user" },
      systemProxy: system,
    })
    expect(proxyForUrl(optionalPassword, "https://example.com")).toMatchObject({
      url: "http://bun-user@proxy.test:8080/",
    })

    const missing = resolveProxyPolicy({
      appProxy: { mode: "custom", url: "http://proxy.test:8080", auth: true },
      appCredentials: {},
      systemProxy: system,
    })
    expect(() => proxyForUrl(missing, "https://example.com")).toThrow(
      "authentication is enabled for the global proxy, but its username secret is missing",
    )
  })

  it("rejects proxy fetches asynchronously when authentication is incomplete", async () => {
    const fetcher = createProxyFetcher(
      resolveProxyPolicy({
        appProxy: {
          mode: "custom",
          url: "http://proxy.test:8080",
          auth: true,
        },
        appCredentials: {},
        systemProxy: system,
      }),
    )
    let request: Promise<Response> | undefined

    expect(() => {
      request = fetcher("https://example.com")
    }).not.toThrow()
    await expect(request!).rejects.toThrow(
      "authentication is enabled for the global proxy, but its username secret is missing",
    )
  })

  it("falls back to system HTTP and HTTPS proxies", () => {
    const policy = resolveProxyPolicy({ systemProxy: system })

    expect(proxyForUrl(policy, "http://example.com")).toMatchObject({
      kind: "proxy",
      url: "http://system-http:8080",
    })
    expect(proxyForUrl(policy, "https://example.com")).toMatchObject({
      kind: "proxy",
      url: "http://system-https:8080",
    })
  })

  it("captures then clears ambient proxy variables for explicit routing", () => {
    const env: Record<string, string | undefined> = {
      HTTP_PROXY: "http://system-http:8080",
      HTTPS_PROXY: "http://system-https:8080",
      NO_PROXY: "localhost",
    }
    expect(takeSystemProxyFromEnv(env)).toEqual({
      http: "http://system-http:8080",
      https: "http://system-https:8080",
      bypass: ["localhost"],
    })
    expect(env).toEqual({})
  })

  it("applies captured proxy settings to fetches explicitly", async () => {
    let init: RequestInit | undefined
    const fetcher = createProxyFetcher(
      resolveProxyPolicy({ systemProxy: system }),
      async (_input, options) => {
        init = options
        return new Response()
      },
    )

    await fetcher("https://example.com")

    expect((init as BunFetchRequestInit).proxy).toBe("http://system-https:8080")
  })

  it("removes a caller proxy from direct fetches", async () => {
    let init: RequestInit | undefined
    const fetcher = createProxyFetcher(
      resolveProxyPolicy({ noProxy: true, systemProxy: system }),
      async (_input, options) => {
        init = options
        return new Response()
      },
    )

    await fetcher("https://example.com", {
      proxy: "http://caller-proxy:8080",
    } as BunFetchRequestInit)

    expect("proxy" in (init as BunFetchRequestInit)).toBe(false)
  })

  it("restores resolved proxy settings for subprocesses", () => {
    const env = environmentForProxyPolicy(
      resolveProxyPolicy({ systemProxy: system }),
      { PATH: "/usr/bin", HTTPS_PROXY: "http://ambient:8080" },
    )

    expect(env).toEqual({
      PATH: "/usr/bin",
      HTTP_PROXY: "http://system-http:8080",
      http_proxy: "http://system-http:8080",
      HTTPS_PROXY: "http://system-https:8080",
      https_proxy: "http://system-https:8080",
      NO_PROXY: "localhost,.internal.test",
      no_proxy: "localhost,.internal.test",
    })
  })

  it("bypasses wildcard, domain, port, and IPv6 entries", () => {
    const policy = resolveProxyPolicy({
      appProxy: {
        mode: "custom",
        url: "http://proxy:8080",
        bypass: [".internal.test", "api.example.com:8443", "[::1]"],
      },
      systemProxy: system,
    })

    expect(proxyForUrl(policy, "https://service.internal.test/path")).toEqual({
      kind: "direct",
      reason: "bypass",
    })
    expect(proxyForUrl(policy, "https://api.example.com:8443")).toEqual({
      kind: "direct",
      reason: "bypass",
    })
    expect(proxyForUrl(policy, "https://api.example.com:443")).toMatchObject({
      kind: "proxy",
    })
    expect(proxyForUrl(policy, "http://[::1]/")).toEqual({
      kind: "direct",
      reason: "bypass",
    })
  })
})

describe("proxy validation", () => {
  it("parses auth metadata while keeping the persisted URL sanitized", () => {
    expect(
      parseAppProxy({
        mode: "custom",
        url: "http://proxy.test:8080",
        auth: true,
      }),
    ).toEqual({
      mode: "custom",
      url: "http://proxy.test:8080",
      auth: true,
    })
  })
  it("builds and parses structured URLs without credentials", () => {
    const fields = {
      protocol: "https" as const,
      hostname: "proxy.test",
      port: "8443",
    }

    expect(buildStructuredProxyTemplate(fields)).toEqual({
      url: "https://proxy.test:8443",
    })
    expect(parseStructuredProxyTemplate("https://proxy.test:8443")).toEqual(
      fields,
    )
  })

  it("parses HTTP, HTTPS, omitted ports, and IPv4 hosts losslessly", () => {
    expect(parseStructuredProxyTemplate("http://192.168.1.20")).toEqual({
      protocol: "http",
      hostname: "192.168.1.20",
      port: "",
    })
  })

  it("builds IPv6 proxy URLs and parses them back losslessly", () => {
    const fields = {
      protocol: "http" as const,
      hostname: "::1",
      port: "",
    }
    expect(buildStructuredProxyTemplate(fields)).toEqual({
      url: "http://[::1]",
    })
    expect(parseStructuredProxyTemplate("http://[::1]")).toEqual(fields)
  })

  it("keeps URL paths and query strings in advanced mode", () => {
    expect(parseStructuredProxyTemplate("http://proxy.test/path")).toBeNull()
    expect(
      parseStructuredProxyTemplate("http://proxy.test?debug=true"),
    ).toBeNull()
  })

  it("rejects invalid structured fields", () => {
    const fields = {
      protocol: "http" as const,
      hostname: "",
      port: "not-a-port",
    }
    expect(buildStructuredProxyTemplate(fields)).toEqual({
      error: "Proxy hostname is required",
    })
    expect(
      buildStructuredProxyTemplate({ ...fields, hostname: "proxy.test" }),
    ).toEqual({ error: "Proxy port must be between 1 and 65535" })
    expect(
      buildStructuredProxyTemplate({
        ...fields,
        hostname: "proxy.test",
        port: "65536",
      }),
    ).toEqual({ error: "Proxy port must be between 1 and 65535" })
  })

  it("rejects credential variables and literal userinfo", () => {
    expect(validateProxyTemplate("http://proxy.test:$PROXY_PORT")).toBe(
      "Proxy URL cannot contain variables; configure authentication in Settings",
    )
    expect(validateProxyTemplate("http://alice:secret@proxy.test")).toBe(
      "Proxy URL cannot contain credentials; configure authentication in Settings",
    )
    expect(
      parseAppProxy({
        mode: "custom",
        url: "http://$PROXY_USER@proxy.test",
      }),
    ).toBeUndefined()
    expect(
      parseCollectionProxy({
        mode: "custom",
        url: "http://alice:secret@proxy.test",
      }),
    ).toBeUndefined()
  })

  it("rejects invalid protocols", () => {
    expect(validateProxyTemplate("socks5://proxy.test")).toBe(
      "Proxy URL must use http or https",
    )
    expect(
      parseCollectionProxy({ mode: "custom", url: "socks5://proxy.test" }),
    ).toBeUndefined()
  })

  it("redacts credentials before presentation", () => {
    expect(redactProxyUrl("http://alice:secret@proxy.test:8080")).toBe(
      "http://***:***@proxy.test:8080/",
    )
  })
})
