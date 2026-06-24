import { describe, it, expect } from "bun:test"
import type { Request } from "../src/schema"
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

describe("lang.parseRequest — strictness", () => {
  it("throws on unknown top-level key", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nmethd: GET\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: unknown field "methd"',
    )
  })

  it("throws on invalid method value", () => {
    const yaml = `name: Foo\nmethod: GETT\nurl: https://example.com\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: invalid method "GETT", expected one of GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS',
    )
  })

  it("throws on non-string name", () => {
    const yaml = `name: 123\nmethod: GET\nurl: https://example.com\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: missing required field "name"',
    )
  })

  it("throws on non-string-map headers (value not string)", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders:\n  X: 123\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: headers must be a map of string to string",
    )
  })

  it("throws on non-string-map headers (not a mapping)", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders: 123\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: headers must be a map of string to string",
    )
  })

  it("throws on invalid auth.type", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: invalid auth.type "oauth", expected none|bearer|basic',
    )
  })

  it("throws on YAML syntax error with wrapped message", () => {
    const yaml = `name: Foo\n  : : :\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(/lang\.parseRequest: YAML syntax:/)
  })
})

describe("lang.parseRequest — auth variants", () => {
  it("parses bearer auth", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: bearer\n  token: abc123\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({ type: "bearer", token: "abc123" })
  })

  it("parses basic auth", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: basic\n  user: foo\n  pass: bar\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "basic",
      user: "foo",
      pass: "bar",
    })
  })

  it("parses explicit none auth", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: none\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({ type: "none" })
  })

  it("bearer throws when token missing", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: bearer\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: auth.bearer requires "token"',
    )
  })

  it("basic throws when user missing", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: basic\n  pass: bar\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: auth.basic requires "user" and "pass"',
    )
  })

  it("none ignores extra sub-keys", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: none\n  token: ignored\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({ type: "none" })
  })
})

describe("lang.parseRequest — env var preservation", () => {
  it("preserves {{var}} literals verbatim in url, headers, body, auth.token", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://{{host}}/users/{{id}}\nheaders:\n  Authorization: "Bearer {{token}}"\nbody: '{"id": "{{id}}"}'\nauth:\n  type: bearer\n  token: "{{token}}"\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.url).toBe("https://{{host}}/users/{{id}}")
    expect(req.headers.Authorization).toBe("Bearer {{token}}")
    expect(req.body).toBe('{"id": "{{id}}"}')
    expect(req.auth).toEqual({ type: "bearer", token: "{{token}}" })
  })
})

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "get-user",
    name: "Get user",
    method: "GET",
    url: "https://api.example.com/users/1",
    headers: {},
    params: {},
    auth: { type: "none" },
    ...over,
  }
}

describe("lang.serializeRequest — canonical output", () => {
  it("emits name, method, url always (no other fields when all defaults)", () => {
    const out = lang.serializeRequest(makeReq())
    expect(out).toBe(
      "name: Get user\nmethod: GET\nurl: https://api.example.com/users/1\n",
    )
  })

  it("emits headers when non-empty, omits empty params/body/auth", () => {
    const out = lang.serializeRequest(
      makeReq({ headers: { Accept: "application/json" } }),
    )
    expect(out).toBe(
      "name: Get user\nmethod: GET\nurl: https://api.example.com/users/1\nheaders:\n  Accept: application/json\n",
    )
  })

  it("emits params when non-empty", () => {
    const out = lang.serializeRequest(makeReq({ params: { verbose: "true" } }))
    expect(out).toContain("params:\n  verbose: 'true'\n")
    expect(out).not.toContain("headers")
    expect(out).not.toContain("body")
    expect(out).not.toContain("auth")
  })

  it("emits body when defined", () => {
    const out = lang.serializeRequest(makeReq({ body: '{"limit": 10}' }))
    expect(out).toContain('body: \'{"limit": 10}\'\n')
  })

  it("emits bearer auth when set, omits none auth", () => {
    const out = lang.serializeRequest(
      makeReq({ auth: { type: "bearer", token: "abc123" } }),
    )
    expect(out).toContain("auth:\n  type: bearer\n  token: abc123\n")
  })

  it("emits basic auth when set", () => {
    const out = lang.serializeRequest(
      makeReq({ auth: { type: "basic", user: "foo", pass: "bar" } }),
    )
    expect(out).toContain("auth:\n  type: basic\n  user: foo\n  pass: bar\n")
  })

  it("does NOT emit id field", () => {
    const out = lang.serializeRequest(makeReq({ id: "my-id" }))
    expect(out).not.toContain("id:")
  })

  it("preserves {{var}} literals verbatim", () => {
    const out = lang.serializeRequest(
      makeReq({
        url: "https://{{host}}/users",
        headers: { Authorization: "Bearer {{token}}" },
        auth: { type: "bearer", token: "{{token}}" },
      }),
    )
    expect(out).toContain("https://{{host}}/users")
    expect(out).toContain("Bearer {{token}}")
    expect(out).toContain("token: '{{token}}'")
  })
})

describe("lang.serializeRequest — canonical key order", () => {
  it("emits keys in fixed order: name, method, url, headers, params, body, auth", () => {
    const out = lang.serializeRequest(
      makeReq({
        headers: { Accept: "application/json" },
        params: { verbose: "true" },
        body: '{"limit": 10}',
        auth: { type: "bearer", token: "abc123" },
      }),
    )
    const lines = out.split("\n").filter((l) => l && !l.startsWith(" "))
    const topKeys = lines.map((l) => l.split(":")[0])
    expect(topKeys).toEqual(["name", "method", "url", "headers", "params", "body", "auth"])
  })
})
