import { randomBytes } from "node:crypto"

const SIGNATURE = Buffer.from("NTLMSSP\0", "ascii")
const NEGOTIATE_UNICODE = 0x00000001
const REQUEST_TARGET = 0x00000004
const NEGOTIATE_NTLM = 0x00000200
const NEGOTIATE_ALWAYS_SIGN = 0x00008000
const NEGOTIATE_EXTENDED_SESSION_SECURITY = 0x00080000
const NEGOTIATE_TARGET_INFO = 0x00800000
const NEGOTIATE_FLAGS =
  NEGOTIATE_UNICODE |
  REQUEST_TARGET |
  NEGOTIATE_NTLM |
  NEGOTIATE_ALWAYS_SIGN |
  NEGOTIATE_EXTENDED_SESSION_SECURITY
const AV_FLAGS = 6
const AV_TIMESTAMP = 7
const AV_EOL = 0
const MIC_PRESENT = 0x00000002
const FILETIME_EPOCH = 11644473600000n

interface AvPair {
  id: number
  value: Buffer
}

export interface ParsedType2Message {
  raw: Buffer
  flags: number
  challenge: Buffer
  targetInfo: AvPair[]
  timestamp?: bigint
  requiresMic: boolean
}

export interface NtlmCredentials {
  username: string
  password: string
  domain: string
  workstation: string
}

export interface Type3Options {
  type1?: Buffer
  clientChallenge?: Buffer
  timestamp?: bigint
}

export type NtlmChallenge =
  | { kind: "none" }
  | { kind: "offer"; scheme: "NTLM" }
  | {
      kind: "type2"
      scheme: "NTLM" | "Negotiate"
      message: ParsedType2Message
    }

function hmacMd5(key: Uint8Array, ...values: Uint8Array[]): Buffer {
  const hasher = new Bun.CryptoHasher("md5", key)
  for (const value of values) hasher.update(value)
  return Buffer.from(hasher.digest())
}

function md4(value: Uint8Array): Buffer {
  return Buffer.from(new Bun.CryptoHasher("md4").update(value).digest())
}

export function ntlmV2Hash(
  username: string,
  password: string,
  domain: string,
): Buffer {
  const ntHash = md4(Buffer.from(password, "utf16le"))
  return hmacMd5(
    ntHash,
    Buffer.from(`${username.toUpperCase()}${domain}`, "utf16le"),
  )
}

function writeSecurityBuffer(
  message: Buffer,
  offset: number,
  length: number,
  dataOffset: number,
): void {
  message.writeUInt16LE(length, offset)
  message.writeUInt16LE(length, offset + 2)
  message.writeUInt32LE(dataOffset, offset + 4)
}

function readSecurityBuffer(
  message: Buffer,
  offset: number,
  name: string,
): Buffer {
  if (offset + 8 > message.length) {
    throw new Error(`truncated ${name} security buffer`)
  }
  const length = message.readUInt16LE(offset)
  const allocated = message.readUInt16LE(offset + 2)
  const dataOffset = message.readUInt32LE(offset + 4)
  if (allocated < length || dataOffset > message.length - length) {
    throw new Error(`invalid ${name} security buffer`)
  }
  return message.subarray(dataOffset, dataOffset + length)
}

function decodeBase64(token: string): Buffer {
  if (
    token === "" ||
    token.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(token)
  ) {
    throw new Error("invalid base64 token")
  }
  const padded = token.padEnd(Math.ceil(token.length / 4) * 4, "=")
  return Buffer.from(padded, "base64")
}

function validateMessage(message: Buffer, type: number): void {
  if (message.length < 12) throw new Error("truncated NTLM message")
  if (!message.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("invalid NTLM signature")
  }
  if (message.readUInt32LE(8) !== type) {
    throw new Error(`expected NTLM message type ${type}`)
  }
}

