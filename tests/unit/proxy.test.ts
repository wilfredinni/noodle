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
  resolveProxyUrl,
  systemProxyFromEnv,
  takeSystemProxyFromEnv,
  type ProxyPolicy,
  validateProxyTemplate,
} from "../../src/proxy"

describe("proxy policy", () => {
  const system = systemProxyFromEnv({
    HTTP_PROXY: "http://system-http:8080",
    HTTPS_PROXY: "http://system-https:8080",
    NO_PROXY: "localhost, .internal.test",
  })
  const variableProxyUrl = "http://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8080"
  const appPolicy: ProxyPolicy = {
    kind: "custom",
    source: "global",
    url: variableProxyUrl,
    bypass: [],
  }
  const collectionPolicy: ProxyPolicy = {
    ...appPolicy,
    source: "collection",
  }
  const collectionEnv = {
    name: "dev",
    vars: {
      PROXY_USER: "collection-user",
      PROXY_PASSWORD: "collection-password",
    },
  }

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
      undefined,
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
      undefined,
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
      undefined,
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

  it("resolves app and collection proxy variables from the active environment", () => {
    expect(
      proxyForUrl(appPolicy, "https://example.com", collectionEnv),
    ).toEqual({
      kind: "proxy",
      source: "global",
      url: "http://collection-user:collection-password@proxy.test:8080",
    })
    expect(
      proxyForUrl(collectionPolicy, "https://example.com", collectionEnv),
    ).toEqual({
      kind: "proxy",
      source: "collection",
      url: "http://collection-user:collection-password@proxy.test:8080",
    })
  })

  it("fails when the active environment cannot resolve custom proxy variables", () => {
    expect(() =>
      proxyForUrl(appPolicy, "https://example.com", {
        name: "dev",
        vars: {},
      }),
    ).toThrow('proxy: unresolved variable "PROXY_USER" in proxy.url')
    expect(() =>
      proxyForUrl(collectionPolicy, "https://example.com", {
        name: "dev",
        vars: {},
      }),
    ).toThrow('proxy: unresolved variable "PROXY_USER" in proxy.url')
  })

  it("uses active environment variables for app and collection subprocess proxies", () => {
    const baseEnv = {
      PATH: "/usr/bin",
      PROXY_USER: "process-user",
      PROXY_PASSWORD: "process-password",
    }

    expect(
      environmentForProxyPolicy(appPolicy, collectionEnv, baseEnv).HTTPS_PROXY,
    ).toBe("http://collection-user:collection-password@proxy.test:8080")
    expect(
      environmentForProxyPolicy(collectionPolicy, collectionEnv, baseEnv)
        .HTTPS_PROXY,
    ).toBe("http://collection-user:collection-password@proxy.test:8080")
  })

  it("uses the active environment for an app proxy in the fetch wrapper", async () => {
    let init: RequestInit | undefined
    const fetcher = createProxyFetcher(
      appPolicy,
      collectionEnv,
      async (_input, options) => {
        init = options
        return new Response()
      },
    )

    await fetcher("https://example.com")

    expect((init as BunFetchRequestInit).proxy).toBe(
      "http://collection-user:collection-password@proxy.test:8080",
    )
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
  it("builds a structured proxy URL with variable credentials", () => {
    expect(
      buildStructuredProxyTemplate({
        protocol: "https",
        hostname: "proxy.test",
        port: "8443",
        auth: true,
        username: "$PROXY_USER",
        password: "$PROXY_PASSWORD",
      }),
    ).toEqual({
      url: "https://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8443",
    })
  })

  it("builds and parses literal credentials without losing special characters", () => {
    const fields = {
      protocol: "https" as const,
      hostname: "proxy.test",
      port: "8443",
      auth: true,
      username: "alice@example.com",
      password: "space and:colon$",
    }

    expect(buildStructuredProxyTemplate(fields)).toEqual({
      url: "https://alice%40example.com:space%20and%3Acolon%24@proxy.test:8443",
    })
    expect(
      parseStructuredProxyTemplate(
        "https://alice%40example.com:space%20and%3Acolon%24@proxy.test:8443",
      ),
    ).toEqual(fields)
  })

  it("supports proxy authentication without a password", () => {
    const fields = {
      protocol: "http" as const,
      hostname: "proxy.test",
      port: "",
      auth: true,
      username: "alice",
      password: "",
    }

    expect(buildStructuredProxyTemplate(fields)).toEqual({
      url: "http://alice@proxy.test",
    })
    expect(parseStructuredProxyTemplate("http://alice@proxy.test")).toEqual(
      fields,
    )
  })

  it("parses HTTP, HTTPS, omitted ports, and IPv4 hosts losslessly", () => {
    expect(parseStructuredProxyTemplate("http://192.168.1.20")).toEqual({
      protocol: "http",
      hostname: "192.168.1.20",
      port: "",
      auth: false,
      username: "",
      password: "",
    })
    expect(
      parseStructuredProxyTemplate(
        "https://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8443",
      ),
    ).toEqual({
      protocol: "https",
      hostname: "proxy.test",
      port: "8443",
      auth: true,
      username: "$PROXY_USER",
      password: "$PROXY_PASSWORD",
    })
  })

  it("builds IPv6 proxy URLs and parses them back losslessly", () => {
    const fields = {
      protocol: "http" as const,
      hostname: "::1",
      port: "",
      auth: false,
      username: "",
      password: "",
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
      auth: true,
      username: "literal-user",
      password: "",
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
    expect(
      buildStructuredProxyTemplate({
        ...fields,
        hostname: "proxy.test",
        port: "8080",
        username: "",
      }),
    ).toEqual({ error: "Proxy username is required" })
  })

  it("resolves credentials from the provided variable source", () => {
    expect(
      resolveProxyUrl("http://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8080", {
        PROXY_USER: "alice",
        PROXY_PASSWORD: "secret",
      }),
    ).toBe("http://alice:secret@proxy.test:8080")
  })

  it("treats dollar signs embedded in literal credentials as literals", () => {
    expect(resolveProxyUrl("http://alice:pa$word@proxy.test")).toBe(
      "http://alice:pa%24word@proxy.test",
    )
  })

  it("validates and resolves a variable proxy port", () => {
    const template = "http://proxy.test:$PROXY_PORT"
    expect(validateProxyTemplate(template)).toBeNull()
    expect(resolveProxyUrl(template, { PROXY_PORT: "8080" })).toBe(
      "http://proxy.test:8080",
    )
  })

  it("fails clearly for an unresolved proxy variable", () => {
    expect(() => resolveProxyUrl("http://$PROXY@proxy.test", {})).toThrow(
      'proxy: unresolved variable "PROXY" in proxy.url',
    )
  })

  it("does not expose resolved credentials in invalid URL errors", () => {
    expect(() =>
      resolveProxyUrl("http://$PROXY_PASSWORD@proxy.test:invalid", {
        PROXY_PASSWORD: "secret-value",
      }),
    ).toThrow("proxy: invalid proxy URL")
    try {
      resolveProxyUrl("http://$PROXY_PASSWORD@proxy.test:invalid", {
        PROXY_PASSWORD: "secret-value",
      })
    } catch (error) {
      expect(String(error)).not.toContain("secret-value")
    }
  })

  it("accepts literal stored credentials and rejects invalid protocols", () => {
    const custom = {
      mode: "custom" as const,
      url: "http://alice:secret@proxy.test",
    }
    expect(validateProxyTemplate(custom.url)).toBeNull()
    expect(parseAppProxy(custom)).toEqual(custom)
    expect(parseCollectionProxy(custom)).toEqual(custom)
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
