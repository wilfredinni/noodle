import { afterEach, describe, expect, it } from "bun:test"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https"
import {
  connect,
  createServer as createTcpServer,
  type AddressInfo,
  type Socket,
} from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import type { Request } from "../../src/schema"
import { send } from "../../src/requests/send"
import { ntlmV2Hash } from "../../src/requests/ntlm"

const servers: Array<Server | HttpsServer> = []
const TLS_FIXTURES = join(import.meta.dir, "..", "fixtures", "tls")
const proxies: Array<{
  close(): Promise<void>
  connections(): number
  authorization(): string | undefined
  port: number
}> = []

afterEach(async () => {
  await Promise.all([
    ...proxies.splice(0).map((proxy) => proxy.close()),
    ...servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  ])
})

async function startConnectProxy() {
  let connectionCount = 0
  let proxyAuthorization: string | undefined
  const sockets = new Set<Socket>()
  const server = createTcpServer((client) => {
    sockets.add(client)
    client.on("close", () => sockets.delete(client))
    client.on("error", () => {})
    let buffered = Buffer.alloc(0)
    const onHead = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const headEnd = buffered.indexOf("\r\n\r\n")
      if (headEnd < 0) return
      client.off("data", onHead)
      client.pause()
      const head = buffered.subarray(0, headEnd + 4).toString("latin1")
      const remainder = buffered.subarray(headEnd + 4)
      const firstLine = head.split("\r\n", 1)[0] ?? ""
      const match = firstLine.match(/^CONNECT ([^:]+):(\d+) HTTP\/1\.[01]$/)
      proxyAuthorization = head
        .match(/\r\nproxy-authorization:\s*([^\r\n]+)/i)?.[1]
        ?.trim()
      if (!match) {
        client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        return
      }
      connectionCount++
      const upstream = connect(Number(match[2]), match[1], () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (remainder.length > 0) client.unshift(remainder)
        client.pipe(upstream)
        upstream.pipe(client)
        client.resume()
      })
      sockets.add(upstream)
      upstream.on("close", () => sockets.delete(upstream))
      upstream.on("error", () => client.destroy())
    }
    client.on("data", onHead)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const proxy = {
    port: (server.address() as AddressInfo).port,
    connections: () => connectionCount,
    authorization: () => proxyAuthorization,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
  proxies.push(proxy)
  return proxy
}

function type2Token(
  challenge = Buffer.from("0123456789abcdef", "hex"),
): string {
  const targetInfo = Buffer.from([0, 0, 0, 0])
  const message = Buffer.alloc(48 + targetInfo.length)
  Buffer.from("NTLMSSP\0", "ascii").copy(message)
  message.writeUInt32LE(2, 8)
  message.writeUInt32LE(0x00888205, 20)
  challenge.copy(message, 24)
  message.writeUInt16LE(targetInfo.length, 40)
  message.writeUInt16LE(targetInfo.length, 42)
  message.writeUInt32LE(48, 44)
  targetInfo.copy(message, 48)
  return message.toString("base64")
}

function verifiesType3(message: Buffer, challenge: Buffer): boolean {
  const length = message.readUInt16LE(20)
  const offset = message.readUInt32LE(24)
  const ntResponse = message.subarray(offset, offset + length)
  const hasher = new Bun.CryptoHasher(
    "md5",
    ntlmV2Hash("User", "Password", "Domain"),
  )
  hasher.update(challenge)
  hasher.update(ntResponse.subarray(16))
  return Buffer.from(hasher.digest()).equals(ntResponse.subarray(0, 16))
}

function ntlmRequest(url: string, overrides: Partial<Request> = {}): Request {
  return {
    id: "ntlm",
    name: "NTLM",
    method: "GET",
    url,
    timeout: 0,
    headers: {},
    params: [],
    bodyType: "none",
    auth: {
      type: "ntlm",
      username: "User",
      password: "Password",
      domain: "Domain",
      workstation: "NOODLE",
    },
    ...overrides,
  }
}

function ntlmHandler(
  sockets: Set<object>,
  messageTypes: number[],
  signatures?: string[],
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    sockets.add(request.socket)
    const authorization = request.headers.authorization
    if (!authorization) {
      response.writeHead(401, { "WWW-Authenticate": "NTLM" })
      response.end("offer")
      return
    }
    const message = Buffer.from(authorization.slice(5), "base64")
    signatures?.push(message.subarray(0, 8).toString("ascii"))
    const type = message.readUInt32LE(8)
    messageTypes.push(type)
    if (type === 1) {
      response.writeHead(401, {
        "WWW-Authenticate": `NTLM ${type2Token()}`,
      })
      response.end("challenge")
      return
    }
    response.writeHead(200, { "Content-Encoding": "x-gzip, identity" })
    response.end(gzipSync("authenticated"))
  }
}