function parseAvPairs(targetInfo: Buffer): AvPair[] {
  if (targetInfo.length === 0) return [{ id: AV_EOL, value: Buffer.alloc(0) }]
  const pairs: AvPair[] = []
  let offset = 0
  while (offset + 4 <= targetInfo.length) {
    const id = targetInfo.readUInt16LE(offset)
    const length = targetInfo.readUInt16LE(offset + 2)
    offset += 4
    if (offset > targetInfo.length - length) {
      throw new Error("invalid NTLM target-info AV pair")
    }
    const value = Buffer.from(targetInfo.subarray(offset, offset + length))
    offset += length
    if (id === AV_EOL) {
      if (length !== 0 || offset !== targetInfo.length) {
        throw new Error("invalid NTLM target-info terminator")
      }
      pairs.push({ id, value })
      return pairs
    }
    pairs.push({ id, value })
  }
  throw new Error("NTLM target info is missing its terminator")
}

function serializeAvPairs(pairs: AvPair[], includeMic: boolean): Buffer {
  const output: AvPair[] = []
  let hasFlags = false
  for (const pair of pairs) {
    if (pair.id === AV_EOL) continue
    if (pair.id === AV_FLAGS && includeMic) {
      if (pair.value.length !== 4) throw new Error("invalid NTLM AV flags")
      const value = Buffer.from(pair.value)
      value.writeUInt32LE(value.readUInt32LE(0) | MIC_PRESENT, 0)
      output.push({ id: pair.id, value })
      hasFlags = true
    } else {
      output.push(pair)
      if (pair.id === AV_FLAGS) hasFlags = true
    }
  }
  if (includeMic && !hasFlags) {
    const value = Buffer.alloc(4)
    value.writeUInt32LE(MIC_PRESENT)
    output.push({ id: AV_FLAGS, value })
  }
  output.push({ id: AV_EOL, value: Buffer.alloc(0) })
  return Buffer.concat(
    output.map(({ id, value }) => {
      const pair = Buffer.alloc(4 + value.length)
      pair.writeUInt16LE(id, 0)
      pair.writeUInt16LE(value.length, 2)
      value.copy(pair, 4)
      return pair
    }),
  )
}

export function createType1Message(): Buffer {
  const message = Buffer.alloc(32)
  SIGNATURE.copy(message)
  message.writeUInt32LE(1, 8)
  message.writeUInt32LE(NEGOTIATE_FLAGS, 12)
  writeSecurityBuffer(message, 16, 0, 32)
  writeSecurityBuffer(message, 24, 0, 32)
  return message
}

export function parseType2Message(token: string): ParsedType2Message {
  const raw = decodeBase64(token)
  validateMessage(raw, 2)
  if (raw.length < 48) throw new Error("truncated NTLM Type 2 message")
  const flags = raw.readUInt32LE(20)
  if ((flags & NEGOTIATE_NTLM) === 0) {
    throw new Error("NTLM Type 2 message does not negotiate NTLM")
  }
  if ((flags & NEGOTIATE_UNICODE) === 0) {
    throw new Error("NTLM Type 2 message does not negotiate Unicode")
  }
  if ((flags & NEGOTIATE_EXTENDED_SESSION_SECURITY) === 0) {
    throw new Error(
      "NTLM Type 2 message does not negotiate extended session security",
    )
  }
  const challenge = Buffer.from(raw.subarray(24, 32))
  const targetInfoBuffer = readSecurityBuffer(raw, 40, "target info")
  if ((flags & NEGOTIATE_TARGET_INFO) !== 0 && targetInfoBuffer.length === 0) {
    throw new Error("NTLM Type 2 message has empty target info")
  }
  const targetInfo = parseAvPairs(targetInfoBuffer)
  let timestamp: bigint | undefined
  let avFlags = 0
  for (const pair of targetInfo) {
    if (pair.id === AV_TIMESTAMP) {
      if (pair.value.length !== 8) throw new Error("invalid NTLM AV timestamp")
      timestamp = pair.value.readBigUInt64LE()
    }
    if (pair.id === AV_FLAGS) {
      if (pair.value.length !== 4) throw new Error("invalid NTLM AV flags")
      avFlags = pair.value.readUInt32LE()
    }
  }
  return {
    raw,
    flags,
    challenge,
    targetInfo,
    timestamp,
    requiresMic: timestamp !== undefined || (avFlags & MIC_PRESENT) !== 0,
  }
}

