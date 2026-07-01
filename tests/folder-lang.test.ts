import { describe, it, expect } from "bun:test"
import { lang } from "../src/lang"

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

  it("throws on invalid YAML", () => {
    expect(() => lang.parseFolder("{ broken: : : ")).toThrow("YAML syntax")
  })

  it("throws on non-mapping top level", () => {
    expect(() => lang.parseFolder("- item\n")).toThrow(
      "expected a YAML mapping",
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
})
