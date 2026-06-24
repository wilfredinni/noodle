import { describe, it, expect } from "bun:test"
import { lang } from "../src/lang"

describe("lang.parseRequest — required fields", () => {
  it("parses a minimal valid request (name, method, url)", () => {
    const yaml = `name: Get user\nmethod: GET\nurl: https://api.example.com/users/1\n`
    const req = lang.parseRequest("get-user", yaml)
    expect(req).toEqual({
      id: "get-user",
      name: "Get user",
      method: "GET",
      url: "https://api.example.com/users/1",
      headers: {},
      params: {},
      auth: { type: "none" },
    })
  })

  it("throws when name is missing", () => {
    const yaml = `method: GET\nurl: https://example.com\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: missing required field "name"',
    )
  })

  it("throws when method is missing", () => {
    const yaml = `name: Foo\nurl: https://example.com\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: missing required field "method"',
    )
  })

  it("throws when url is missing", () => {
    const yaml = `name: Foo\nmethod: GET\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: missing required field "url"',
    )
  })

  it("uses the id argument as req.id (not read from yaml)", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    const req = lang.parseRequest("my-id", yaml)
    expect(req.id).toBe("my-id")
  })
})

describe("lang.parseRequest — defaults", () => {
  it("defaults headers to {} when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).headers).toEqual({})
  })

  it("defaults params to {} when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).params).toEqual({})
  })

  it("defaults auth to { type: none } when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({ type: "none" })
  })

  it("leaves body undefined when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).body).toBeUndefined()
  })

  it("parses provided headers, params, body", () => {
    const yaml = `name: Foo\nmethod: POST\nurl: https://example.com\nheaders:\n  Accept: application/json\nparams:\n  verbose: "true"\nbody: '{"limit": 10}'\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.headers).toEqual({ Accept: "application/json" })
    expect(req.params).toEqual({ verbose: "true" })
    expect(req.body).toBe('{"limit": 10}')
  })
})
