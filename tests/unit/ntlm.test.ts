import { describe, expect, it } from "bun:test"
import {
  createType1Message,
  createType3Message,
  getNtlmChallenge,
  ntlmV2Hash,
  parseType2Message,
} from "../../src/requests/ntlm"

const SIGNATURE = Buffer.from("NTLMSSP\0", "ascii")

function type2Token(
  targetInfo = Buffer.from([0, 0, 0, 0]),
  flags = 0x00888205,
): string {
  const message = Buffer.alloc(48 + targetInfo.length)
  SIGNATURE.copy(message)
  message.writeUInt32LE(2, 8)
  message.writeUInt32LE(flags, 20)
  Buffer.from("0123456789abcdef", "hex").copy(message, 24)
  message.writeUInt16LE(targetInfo.length, 40)
  message.writeUInt16LE(targetInfo.length, 42)
  message.writeUInt32LE(48, 44)
  targetInfo.copy(message, 48)
  return message.toString("base64")
}

function securityBuffer(message: Buffer, offset: number): Buffer {
  const length = message.readUInt16LE(offset)
  const dataOffset = message.readUInt32LE(offset + 4)
  return message.subarray(dataOffset, dataOffset + length)
}

describe("NTLMv2 messages", () => {
  it("matches the MS-NLMP NTOWFv2 known-answer vector", () => {
    expect(ntlmV2Hash("User", "Password", "Domain").toString("hex")).toBe(
      "0c868a403bfd7a93a3001ef22ef02e3f",
    )
  })

  it("creates the documented NTLMv2 proof", () => {
    const type2 = parseType2Message(
      type2Token(
        Buffer.from(
          "02000c0044006f006d00610069006e0001000c0053006500720076006500720000000000",
          "hex",
        ),
      ),
    )
    const type3 = createType3Message(
      type2,
      {
        username: "User",
        password: "Password",
        domain: "Domain",
        workstation: "COMPUTER",
      },
      {
        clientChallenge: Buffer.from("aaaaaaaaaaaaaaaa", "hex"),
        timestamp: 0n,
      },
    )
    expect(securityBuffer(type3, 20).subarray(0, 16).toString("hex")).toBe(
      "68cd0ab851e51c96aabc927bebef6a1c",
    )
    expect(securityBuffer(type3, 12).equals(Buffer.alloc(24))).toBe(true)
  })

  it("creates a minimal Type 1 and a MIC-bearing Type 3", () => {
    const type1 = createType1Message()
    expect(type1.length).toBe(32)
    expect(type1.subarray(0, 8)).toEqual(SIGNATURE)
    expect(type1.readUInt32LE(8)).toBe(1)

    const type3 = createType3Message(
      parseType2Message(type2Token()),
      {
        username: "alice",
        password: "secret",
        domain: "EXAMPLE",
        workstation: "NOODLE",
      },
      {
        type1,
        clientChallenge: Buffer.alloc(8, 0xaa),
        timestamp: 0n,
      },
    )
    expect(type3.subarray(0, 8)).toEqual(SIGNATURE)
    expect(type3.readUInt32LE(8)).toBe(3)
    expect(type3.subarray(72, 88).equals(Buffer.alloc(16))).toBe(false)
    const ntResponse = securityBuffer(type3, 20)
    const avFlagsOffset = ntResponse.length - 16
    expect(ntResponse.readUInt16LE(avFlagsOffset)).toBe(6)
    expect(ntResponse.readUInt32LE(avFlagsOffset + 4) & 2).toBe(2)
  })

  it("strictly rejects malformed Type 2 messages", () => {
    expect(() => parseType2Message("!!!")).toThrow("base64")
    expect(() =>
      parseType2Message(Buffer.from("short").toString("base64")),
    ).toThrow("truncated")

    const wrongType = Buffer.from(type2Token(), "base64")
    wrongType.writeUInt32LE(1, 8)
    expect(() => parseType2Message(wrongType.toString("base64"))).toThrow(
      "message type 2",
    )

    const badOffset = Buffer.from(type2Token(), "base64")
    badOffset.writeUInt32LE(0xffffffff, 44)
    expect(() => parseType2Message(badOffset.toString("base64"))).toThrow(
      "security buffer",
    )

    expect(() => parseType2Message(type2Token(undefined, 0x00880204))).toThrow(
      "Unicode",
    )
    expect(() => parseType2Message(type2Token(undefined, 0x00888005))).toThrow(
      "does not negotiate NTLM",
    )
    expect(() => parseType2Message(type2Token(undefined, 0x00808205))).toThrow(
      "extended session security",
    )
    expect(() =>
      parseType2Message(type2Token(Buffer.from([1, 0, 0, 0]))),
    ).toThrow("missing its terminator")
  })

  it("rejects a client challenge that is not 8 bytes", () => {
    expect(() =>
      createType3Message(
        parseType2Message(type2Token()),
        {
          username: "alice",
          password: "secret",
          domain: "EXAMPLE",
          workstation: "NOODLE",
        },
        { clientChallenge: Buffer.alloc(7) },
      ),
    ).toThrow("NTLM client challenge must be 8 bytes")
  })

  it("extracts combined challenges and ignores SPNEGO Negotiate tokens", () => {
    expect(getNtlmChallenge("Negotiate, NTLM")).toEqual({
      kind: "offer",
      scheme: "NTLM",
    })
    expect(getNtlmChallenge(`Negotiate ${type2Token()}`).kind).toBe("type2")
    expect(
      getNtlmChallenge(
        `Negotiate ${Buffer.from("not-ntlm").toString("base64")}`,
      ),
    ).toEqual({ kind: "none" })
    expect(getNtlmChallenge(`Negotiate, NTLM ${type2Token()}`).kind).toBe(
      "type2",
    )
  })

  it("marks timestamp challenges as requiring a MIC transcript", () => {
    const targetInfo = Buffer.alloc(16)
    targetInfo.writeUInt16LE(7, 0)
    targetInfo.writeUInt16LE(8, 2)
    targetInfo.writeBigUInt64LE(1n, 4)
    expect(parseType2Message(type2Token(targetInfo)).requiresMic).toBe(true)
  })
})
