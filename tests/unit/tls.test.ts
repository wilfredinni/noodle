import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Request } from "../../src/schema"
import { loadSettings, saveSettings } from "../../src/filestore"
import {
  findClientCertificate,
  isValidTlsHost,
  parseCollectionTls,
  parseCollectionTlsStrict,
  resolveTlsPath,
  tlsForUrl,
} from "../../src/tls"
import { send } from "../../src/requests"

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: "request",
    name: "Request",
    method: "GET",
    url: "https://example.com",
    timeout: 0,
    headers: {},
    params: [],
    ...overrides,
  }
}

describe("collection TLS settings", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "noodle-tls-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("parses collection TLS settings", () => {
    expect(
      parseCollectionTls({
        verify: true,
        ca_bundle: "./certs/ca.pem",
        client_certificates: [
          {
            host: "api.example.com",
            port: 8443,
            cert_file: "./certs/client.pem",
            key_file: "./certs/key.pem",
            secret_id: "123e4567-e89b-42d3-a456-426614174000",
          },
        ],
      }),
    ).toEqual({
      verify: true,
      caBundle: "./certs/ca.pem",
      clientCertificates: [
        {
          host: "api.example.com",
          port: 8443,
          certFile: "./certs/client.pem",
          keyFile: "./certs/key.pem",
          secretId: "123e4567-e89b-42d3-a456-426614174000",
          enabled: undefined,
        },
      ],
    })
  })

  it("rejects invalid ports and incomplete enabled profiles", () => {
    expect(parseCollectionTls({ ca_bundle: "   " })).toBeUndefined()
    expect(
      parseCollectionTls({
        client_certificates: [
          {
            host: "api.example.com",
            port: 70000,
            cert_file: "c",
            key_file: "k",
          },
        ],
      }),
    ).toBeUndefined()
    expect(
      parseCollectionTls({
        client_certificates: [
          { host: "", cert_file: "", key_file: "", enabled: true },
        ],
      }),
    ).toBeUndefined()
    expect(
      parseCollectionTls({
        client_certificates: [
          {
            host: "https://api.example.com",
            cert_file: "c",
            key_file: "k",
          },
        ],
      }),
    ).toBeUndefined()
  })

  it("ignores an empty disabled client certificate placeholder", () => {
    expect(
      parseCollectionTls({
        client_certificates: [
          { host: "", cert_file: "", key_file: "", enabled: false },
        ],
      }),
    ).toEqual({ clientCertificates: [] })
  })

  it("accepts only bare hostnames and IP addresses", () => {
    expect(isValidTlsHost("api.example.com")).toBe(true)
    expect(isValidTlsHost("127.0.0.1")).toBe(true)
    expect(isValidTlsHost("[::1]")).toBe(true)
    expect(isValidTlsHost("api.example.com:8443")).toBe(false)
    expect(isValidTlsHost("*.example.com")).toBe(false)
    expect(isValidTlsHost("https://api.example.com")).toBe(false)
    expect(isValidTlsHost("api\\example.com")).toBe(false)
    expect(isValidTlsHost(".")).toBe(false)
    expect(isValidTlsHost("-")).toBe(false)
  })

  it("rejects legacy literal and environment-reference passphrases", () => {
    const legacy = {
      client_certificates: [
        {
          host: "api.example.com",
          cert_file: "client.pem",
          key_file: "key.pem",
          passphrase: "$PASS",
        },
      ],
    }
    expect(parseCollectionTls(legacy)).toBeUndefined()
    expect(() => parseCollectionTlsStrict(legacy)).toThrow(
      "passphrase: is no longer supported; remove it and configure the passphrase in Settings",
    )
  })

  it("round-trips secret ids without a plaintext passphrase", async () => {
    const secretId = "123e4567-e89b-42d3-a456-426614174000"
    await saveSettings(dir, {
      tls: {
        clientCertificates: [
          {
            host: "api.example.com",
            certFile: "client.pem",
            keyFile: "key.pem",
            secretId,
          },
        ],
      },
    })
    const raw = await readFile(join(dir, "settings.yml"), "utf8")
    expect(raw).toContain(`secret_id: ${secretId}`)
    expect(raw).not.toContain("passphrase:")
    expect(
      (await loadSettings(dir)).tls?.clientCertificates?.[0]?.secretId,
    ).toBe(secretId)
  })

  it("round-trips collection TLS settings", async () => {
    await saveSettings(dir, {
      tls: {
        verify: false,
        caBundle: "./ca.pem",
        clientCertificates: [
          {
            host: "api.example.com",
            certFile: "./client.pem",
            keyFile: "./key.pem",
            enabled: true,
          },
        ],
      },
    })
    expect(await loadSettings(dir)).toEqual({
      tls: {
        verify: false,
        caBundle: "./ca.pem",
        clientCertificates: [
          {
            host: "api.example.com",
            certFile: "./client.pem",
            keyFile: "./key.pem",
            enabled: true,
          },
        ],
      },
    })
  })

  it("does not persist an empty disabled client certificate placeholder", async () => {
    await saveSettings(dir, {
      tls: {
        clientCertificates: [
          { host: "", certFile: "", keyFile: "", enabled: false },
        ],
      },
    })
    expect(await loadSettings(dir)).toEqual({
      tls: { clientCertificates: [] },
    })
    expect(await readFile(join(dir, "settings.yml"), "utf8")).toContain(
      "client_certificates: []",
    )
  })

  it("matches the first enabled certificate by exact host and port", () => {
    const disabled = {
      host: "api.example.com",
      certFile: "disabled.pem",
      keyFile: "disabled-key.pem",
      enabled: false,
    }
    const selected = {
      host: "API.EXAMPLE.COM",
      certFile: "client.pem",
      keyFile: "key.pem",
    }
    expect(
      findClientCertificate(
        [disabled, selected],
        new URL("https://api.example.com/path"),
      ),
    ).toBe(selected)
    expect(
      findClientCertificate(
        [selected],
        new URL("https://sub.api.example.com/path"),
      ),
    ).toBeUndefined()
    expect(
      findClientCertificate(
        [selected],
        new URL("https://api.example.com:8443/path"),
      ),
    ).toBeUndefined()

    const internationalized = {
      host: "münich.example",
      certFile: "internationalized.pem",
      keyFile: "internationalized-key.pem",
    }
    expect(
      findClientCertificate(
        [internationalized],
        new URL("https://münich.example/path"),
      ),
    ).toBe(internationalized)
  })

  it("resolves relative certificate paths from the collection", () => {
    expect(resolveTlsPath("./certs/ca.pem", dir)).toBe(
      join(dir, "certs/ca.pem"),
    )
  })

  it("builds Bun TLS options with verification, CA, and mTLS", async () => {
    await writeFile(join(dir, "ca.pem"), "test CA")
    await writeFile(join(dir, "client.pem"), "test cert")
    await writeFile(join(dir, "key.pem"), "test key")

    const secretId = "123e4567-e89b-42d3-a456-426614174000"
    const resolved = await tlsForUrl(
      makeRequest({ tls: { verify: true } }),
      "https://api.example.com/path",
      {
        collectionDir: dir,
        settings: {
          verify: false,
          caBundle: "./ca.pem",
          clientCertificates: [
            {
              host: "api.example.com",
              certFile: "./client.pem",
              keyFile: "./key.pem",
              secretId,
            },
          ],
        },
        passphrases: { [secretId]: "secret" },
      },
    )

    expect(resolved.options?.rejectUnauthorized).toBe(true)
    expect(resolved.options?.ca).toBeInstanceOf(Blob)
    expect(resolved.options?.cert).toBeInstanceOf(Blob)
    expect(resolved.options?.key).toBeInstanceOf(Blob)
    expect(resolved.options?.passphrase).toBe("secret")
    expect(resolved.messages).toContain("TLS verification enabled by request")
  })

  it("resolves a Bun-backed passphrase by secret id", async () => {
    await writeFile(join(dir, "client.pem"), "test cert")
    await writeFile(join(dir, "key.pem"), "test key")
    const secretId = "123e4567-e89b-42d3-a456-426614174000"
    const resolved = await tlsForUrl(makeRequest(), "https://api.example.com", {
      collectionDir: dir,
      settings: {
        clientCertificates: [
          {
            host: "api.example.com",
            certFile: "client.pem",
            keyFile: "key.pem",
            secretId,
          },
        ],
      },
      passphrases: { [secretId]: "bun-secret" },
    })
    expect(resolved.options?.passphrase).toBe("bun-secret")
  })

  it("fails clearly when a referenced TLS passphrase secret is missing", async () => {
    await writeFile(join(dir, "client.pem"), "test cert")
    await writeFile(join(dir, "key.pem"), "test key")
    await expect(
      tlsForUrl(makeRequest(), "https://api.example.com", {
        collectionDir: dir,
        settings: {
          clientCertificates: [
            {
              host: "api.example.com",
              certFile: "client.pem",
              keyFile: "key.pem",
              secretId: "123e4567-e89b-42d3-a456-426614174000",
            },
          ],
        },
        passphrases: {},
      }),
    ).rejects.toThrow("has a missing passphrase secret")
  })

  it("lets --insecure override saved verification", async () => {
    const resolved = await tlsForUrl(
      makeRequest({ tls: { verify: true } }),
      "https://example.com",
      {
        collectionDir: dir,
        settings: { verify: true, caBundle: "missing.pem" },
        insecure: true,
      },
    )
    expect(resolved.options?.rejectUnauthorized).toBe(false)
    expect(resolved.options?.ca).toBeUndefined()
    expect(resolved.messages).toContain(
      "TLS verification disabled by --insecure",
    )
  })

  it("does not load a custom CA when verification is disabled", async () => {
    const resolved = await tlsForUrl(
      makeRequest({ tls: { verify: false } }),
      "https://example.com",
      {
        collectionDir: dir,
        settings: { caBundle: "missing.pem" },
      },
    )

    expect(resolved.options?.rejectUnauthorized).toBe(false)
    expect(resolved.options?.ca).toBeUndefined()
    expect(resolved.messages).not.toContain("TLS custom CA bundle enabled")
  })

  it("verifies certificates by default", async () => {
    const resolved = await tlsForUrl(makeRequest(), "https://example.com", {
      collectionDir: dir,
    })
    expect(resolved.options?.rejectUnauthorized).toBe(true)
  })

  it("fails before fetch when a configured certificate file is missing", async () => {
    await expect(
      tlsForUrl(makeRequest(), "https://api.example.com", {
        collectionDir: dir,
        settings: {
          clientCertificates: [
            {
              host: "api.example.com",
              certFile: "missing.pem",
              keyFile: "missing-key.pem",
            },
          ],
        },
      }),
    ).rejects.toThrow("tls: client certificate not found")
  })

  it("re-matches client certificates after redirects", async () => {
    await writeFile(join(dir, "client.pem"), "test cert")
    await writeFile(join(dir, "key.pem"), "test key")
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; init?: BunFetchRequestInit }> = []
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      calls.push({ url, init: init as BunFetchRequestInit })
      if (url === "https://api.example.com/start") {
        return new Response("", {
          status: 302,
          headers: { location: "https://other.example.com/final" },
        })
      }
      return new Response("ok", { status: 200 })
    }) as typeof fetch

    try {
      const response = await send(
        makeRequest({
          url: "https://api.example.com/start",
          followRedirects: true,
          maxRedirects: 5,
        }),
        {
          tlsPolicy: {
            collectionDir: dir,
            settings: {
              clientCertificates: [
                {
                  host: "api.example.com",
                  certFile: "client.pem",
                  keyFile: "key.pem",
                },
              ],
            },
          },
        },
      )
      expect(response.body).toBe("ok")
      expect(calls).toHaveLength(2)
      expect(calls[0]?.init?.tls?.cert).toBeDefined()
      expect(calls[1]?.init?.tls?.cert).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
