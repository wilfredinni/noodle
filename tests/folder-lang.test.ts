import { describe, it, expect } from "bun:test"
import { lang } from "../src/lang"
import type { Folder } from "../src/schema"

describe("lang.parseFolder", () => {
  it("returns empty for empty yaml", () => {
    const result = lang.parseFolder("{}\n")
    expect(result).toEqual({ meta: undefined, overrides: undefined })
  })

  it("parses meta name override", () => {
    const result = lang.parseFolder("meta:\n  name: Authentication\n")
    expect(result.meta).toEqual({ name: "Authentication" })
  })

  it("parses meta seq", () => {
    const result = lang.parseFolder("meta:\n  seq: 5\n")
    expect(result.meta).toEqual({ seq: 5 })
  })

  it("parses meta with both name and seq", () => {
    const result = lang.parseFolder("meta:\n  name: Auth\n  seq: 1\n")
    expect(result.meta).toEqual({ name: "Auth", seq: 1 })
  })

  it("parses headers", () => {
    const result = lang.parseFolder(
      "headers:\n  Authorization: Bearer xxx\n  X-Custom:\n    value: val\n    enabled: false\n",
    )
    expect(result.overrides?.headers).toEqual({
      Authorization: { value: "Bearer xxx", enabled: true },
      "X-Custom": { value: "val", enabled: false },
    })
  })

  it("parses auth bearer", () => {
    const result = lang.parseFolder("auth:\n  type: bearer\n  token: tok123\n")
    expect(result.overrides?.auth).toEqual({ type: "bearer", token: "tok123" })
  })

  it("parses auth basic", () => {
    const result = lang.parseFolder(
      "auth:\n  type: basic\n  user: admin\n  pass: secret\n",
    )
    expect(result.overrides?.auth).toEqual({
      type: "basic",
      user: "admin",
      pass: "secret",
    })
  })

  it("parses auth api_key", () => {
    const result = lang.parseFolder(
      "auth:\n  type: api_key\n  key: X-API-Key\n  value: abc\n  placement: header\n",
    )
    expect(result.overrides?.auth).toEqual({
      type: "api_key",
      key: "X-API-Key",
      value: "abc",
      placement: "header",
    })
  })

  it("throws on invalid auth api_key placement", () => {
    expect(() =>
      lang.parseFolder(
        "auth:\n  type: api_key\n  key: X-API-Key\n  value: abc\n  placement: body\n",
      ),
    ).toThrow('placement must be "header" or "query"')
  })

  it("throws on invalid YAML", () => {
    expect(() => lang.parseFolder("{ broken: : : ")).toThrow("YAML syntax")
  })

  it("throws on non-mapping top level", () => {
    expect(() => lang.parseFolder("- item\n")).toThrow(
      "expected a YAML mapping",
    )
  })
})

describe("AWS SigV4 folder auth", () => {
  it("round-trips inherited AWS signing configuration", () => {
    const folder = {
      id: "aws",
      name: "aws",
      path: "aws",
      overrides: {
        auth: {
          type: "aws_sigv4" as const,
          access_key: "$AWS_ACCESS_KEY_ID",
          secret_key: "$AWS_SECRET_ACCESS_KEY",
          region: "us-east-1",
          service: "s3",
        },
      },
      children: [],
    }
    const serialized = lang.serializeFolder(folder)
    expect(lang.parseFolder(serialized).overrides?.auth).toEqual(
      folder.overrides.auth,
    )
  })
})

describe("NTLMv2 folder auth", () => {
  it("round-trips optional domain and workstation fields", () => {
    const folder: Folder = {
      id: "ntlm",
      name: "ntlm",
      path: "ntlm",
      overrides: {
        auth: {
          type: "ntlm",
          username: "$NTLM_USERNAME",
          password: "$NTLM_PASSWORD",
          domain: "$NTLM_DOMAIN",
          workstation: "$NTLM_WORKSTATION",
        },
      },
      children: [],
    }
    const serialized = lang.serializeFolder(folder)
    expect(lang.parseFolder(serialized).overrides?.auth).toEqual(
      folder.overrides?.auth,
    )
  })
})

describe("lang.serializeFolder", () => {
  it("serializes folder with name override", () => {
    const result = lang.serializeFolder({
      id: "auth",
      name: "Authentication",
      path: "auth",
      children: [],
    })
    expect(result).toContain("name: Authentication")
  })

  it("serializes empty folder (no meta)", () => {
    const result = lang.serializeFolder({
      id: "auth",
      name: "auth",
      path: "auth",
      children: [],
    })
    expect(result).toBe("")
  })

  it("serializes folder with auth type none", () => {
    const result = lang.serializeFolder({
      id: "parent",
      name: "parent",
      path: "parent",
      children: [],
      overrides: { auth: { type: "none" } },
    })
    expect(result).toContain("type: none")
  })

  it("serializes folder with seq", () => {
    const result = lang.serializeFolder({
      id: "auth",
      name: "auth",
      path: "auth",
      seq: 2,
      children: [],
    })
    expect(result).toContain("seq: 2")
  })

  it("round-trips parse -> serialize -> parse", () => {
    const original = "meta:\n  name: Auth\n  seq: 1\nheaders:\n  X-Test: val\n"
    const parsed = lang.parseFolder(original)
    const serialized = lang.serializeFolder({
      id: "auth",
      name: "Auth",
      path: "auth",
      seq: 1,
      overrides: parsed.overrides,
      children: [],
    })
    const reparsed = lang.parseFolder(serialized)
    expect(reparsed.meta).toEqual({ name: "Auth", seq: 1 })
    expect(reparsed.overrides?.headers).toEqual({
      "X-Test": { value: "val", enabled: true },
    })
  })

  it("round-trips auth type none through serialize -> parse", () => {
    const serialized = lang.serializeFolder({
      id: "child",
      name: "child",
      path: "child",
      children: [],
      overrides: { auth: { type: "none" } },
    })
    const reparsed = lang.parseFolder(serialized)
    expect(reparsed.overrides?.auth).toEqual({ type: "none" })
  })

  it("serializes folder renamed from dirname to custom name", () => {
    const result = lang.serializeFolder({
      id: "auth",
      name: "Authentication",
      path: "auth",
      children: [],
    })
    expect(result).toContain("meta:")
    expect(result).toContain("name: Authentication")
  })

  it("round-trips folder rename: serialize with new name -> parse gets meta.name", () => {
    const serialized = lang.serializeFolder({
      id: "posts",
      name: "Blog Posts",
      path: "posts",
      children: [],
    })
    const parsed = lang.parseFolder(serialized)
    expect(parsed.meta?.name).toBe("Blog Posts")
  })
})
