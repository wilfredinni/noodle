import { describe, it, expect } from "bun:test"
import type { Request } from "../src/schema"
import {
  methodColor,
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "../src/ui/formatRequest"

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "r1",
    name: "Test",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    ...over,
  }
}

describe("methodColor", () => {
  it("GET → green", () => {
    expect(methodColor("GET")).toBe("#080")
  })
  it("POST → yellow", () => {
    expect(methodColor("POST")).toBe("#880")
  })
  it("PUT → yellow", () => {
    expect(methodColor("PUT")).toBe("#880")
  })
  it("PATCH → yellow", () => {
    expect(methodColor("PATCH")).toBe("#880")
  })
  it("DELETE → red", () => {
    expect(methodColor("DELETE")).toBe("#c00")
  })
  it("HEAD → dim", () => {
    expect(methodColor("HEAD")).toBe("#888")
  })
  it("OPTIONS → dim", () => {
    expect(methodColor("OPTIONS")).toBe("#888")
  })
})

describe("formatHeaders", () => {
  it("returns empty array when no headers", () => {
    expect(formatHeaders({})).toEqual([])
  })
  it("renders single header as 'Key: Value'", () => {
    expect(formatHeaders({ "content-type": "application/json" })).toEqual([
      "content-type: application/json",
    ])
  })
  it("sorts multiple headers alphabetically by key", () => {
    expect(
      formatHeaders({
        "x-b": "2",
        "content-type": "application/json",
        "x-a": "1",
      }),
    ).toEqual([
      "content-type: application/json",
      "x-a: 1",
      "x-b: 2",
    ])
  })
})

describe("formatParams", () => {
  it("returns empty array when no params", () => {
    expect(formatParams({})).toEqual([])
  })
  it("renders single param as 'Key: Value'", () => {
    expect(formatParams({ verbose: "true" })).toEqual(["verbose: true"])
  })
  it("sorts multiple params alphabetically by key", () => {
    expect(
      formatParams({
        "z-last": "3",
        "a-first": "1",
        "m-middle": "2",
      }),
    ).toEqual([
      "a-first: 1",
      "m-middle: 2",
      "z-last: 3",
    ])
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