describe("NTLM loopback", () => {
  it("keeps all handshake legs on one TCP connection", async () => {
    const sockets = new Set<object>()
    const signatures: string[] = []
    const messageTypes: number[] = []
    const server = createServer(ntlmHandler(sockets, messageTypes, signatures))
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    const request = ntlmRequest(`http://127.0.0.1:${port}/protected`, {
      method: "POST",
      bodyType: "json",
      body: '{"hello":"world"}',
    })

    const result = await send(request)

    expect(result.status).toBe(200)
    expect(result.body).toBe("authenticated")
    expect(result.headers["content-encoding"]).toBeUndefined()
    expect(signatures).toEqual(["NTLMSSP\0", "NTLMSSP\0"])
    expect(messageTypes).toEqual([1, 3])
    expect(sockets.size).toBe(1)
  })

  it("keeps the handshake on one authenticated CONNECT tunnel", async () => {
    const sockets = new Set<object>()
    const messageTypes: number[] = []
    const server = createServer(ntlmHandler(sockets, messageTypes))
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    const proxy = await startConnectProxy()

    const result = await send(
      ntlmRequest(`http://127.0.0.1:${port}/protected`, {
        id: "ntlm-proxy",
        name: "NTLM proxy",
      }),
      {
        proxyPolicy: {
          kind: "custom",
          source: "collection",
          url: `http://127.0.0.1:${proxy.port}`,
          bypass: [],
          auth: true,
          credentials: { username: "proxy-user", password: "proxy-pass" },
        },
      },
    )

    expect(result.status).toBe(200)
    expect(messageTypes).toEqual([1, 3])
    expect(sockets.size).toBe(1)
    expect(proxy.connections()).toBe(1)
    expect(proxy.authorization()).toBe(
      `Basic ${Buffer.from("proxy-user:proxy-pass").toString("base64")}`,
    )
  })

  it("keeps the handshake on one mTLS connection with a custom CA", async () => {
    const sockets = new Set<object>()
    const messageTypes: number[] = []
    const server = createHttpsServer(
      {
        cert: readFileSync(join(TLS_FIXTURES, "server.pem")),
        key: readFileSync(join(TLS_FIXTURES, "server-key.pem")),
        ca: readFileSync(join(TLS_FIXTURES, "ca.pem")),
        requestCert: true,
        rejectUnauthorized: true,
      },
      ntlmHandler(sockets, messageTypes),
    )
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    const secretId = "123e4567-e89b-42d3-a456-426614174000"

    const result = await send(
      ntlmRequest(`https://localhost:${port}/protected`, {
        id: "ntlm-tls",
        name: "NTLM TLS",
      }),
      {
        tlsPolicy: {
          collectionDir: TLS_FIXTURES,
          settings: {
            caBundle: "ca.pem",
            clientCertificates: [
              {
                host: "localhost",
                port,
                certFile: "client.pem",
                keyFile: "client-encrypted-key.pem",
                secretId,
              },
            ],
          },
          passphrases: { [secretId]: "test-passphrase" },
        },
      },
    )

    expect(result.status).toBe(200)
    expect(messageTypes).toEqual([1, 3])
    expect(sockets.size).toBe(1)
  })

  it("keeps concurrent handshakes bound to their challenged connection", async () => {
    const challenges = new WeakMap<object, Buffer>()
    let challengeId = 0
    const server = createServer((request, response) => {
      const authorization = request.headers.authorization
      if (!authorization) {
        response.writeHead(401, { "WWW-Authenticate": "NTLM" })
        response.end("offer")
        return
      }
      const message = Buffer.from(authorization.slice(5), "base64")
      const type = message.readUInt32LE(8)
      if (type === 1) {
        const challenge = Buffer.alloc(8)
        challenge.writeBigUInt64LE(BigInt(++challengeId))
        challenges.set(request.socket, challenge)
        setTimeout(() => {
          response.writeHead(401, {
            "WWW-Authenticate": `NTLM ${type2Token(challenge)}`,
          })
          response.end("challenge")
        }, challengeId % 4)
        return
      }
      const challenge = challenges.get(request.socket)
      if (!challenge || !verifiesType3(message, challenge)) {
        response.writeHead(401, { "WWW-Authenticate": "NTLM" })
        response.end("wrong connection")
        return
      }
      response.end("authenticated")
    })
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    const requests = Array.from({ length: 24 }, (_, id) =>
      ntlmRequest(`http://127.0.0.1:${port}/protected?id=${id}`, {
        id: `ntlm-${id}`,
      }),
    )

    const results = await Promise.all(requests.map((request) => send(request)))

    expect(results.map(({ status, body }) => ({ status, body }))).toEqual(
      Array.from({ length: requests.length }, () => ({
        status: 200,
        body: "authenticated",
      })),
    )
  })
})