function currentFiletime(): bigint {
  return (BigInt(Date.now()) + FILETIME_EPOCH) * 10000n
}

export function createType3Message(
  type2: ParsedType2Message,
  credentials: NtlmCredentials,
  options: Type3Options = {},
): Buffer {
  if (
    options.clientChallenge !== undefined &&
    options.clientChallenge.length !== 8
  ) {
    throw new Error("NTLM client challenge must be 8 bytes")
  }
  const includeMic = options.type1 !== undefined
  if (options.type1) validateMessage(options.type1, 1)
  const timestamp = options.timestamp ?? type2.timestamp ?? currentFiletime()
  const clientChallenge = options.clientChallenge ?? randomBytes(8)
  const targetInfo = serializeAvPairs(type2.targetInfo, includeMic)
  const blob = Buffer.alloc(28)
  blob[0] = 1
  blob[1] = 1
  blob.writeBigUInt64LE(timestamp, 8)
  clientChallenge.copy(blob, 16)
  const proofInput = Buffer.concat([blob, targetInfo, Buffer.alloc(4)])
  const responseKey = ntlmV2Hash(
    credentials.username,
    credentials.password,
    credentials.domain,
  )
  const proof = hmacMd5(responseKey, type2.challenge, proofInput)
  const ntResponse = Buffer.concat([proof, proofInput])
  const lmResponse = Buffer.alloc(24)
  const domain = Buffer.from(credentials.domain, "utf16le")
  const username = Buffer.from(credentials.username, "utf16le")
  const workstation = Buffer.from(credentials.workstation, "utf16le")
  const payloads = [domain, username, workstation, lmResponse, ntResponse]
  const message = Buffer.alloc(88 + payloads.reduce((n, p) => n + p.length, 0))
  SIGNATURE.copy(message)
  message.writeUInt32LE(3, 8)
  let dataOffset = 88
  for (const [securityOffset, payload] of [
    [28, domain],
    [36, username],
    [44, workstation],
    [12, lmResponse],
    [20, ntResponse],
  ] as const) {
    writeSecurityBuffer(message, securityOffset, payload.length, dataOffset)
    payload.copy(message, dataOffset)
    dataOffset += payload.length
  }
  writeSecurityBuffer(message, 52, 0, dataOffset)
  const flags =
    (type2.flags & NEGOTIATE_FLAGS) | NEGOTIATE_EXTENDED_SESSION_SECURITY
  message.writeUInt32LE(flags, 60)
  if (options.type1) {
    const sessionBaseKey = hmacMd5(responseKey, proof)
    const mic = hmacMd5(sessionBaseKey, options.type1, type2.raw, message)
    mic.copy(message, 72)
  }
  return message
}

export function getNtlmChallenge(header: string | null): NtlmChallenge {
  if (!header) return { kind: "none" }
  let offer: NtlmChallenge | undefined
  let negotiate: NtlmChallenge | undefined
  for (const part of header.split(",")) {
    const match = part.trim().match(/^(NTLM|Negotiate)(?:\s+(\S+))?$/i)
    if (!match) continue
    const scheme = match[1]!.toLowerCase() === "ntlm" ? "NTLM" : "Negotiate"
    const token = match[2]
    if (!token) {
      if (scheme === "NTLM") offer = { kind: "offer", scheme: "NTLM" }
      continue
    }
    if (scheme === "NTLM") {
      return { kind: "type2", scheme, message: parseType2Message(token) }
    }
    try {
      negotiate = {
        kind: "type2",
        scheme,
        message: parseType2Message(token),
      }
    } catch {
      // A Negotiate token may be SPNEGO or Kerberos rather than raw NTLMSSP.
    }
  }
  return offer ?? negotiate ?? { kind: "none" }
}
