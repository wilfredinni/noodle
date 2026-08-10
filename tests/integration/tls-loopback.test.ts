import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createServer, connect, type Socket } from "node:net"
import { join } from "node:path"
import type { AddressInfo } from "node:net"
import type { CollectionTlsSettings, Request } from "../../src/schema"
import { send } from "../../src/requests"

const FIXTURES = join(import.meta.dir, "..", "fixtures", "tls")

function request(url: string): Request {
  return {
    id: "loopback",
    name: "Loopback TLS",
    method: "GET",
    url,
    timeout: 5_000,
    headers: {},
    params: [],
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
  }
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

async function startTlsServer(requireClientCertificate = false) {
  const port = await freePort()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    tls: {
      cert: Bun.file(join(FIXTURES, "server.pem")),
      key: Bun.file(join(FIXTURES, "server-key.pem")),
      ...(requireClientCertificate
        ? {
            ca: Bun.file(join(FIXTURES, "ca.pem")),
            requestCert: true,
            rejectUnauthorized: true,
          }
        : {}),
    },
    fetch() {
      return new Response(requireClientCertificate ? "mutual" : "secure", {
        headers: { connection: "close" },
      })
    },
  })
  return { port, server }
}

async function startConnectProxy(): Promise<{
  port: number
  connections: () => number
  close: () => Promise<void>
}> {
  let connectionCount = 0
  const sockets = new Set<Socket>()
  const server = createServer((client) => {
    sockets.add(client)
    client.on("close", () => sockets.delete(client))
    client.on("error", () => {})
    client.once("data", (chunk) => {
      const firstLine = chunk.toString("utf8").split("\r\n", 1)[0] ?? ""
      const match = firstLine.match(/^CONNECT ([^:]+):(\d+) HTTP\/1\.[01]$/)
      if (!match) {
        client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        return
      }
      connectionCount++
      const upstream = connect(Number(match[2]), match[1], () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        client.pipe(upstream)
        upstream.pipe(client)
      })
      sockets.add(upstream)
      upstream.on("close", () => sockets.delete(upstream))
      upstream.on("error", () => client.destroy())
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  return {
    port: (server.address() as AddressInfo).port,
    connections: () => connectionCount,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function tlsPolicy(settings?: CollectionTlsSettings, insecure = false) {
  return { collectionDir: FIXTURES, settings, insecure }
}

describe("TLS loopback integration", () => {
  let tlsServer: Awaited<ReturnType<typeof startTlsServer>>
  let mtlsServer: Awaited<ReturnType<typeof startTlsServer>>
  let proxy: Awaited<ReturnType<typeof startConnectProxy>>

  beforeAll(async () => {
    tlsServer = await startTlsServer()
    mtlsServer = await startTlsServer(true)
    proxy = await startConnectProxy()
  })

  afterAll(async () => {
    tlsServer?.server.stop(true)
    mtlsServer?.server.stop(true)
    await proxy?.close()
  })

  it("trusts a configured CA bundle and rejects an untrusted issuer", async () => {
    const url = `https://localhost:${tlsServer.port}`
    const response = await send(request(url), {
      tlsPolicy: tlsPolicy({ caBundle: "ca.pem" }),
    })
    expect(response.body).toBe("secure")

    await expect(
      send(request(url), { tlsPolicy: tlsPolicy() }),
    ).rejects.toThrow("requests.send: fetch failed")
  })

  it("enforces hostname verification and lets --insecure override trust", async () => {
    const mismatchedUrl = `https://127.0.0.1:${tlsServer.port}`
    await expect(
      send(request(mismatchedUrl), {
        tlsPolicy: tlsPolicy({ caBundle: "ca.pem" }),
      }),
    ).rejects.toThrow("requests.send: fetch failed")

    const response = await send(request(mismatchedUrl), {
      tlsPolicy: tlsPolicy(undefined, true),
    })
    expect(response.body).toBe("secure")
  })

  it("uses an encrypted client key for mTLS and rejects missing credentials", async () => {
    const url = `https://localhost:${mtlsServer.port}`
    await expect(
      send(request(url), {
        tlsPolicy: tlsPolicy({ caBundle: "ca.pem" }),
      }),
    ).rejects.toThrow("requests.send: fetch failed")

    const response = await send(request(url), {
      environment: {
        name: "test",
        vars: { CLIENT_KEY_PASSPHRASE: "test-passphrase" },
      },
      tlsPolicy: tlsPolicy({
        caBundle: "ca.pem",
        clientCertificates: [
          {
            host: "localhost",
            port: mtlsServer.port,
            certFile: "client.pem",
            keyFile: "client-encrypted-key.pem",
            passphrase: "$CLIENT_KEY_PASSPHRASE",
          },
        ],
      }),
    })
    expect(response.body).toBe("mutual")
  })

  it("composes a CONNECT proxy with custom CA verification", async () => {
    const response = await send(
      request(`https://localhost:${tlsServer.port}/through-proxy`),
      {
        proxyPolicy: {
          kind: "custom",
          source: "collection",
          url: `http://127.0.0.1:${proxy.port}`,
          bypass: [],
        },
        tlsPolicy: tlsPolicy({ caBundle: "ca.pem" }),
      },
    )
    expect(response.body).toBe("secure")
    expect(proxy.connections()).toBeGreaterThan(0)
  })
})
