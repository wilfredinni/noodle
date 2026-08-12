import { afterEach, describe, expect, it } from "bun:test"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { Request } from "../../src/schema"
import { send } from "../../src/requests/send"

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  )
})

function type2Token(): string {
  const targetInfo = Buffer.from([0, 0, 0, 0])
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

describe("NTLM loopback", () => {
  it("keeps all handshake legs on one TCP connection", async () => {
    const sockets = new Set<object>()
    const signatures: string[] = []
    const messageTypes: number[] = []
    const server = createServer((request, response) => {
      sockets.add(request.socket)
      const authorization = request.headers.authorization
      if (!authorization) {
        response.writeHead(401, { "WWW-Authenticate": "NTLM" })
        response.end("consume this offer")
        return
      }
      const message = Buffer.from(authorization.slice(5), "base64")
      signatures.push(message.subarray(0, 8).toString("ascii"))
      const type = message.readUInt32LE(8)
      messageTypes.push(type)
      if (type === 1) {
        response.writeHead(401, {
          "WWW-Authenticate": `NTLM ${type2Token()}`,
        })
        response.end("consume this challenge")
        return
      }
      response.end("authenticated")
    })
    servers.push(server)
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    )
    const { port } = server.address() as AddressInfo
    const request: Request = {
      id: "ntlm",
      name: "NTLM",
      method: "POST",
      url: `http://127.0.0.1:${port}/protected`,
      timeout: 0,
      headers: {},
      params: [],
      bodyType: "json",
      body: '{"hello":"world"}',
      auth: {
        type: "ntlm",
        username: "User",
        password: "Password",
        domain: "Domain",
        workstation: "NOODLE",
      },
    }

    const result = await send(request)

    expect(result.status).toBe(200)
    expect(result.body).toBe("authenticated")
    expect(signatures).toEqual(["NTLMSSP\0", "NTLMSSP\0"])
    expect(messageTypes).toEqual([1, 3])
    expect(sockets.size).toBe(1)
  })
})
