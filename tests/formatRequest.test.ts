import { describe, it, expect } from "bun:test"
import type { Request } from "../src/schema"
import {
  methodColor,
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "../src/ui/formatRequest"
import { opencodeTheme, catppuccinTheme } from "../src/ui/theme"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "r1",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("methodColor", () => {
  const theme = opencodeTheme

  it("GET → success", () => {
    expect(methodColor("GET", theme)).toBe("#7fd88f")
  })
  it("POST → warning", () => {
    expect(methodColor("POST", theme)).toBe("#f5a742")
  })
  it("PUT → warning", () => {
    expect(methodColor("PUT", theme)).toBe("#f5a742")
  })
  it("PATCH → warning", () => {
    expect(methodColor("PATCH", theme)).toBe("#f5a742")
  })
  it("DELETE → error", () => {
    expect(methodColor("DELETE", theme)).toBe("#e06c75")
  })
  it("HEAD → textMuted", () => {
    expect(methodColor("HEAD", theme)).toBe("#808080")
  })
  it("OPTIONS → textMuted", () => {
    expect(methodColor("OPTIONS", theme)).toBe("#808080")
  })
})

describe("methodColor with catppuccin", () => {
  it("GET uses catppuccin success", () => {
    expect(methodColor("GET", catppuccinTheme)).toBe("#a6e3a1")
  })
})

describe("formatHeaders", () => {
  it("returns empty array when no headers", () => {
    expect(formatHeaders({})).toEqual([])
  })
  it("renders single header as 'Key: Value'", () => {
    expect(
      formatHeaders({
        "content-type": { value: "application/json", enabled: true },
      }),
    ).toEqual(["content-type: application/json"])
  })
  it("sorts multiple headers alphabetically by key", () => {
    expect(
      formatHeaders({
        "x-b": { value: "2", enabled: true },
        "content-type": { value: "application/json", enabled: true },
        "x-a": { value: "1", enabled: true },
      }),
    ).toEqual(["content-type: application/json", "x-a: 1", "x-b: 2"])
  })
})

describe("formatParams", () => {
  it("returns empty array when no params", () => {
    expect(formatParams({})).toEqual([])
  })
  it("renders single param as 'Key: Value'", () => {
    expect(formatParams({ verbose: { value: "true", enabled: true } })).toEqual(
      ["verbose: true"],
    )
  })
  it("sorts multiple params alphabetically by key", () => {
    expect(
      formatParams({
        "z-last": { value: "3", enabled: true },
        "a-first": { value: "1", enabled: true },
        "m-middle": { value: "2", enabled: true },
      }),
    ).toEqual(["a-first: 1", "m-middle: 2", "z-last: 3"])
  })
})

describe("formatBody", () => {
  it("returns empty string for undefined body", () => {
    expect(formatBody(makeReq().body)).toBe("")
  })
  it("returns empty string for empty body", () => {
    expect(formatBody("")).toBe("")
  })
  it("pretty-prints valid compact JSON (2-space indent)", () => {
    expect(formatBody('{"b":1,"a":2}')).toBe('{\n  "b": 1,\n  "a": 2\n}')
  })
  it("returns raw body when JSON.parse fails", () => {
    expect(formatBody("not json {")).toBe("not json {")
  })
  it("stable round-trip for already-formatted JSON", () => {
    expect(formatBody('{\n  "a": 1\n}')).toBe('{\n  "a": 1\n}')
  })
})

describe("formatAuth", () => {
  it("returns (none) for undefined auth", () => {
    expect(formatAuth(makeReq().auth)).toBe("(none)")
  })
  it("returns (none) for type none", () => {
    expect(formatAuth({ type: "none" })).toBe("(none)")
  })
  it("masks bearer token with fixed dots", () => {
    expect(formatAuth({ type: "bearer", token: "secret-token-abc" })).toBe(
      "bearer: \u2022\u2022\u2022\u2022",
    )
  })
  it("masks basic pass, shows user in cleartext", () => {
    expect(formatAuth({ type: "basic", user: "alice", pass: "hunter2" })).toBe(
      "basic: alice:\u2022\u2022\u2022\u2022",
    )
  })
})
