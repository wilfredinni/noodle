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
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
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
    expect(req.headers).toEqual({
      Accept: { value: "application/json", enabled: true },
    })
    expect(req.params).toEqual({ verbose: { value: "true", enabled: true } })
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

  it("throws on non-string/non-object header value", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders:\n  X: 123\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: headers.X must be a string or {value, enabled} object",
    )
  })

  it("throws on non-mapping headers", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders: 123\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: headers must be a map",
    )
  })

  it("throws on non-boolean followRedirects", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nfollowRedirects: "yes"\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "followRedirects" must be a boolean',
    )
  })

  it("defaults followRedirects to true when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).followRedirects).toBe(true)
  })

  it("parses followRedirects: false", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nfollowRedirects: false\n`
    expect(lang.parseRequest("x", yaml).followRedirects).toBe(false)
  })

  it("throws on non-integer maxRedirects", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nmaxRedirects: 5.5\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "maxRedirects" must be a non-negative integer',
    )
  })

  it("throws on negative maxRedirects", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nmaxRedirects: -1\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "maxRedirects" must be a non-negative integer',
    )
  })

  it("defaults maxRedirects to 5 when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).maxRedirects).toBe(5)
  })

  it("parses maxRedirects: 10", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nmaxRedirects: 10\n`
    expect(lang.parseRequest("x", yaml).maxRedirects).toBe(10)
  })

  it("throws on invalid auth.type", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: oauth\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: invalid auth.type "oauth", expected none|bearer|basic',
    )
  })

  it("throws on YAML syntax error with wrapped message", () => {
    const yaml = `name: Foo\n  : : :\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      /lang\.parseRequest: YAML syntax:/,
    )
  })
})

describe("lang.parseRequest — KvEntry parsing", () => {
  it("parses headers with explicit enabled flag", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders:\n  X-Debug: { value: "true", enabled: false }\n  Accept: application/json\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.headers).toEqual({
      "X-Debug": { value: "true", enabled: false },
      Accept: { value: "application/json", enabled: true },
    })
  })

  it("parses params with explicit enabled flag", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nparams:\n  debug: { value: "1", enabled: false }\n  verbose: "true"\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.params).toEqual({
      debug: { value: "1", enabled: false },
      verbose: { value: "true", enabled: true },
    })
  })

  it("throws on header value object missing 'value'", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nheaders:\n  X: { enabled: false }\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: headers.X must have string "value"',
    )
  })
})

describe("lang.parseRequest — auth variants", () => {
  it("parses bearer auth", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: bearer\n  token: abc123\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "bearer",
      token: "abc123",
    })
  })

  it("parses basic auth", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: basic\n  user: foo\n  pass: bar\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "basic",
      user: "foo",
      pass: "bar",
    })
  })

  it("parses api_key auth with default placement", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: api_key\n  key: X-API-Key\n  value: abc123\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "api_key",
      key: "X-API-Key",
      value: "abc123",
      placement: "header",
    })
  })

  it("parses api_key auth with query placement", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: api_key\n  key: api_key\n  value: secret\n  placement: query\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "api_key",
      key: "api_key",
      value: "secret",
      placement: "query",
    })
  })

  it("api_key throws when key missing", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: api_key\n  value: abc\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: auth.api_key requires "key" and "value"',
    )
  })

  it("api_key throws when value missing", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: api_key\n  key: X-Key\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: auth.api_key requires "key" and "value"',
    )
  })

  it("parses api_key with $var in key and value", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nauth:\n  type: api_key\n  key: "$KEY_NAME"\n  value: "$KEY_VALUE"\n`
    expect(lang.parseRequest("x", yaml).auth).toEqual({
      type: "api_key",
      key: "$KEY_NAME",
      value: "$KEY_VALUE",
      placement: "header",
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
  it("preserves $var literals verbatim in url, headers, body, auth.token", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://$host/users/$id\nheaders:\n  Authorization: "Bearer $token"\nbody: '{"id": "$id"}'\nauth:\n  type: bearer\n  token: "$token"\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.url).toBe("https://$host/users/$id")
    expect(req.headers.Authorization).toEqual({
      value: "Bearer $token",
      enabled: true,
    })
    expect(req.body).toBe('{"id": "$id"}')
    expect(req.auth).toEqual({ type: "bearer", token: "$token" })
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
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

describe("lang.serializeRequest — canonical output", () => {
  it("emits name, method, url always (no other fields when all defaults)", () => {
    const out = lang.serializeRequest(makeReq())
    expect(out).toBe(
      "name: Get user\nmethod: GET\nurl: https://api.example.com/users/1\ntimeout: 0\nfollowRedirects: true\nmaxRedirects: 5\n",
    )
  })

  it("emits headers when non-empty, omits empty params/body/auth", () => {
    const out = lang.serializeRequest(
      makeReq({
        headers: { Accept: { value: "application/json", enabled: true } },
      }),
    )
    expect(out).toBe(
      "name: Get user\nmethod: GET\nurl: https://api.example.com/users/1\ntimeout: 0\nfollowRedirects: true\nmaxRedirects: 5\nheaders:\n  Accept: application/json\n",
    )
  })

  it("emits params when non-empty", () => {
    const out = lang.serializeRequest(
      makeReq({ params: { verbose: { value: "true", enabled: true } } }),
    )
    expect(out).toContain("params:\n  verbose: 'true'\n")
    expect(out).not.toContain("headers")
    expect(out).not.toContain("body")
    expect(out).not.toContain("auth")
  })

  it("emits body when defined", () => {
    const out = lang.serializeRequest(makeReq({ body: '{"limit": 10}' }))
    expect(out).toContain("body: '{\"limit\": 10}'\n")
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

  it("emits api_key auth when set", () => {
    const out = lang.serializeRequest(
      makeReq({
        auth: {
          type: "api_key",
          key: "X-API-Key",
          value: "secret123",
          placement: "header",
        },
      }),
    )
    expect(out).toContain(
      "auth:\n  type: api_key\n  key: X-API-Key\n  value: secret123\n  placement: header\n",
    )
  })

  it("does NOT emit id field", () => {
    const out = lang.serializeRequest(makeReq({ id: "my-id" }))
    expect(out).not.toContain("id:")
  })

  it("preserves $var literals verbatim", () => {
    const out = lang.serializeRequest(
      makeReq({
        url: "https://$host/users",
        headers: { Authorization: { value: "Bearer $token", enabled: true } },
        auth: { type: "bearer", token: "$token" },
      }),
    )
    expect(out).toContain("https://$host/users")
    expect(out).toContain("Bearer $token")
    expect(out).toContain("token: $token")
  })
})

describe("lang.serializeRequest — canonical key order", () => {
  it("emits keys in fixed order: name, method, url, headers, params, body, auth", () => {
    const out = lang.serializeRequest(
      makeReq({
        headers: { Accept: { value: "application/json", enabled: true } },
        params: { verbose: { value: "true", enabled: true } },
        body: '{"limit": 10}',
        auth: { type: "bearer", token: "abc123" },
      }),
    )
    const lines = out.split("\n").filter((l) => l && !l.startsWith(" "))
    const topKeys = lines.map((l) => l.split(":")[0])
    expect(topKeys).toEqual([
      "name",
      "method",
      "url",
      "timeout",
      "followRedirects",
      "maxRedirects",
      "headers",
      "params",
      "body",
      "auth",
    ])
  })
})

describe("lang.serializeRequest — disabled entries", () => {
  it("serializes disabled header as {value, enabled: false} flow mapping", () => {
    const out = lang.serializeRequest(
      makeReq({
        headers: {
          Accept: { value: "application/json", enabled: true },
          "X-Debug": { value: "true", enabled: false },
        },
      }),
    )
    expect(out).toContain("Accept: application/json")
    expect(out).toContain("X-Debug: { value: 'true', enabled: false }")
  })

  it("serializes disabled param as {value, enabled: false} flow mapping", () => {
    const out = lang.serializeRequest(
      makeReq({
        params: {
          verbose: { value: "true", enabled: true },
          debug: { value: "1", enabled: false },
        },
      }),
    )
    expect(out).toContain("verbose: 'true'")
    expect(out).toContain("debug: { value: '1', enabled: false }")
  })
})

describe("lang — semantic round-trip", () => {
  it("parse → serialize → parse yields equal Request (same id)", () => {
    const original: Request = {
      id: "create-post",
      name: "Create post",
      method: "POST",
      url: "https://$host/posts",
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      headers: {
        "Content-Type": { value: "application/json", enabled: true },
        Authorization: { value: "Bearer $token", enabled: true },
      },
      params: { draft: { value: "true", enabled: true } },
      body: '{"title": "hello", "body": "world"}',
      auth: { type: "bearer", token: "$token" },
    }

    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)

    expect(reparsed).toEqual(original)
  })

  it("round-trip preserves minimal request (defaults reapplied)", () => {
    const original: Request = {
      id: "ping",
      name: "Ping",
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: {},
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip preserves basic auth", () => {
    const original: Request = {
      id: "basic-req",
      name: "Basic req",
      method: "DELETE",
      url: "https://example.com/item/1",
      headers: {},
      params: {},
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "basic", user: "foo", pass: "bar" },
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip preserves api_key auth", () => {
    const original: Request = {
      id: "apikey-req",
      name: "API Key req",
      method: "GET",
      url: "https://example.com/data",
      headers: {},
      params: {},
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: {
        type: "api_key",
        key: "X-API-Key",
        value: "$KEYVAL",
        placement: "query",
      },
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip preserves disabled entries", () => {
    const original: Request = {
      id: "rtt",
      name: "RTT",
      method: "GET",
      url: "https://example.com",
      headers: {
        Accept: { value: "application/json", enabled: true },
        "X-Debug": { value: "true", enabled: false },
      },
      params: {},
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })
})
