import type { IncomingMessage, ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { timingSafeEqual } from "node:crypto"
import { ntlmV2Hash } from "../src/requests/ntlm"
import { credentials } from "./auth"

export function createNtlmHandler() {
  const challenges = new WeakMap<Socket, Buffer>()
  return (request: IncomingMessage, response: ServerResponse) => {
    const reject = (challenge = "NTLM") => {
      response.writeHead(401, { "www-authenticate": challenge })
      response.end("NTLM credentials required")
    }
    const auth = request.headers.authorization
    if (!auth?.startsWith("NTLM ")) return reject()
    try {
      const message = Buffer.from(auth.slice(5), "base64")
      if (
        message.length < 12 ||
        message.subarray(0, 8).toString("ascii") !== "NTLMSSP\0"
      )
        return reject()
      if (message.readUInt32LE(8) === 1) {
        const challenge = Buffer.from(crypto.getRandomValues(new Uint8Array(8)))
        challenges.set(request.socket, challenge)
        const type2 = Buffer.alloc(52)
        Buffer.from("NTLMSSP\0").copy(type2)
        type2.writeUInt32LE(2, 8)
        type2.writeUInt32LE(0x00888205, 20)
        challenge.copy(type2, 24)
        type2.writeUInt16LE(4, 40)
        type2.writeUInt16LE(4, 42)
        type2.writeUInt32LE(48, 44)
        return reject(`NTLM ${type2.toString("base64")}`)
      }
      const challenge = challenges.get(request.socket)
      challenges.delete(request.socket)
      if (!challenge || message.readUInt32LE(8) !== 3 || message.length < 64)
        return reject()
      const field = (position: number) => {
        const length = message.readUInt16LE(position),
          offset = message.readUInt32LE(position + 4)
        if (offset < 64 || offset + length > message.length)
          throw Error("Invalid NTLM field")
        return message.subarray(offset, offset + length)
      }
      const domain = field(28).toString("utf16le"),
        user = field(36).toString("utf16le")
      const nt = field(20)
      if (
        user !== credentials.user ||
        domain !== credentials.domain ||
        nt.length < 48
      )
        return reject()
      const hash = new Bun.CryptoHasher(
        "md5",
        ntlmV2Hash(user, credentials.password, domain),
      )
      hash.update(challenge)
      hash.update(nt.subarray(16))
      if (!timingSafeEqual(Buffer.from(hash.digest()), nt.subarray(0, 16)))
        return reject()
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ authenticated: true, user, domain }))
    } catch {
      reject()
    }
  }
}
