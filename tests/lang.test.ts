import { describe, it, expect } from "bun:test"
import type { Folder, Request } from "../src/schema"
import { lang } from "../src/lang"

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: "x",
    name: "Foo",
    method: "GET",
    url: "https://example.com",
    timeout: 0,
    headers: {},
    params: [],
    ...overrides,
  }
}

describe("AWS SigV4 auth language", () => {
  it("parses and serializes credentials with an optional session token", () => {
    const request = lang.parseRequest(
      "aws",
      `name: AWS\nmethod: GET\nurl: https://example.com\nauth:\n  type: aws_sigv4\n  access_key: $AWS_ACCESS_KEY_ID\n  secret_key: $AWS_SECRET_ACCESS_KEY\n  region: us-east-1\n  service: execute-api\n  session_token: $AWS_SESSION_TOKEN\n`,
    )

    expect(request.auth).toEqual({
      type: "aws_sigv4",
      access_key: "$AWS_ACCESS_KEY_ID",
      secret_key: "$AWS_SECRET_ACCESS_KEY",
      region: "us-east-1",
      service: "execute-api",
      session_token: "$AWS_SESSION_TOKEN",
    })
    expect(
      lang.parseRequest("aws", lang.serializeRequest(request)).auth,
    ).toEqual(request.auth)
  })

  it("requires all non-optional fields", () => {
    expect(() =>
      lang.parseRequest(
        "aws",
        `name: AWS\nmethod: GET\nurl: https://example.com\nauth:\n  type: aws_sigv4\n  access_key: key\n  secret_key: secret\n  region: us-east-1\n`,
      ),
    ).toThrow("auth.aws_sigv4 requires")
  })
})

describe("NTLMv2 auth language", () => {
  it("round-trips required credentials and omits empty optional fields", () => {
    const request = lang.parseRequest(
      "ntlm",
      `name: NTLM\nmethod: GET\nurl: https://example.com\nauth:\n  type: ntlm\n  username: $NTLM_USERNAME\n  password: $NTLM_PASSWORD\n`,
    )
    expect(request.auth).toEqual({
      type: "ntlm",
      username: "$NTLM_USERNAME",
      password: "$NTLM_PASSWORD",
      domain: "",
      workstation: "",
    })
    const serialized = lang.serializeRequest(request)
    expect(serialized).not.toContain("domain:")
    expect(serialized).not.toContain("workstation:")
    expect(lang.parseRequest("ntlm", serialized).auth).toEqual(request.auth)
  })

  it("requires username and password", () => {
    expect(() =>
      lang.parseRequest(
        "ntlm",
        `name: NTLM\nmethod: GET\nurl: https://example.com\nauth:\n  type: ntlm\n  username: user\n`,
      ),
    ).toThrow("auth.ntlm requires")
  })
})

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
      params: [],
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

  it("defaults params to [] when omitted", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\n`
    expect(lang.parseRequest("x", yaml).params).toEqual([])
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
    expect(req.params).toEqual([
      { name: "verbose", value: "true", enabled: true },
    ])
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

  it("parses sendCookies and rejects non-boolean values", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nsendCookies: false\n`
    const parsed = lang.parseRequest("x", yaml)
    expect(parsed.sendCookies).toBe(false)
    expect(lang.serializeRequest(parsed)).toContain("sendCookies: false")

    const omitted = lang.parseRequest(
      "y",
      `name: Foo\nmethod: GET\nurl: https://example.com\n`,
    )
    expect(omitted.sendCookies).toBeUndefined()
    expect(lang.serializeRequest(omitted)).not.toContain("sendCookies")

    const bad = `name: Foo\nmethod: GET\nurl: https://example.com\nsendCookies: nope\n`
    expect(() => lang.parseRequest("z", bad)).toThrow(
      'lang.parseRequest: "sendCookies" must be a boolean',
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

  it("parses a TLS verification override", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\ntls:\n  verify: false\n`
    expect(lang.parseRequest("x", yaml).tls).toEqual({ verify: false })
  })

  it("rejects invalid TLS verification settings", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\ntls:\n  verify: no\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "tls.verify" must be a boolean',
    )
  })

  it("serializes a TLS verification override", () => {
    const request = makeRequest({ tls: { verify: false } })
    const serialized = lang.serializeRequest(request)
    expect(serialized).toContain("tls:\n  verify: false\n")
    expect(lang.parseRequest("x", serialized).tls).toEqual({ verify: false })
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
      'lang.parseRequest: invalid auth.type "oauth", expected none|inherit|bearer|basic|ntlm|api_key|aws_sigv4',
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
    expect(req.params).toEqual([
      { name: "debug", value: "1", enabled: false },
      { name: "verbose", value: "true", enabled: true },
    ])
  })

  it("rejects enabled flags on path params", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com/users/:id\npath_params:\n  - name: id\n    value: "42"\n    enabled: false\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: path_params[0].enabled is not supported",
    )
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

describe("lang.parseRequest — body_type, form_data, file_path", () => {
  it("parses body_type: multipart with form_data", () => {
    const yaml = `name: Upload\nmethod: POST\nurl: https://example.com\nbody_type: multipart\nform_data:\n  - name: username\n    value: john\n  - name: avatar\n    value: /path/to/photo.png\n    type: file\n`
    const req = lang.parseRequest("upload", yaml)
    expect(req.bodyType).toBe("multipart")
    expect(req.formData).toEqual([
      { name: "username", value: "john", enabled: true, type: "text" },
      {
        name: "avatar",
        value: "/path/to/photo.png",
        enabled: true,
        type: "file",
      },
    ])
  })

  it("parses body_type: urlencoded with form_data", () => {
    const yaml = `name: Search\nmethod: POST\nurl: https://example.com\nbody_type: urlencoded\nform_data:\n  - name: q\n    value: hello world\n`
    const req = lang.parseRequest("search", yaml)
    expect(req.bodyType).toBe("urlencoded")
    expect(req.body).toBeUndefined()
    expect(req.formData).toEqual([
      { name: "q", value: "hello world", enabled: true, type: "text" },
    ])
  })

  it("parses body_type: binary with file_path", () => {
    const yaml = `name: Upload binary\nmethod: POST\nurl: https://example.com\nbody_type: binary\nfile_path: /tmp/data.bin\n`
    const req = lang.parseRequest("bin", yaml)
    expect(req.bodyType).toBe("binary")
    expect(req.filePath).toBe("/tmp/data.bin")
    expect(req.body).toBeUndefined()
  })

  it("parses body_type: json explicitly with body string", () => {
    const yaml = `name: Create\nmethod: POST\nurl: https://example.com\nbody_type: json\nbody: '{"id": 1}'\n`
    const req = lang.parseRequest("create", yaml)
    expect(req.bodyType).toBe("json")
    expect(req.body).toBe('{"id": 1}')
  })

  it("bodyType defaults to undefined when omitted (backward compat)", () => {
    const yaml = `name: Foo\nmethod: GET\nurl: https://example.com\nbody: hello\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.bodyType).toBeUndefined()
    expect(req.body).toBe("hello")
  })

  it("parses disabled form entry", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: multipart\nform_data:\n  - name: debug\n    value: "1"\n    enabled: false\n`
    const req = lang.parseRequest("x", yaml)
    expect(req.formData).toEqual([
      { name: "debug", value: "1", enabled: false, type: "text" },
    ])
  })

  it("throws on invalid body_type", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: graphql\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "body_type" must be one of none|json|multipart|urlencoded|binary',
    )
  })

  it("throws on non-array form_data", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: multipart\nform_data: not-an-array\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "form_data" must be an array',
    )
  })

  it("throws on form_data entry with missing name", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: multipart\nform_data:\n  - value: no-name\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      "lang.parseRequest: form_data[0].name must be a string",
    )
  })

  it("throws on form_data entry with invalid type", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: multipart\nform_data:\n  - name: f\n    value: v\n    type: oops\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: form_data[0].type must be "text" or "file"',
    )
  })

  it("throws on non-string file_path", () => {
    const yaml = `name: X\nmethod: POST\nurl: https://example.com\nbody_type: binary\nfile_path: 123\n`
    expect(() => lang.parseRequest("x", yaml)).toThrow(
      'lang.parseRequest: "file_path" must be a string',
    )
  })
})

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "get-user",
    name: "Get user",
    method: "GET",
    url: "https://api.example.com/users/1",
    headers: {},
    params: [],
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

  it("omits empty path params", () => {
    const out = lang.serializeRequest(makeReq({ pathParams: [] }))
    expect(out).not.toContain("path_params:")
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
      makeReq({ params: [{ name: "verbose", value: "true", enabled: true }] }),
    )
    expect(out).toContain("params:\n  - name: verbose\n    value: 'true'\n")
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
        params: [{ name: "verbose", value: "true", enabled: true }],
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
        params: [
          { name: "verbose", value: "true", enabled: true },
          { name: "debug", value: "1", enabled: false },
        ],
      }),
    )
    expect(out).toContain("- name: verbose\n    value: 'true'\n")
    expect(out).toContain("- name: debug\n    value: '1'\n    enabled: false")
  })

  it("never serializes an enabled flag for path params", () => {
    const out = lang.serializeRequest(
      makeReq({
        pathParams: [{ name: "id", value: "42", enabled: false }],
      }),
    )
    expect(out).toContain("path_params:\n  - name: id\n    value: '42'")
    expect(out).not.toContain(
      "path_params:\n  - name: id\n    value: '42'\n    enabled",
    )
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
      params: [{ name: "draft", value: "true", enabled: true }],
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
      params: [],
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
      params: [],
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
      params: [],
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
      params: [],
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

describe("lang.serializeRequest — body_type, form_data, file_path", () => {
  it("serializes multipart form_data", () => {
    const out = lang.serializeRequest(
      makeReq({
        bodyType: "multipart",
        formData: [
          { name: "username", value: "john", enabled: true, type: "text" },
          {
            name: "avatar",
            value: "/p/photo.png",
            enabled: true,
            type: "file",
          },
        ],
      }),
    )
    expect(out).toContain("body_type: multipart")
    expect(out).toContain("  - name: username")
    expect(out).toContain("    value: john")
    expect(out).toContain("    type: file")
  })

  it("serializes urlencoded form_data", () => {
    const out = lang.serializeRequest(
      makeReq({
        bodyType: "urlencoded",
        formData: [
          { name: "q", value: "hello world", enabled: true, type: "text" },
        ],
      }),
    )
    expect(out).toContain("body_type: urlencoded")
  })

  it("serializes binary file_path", () => {
    const out = lang.serializeRequest(
      makeReq({ bodyType: "binary", filePath: "/tmp/data.bin" }),
    )
    expect(out).toContain("body_type: binary")
    expect(out).toContain("file_path: /tmp/data.bin")
  })

  it("quotes and round-trips home-relative file paths", () => {
    const binary = makeReq({
      bodyType: "binary",
      filePath: "@/Documents/data.bin",
    })
    const multipart = makeReq({
      bodyType: "multipart",
      formData: [
        {
          name: "photo",
          value: "@/Pictures/photo.png",
          enabled: true,
          type: "file",
        },
      ],
    })
    const binaryYaml = lang.serializeRequest(binary)
    const multipartYaml = lang.serializeRequest(multipart)
    expect(binaryYaml).toContain("file_path: '@/Documents/data.bin'")
    expect(multipartYaml).toContain("value: '@/Pictures/photo.png'")
    expect(lang.parseRequest(binary.id, binaryYaml)).toEqual(binary)
    expect(lang.parseRequest(multipart.id, multipartYaml)).toEqual(multipart)
  })

  it("includes body_type when json (explicitly set)", () => {
    const out = lang.serializeRequest(makeReq({ bodyType: "json", body: "hi" }))
    expect(out).toContain("body_type: json")
  })

  it("omits body_type when undefined (backward compat)", () => {
    const out = lang.serializeRequest(makeReq())
    expect(out).not.toContain("body_type:")
  })

  it("omits form_data when empty array", () => {
    const out = lang.serializeRequest(
      makeReq({ bodyType: "urlencoded", formData: [] }),
    )
    expect(out).not.toContain("form_data:")
  })

  it("round-trip: multipart with both text and file entries", () => {
    const original: Request = {
      id: "multi",
      name: "Multi",
      method: "POST",
      url: "https://example.com/upload",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
      bodyType: "multipart",
      formData: [
        { name: "title", value: "hello", enabled: true, type: "text" },
        {
          name: "pic",
          value: "/Users/me/img.png",
          enabled: true,
          type: "file",
        },
      ],
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip: binary", () => {
    const original: Request = {
      id: "bin",
      name: "Binary",
      method: "POST",
      url: "https://example.com/upload",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
      bodyType: "binary",
      filePath: "/tmp/data.bin",
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip: urlencoded with $var in values", () => {
    const original: Request = {
      id: "form",
      name: "Form",
      method: "POST",
      url: "https://example.com/login",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
      bodyType: "urlencoded",
      formData: [
        { name: "user", value: "$USER", enabled: true, type: "text" },
        { name: "pass", value: "$PASS", enabled: true, type: "text" },
      ],
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("round-trip preserves existing json body (no bodyType)", () => {
    const original: Request = {
      id: "json-only",
      name: "JSON body",
      method: "POST",
      url: "https://example.com",
      headers: { "Content-Type": { value: "application/json", enabled: true } },
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
      body: '{"id": 1}',
    }
    const yaml = lang.serializeRequest(original)
    const reparsed = lang.parseRequest(original.id, yaml)
    expect(reparsed).toEqual(original)
  })

  it("serializes long parameter values without invalid YAML indentation and round-trips correctly", () => {
    const longValue =
      "e.g. VCENTER, NSX_T_MANAGER, SDDC_MANAGER, VRSLCM, VROPS, VCF_OPS_CLOUD_PROXY, VRA"
    const original: Request = {
      id: "long-param-req",
      name: "Long param req",
      method: "GET",
      url: "https://example.com/api",
      headers: {},
      params: [{ name: "productType", value: longValue, enabled: true }],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: { type: "none" },
    }

    const yamlStr = lang.serializeRequest(original)
    expect(() => lang.parseRequest(original.id, yamlStr)).not.toThrow()
    const reparsed = lang.parseRequest(original.id, yamlStr)
    expect(reparsed.params[0].value).toBe(longValue)
  })

  it("serializes multiline auth values with proper indentation and round-trips correctly", () => {
    const original: Request = {
      id: "multiline-auth-req",
      name: "Multiline auth req",
      method: "GET",
      url: "https://example.com/api",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: {
        type: "bearer",
        token:
          "eyJhbGciOiJSUzI1NiJ9.\neyJzdWIiOiJ1c2VyMTIzIn0.\nSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      },
    }

    const yamlStr = lang.serializeRequest(original)
    expect(() => lang.parseRequest(original.id, yamlStr)).not.toThrow()
    const reparsed = lang.parseRequest(original.id, yamlStr)
    expect(reparsed.auth).toEqual(original.auth)
  })

  it("serializes multiline basic auth credentials with proper indentation and round-trips correctly", () => {
    const original: Request = {
      id: "multiline-basic-auth-req",
      name: "Multiline basic auth req",
      method: "GET",
      url: "https://example.com/api",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: {
        type: "basic",
        user: "multi\nline\nuser",
        pass: "multi\nline\npass",
      },
    }

    const yamlStr = lang.serializeRequest(original)
    expect(() => lang.parseRequest(original.id, yamlStr)).not.toThrow()
    const reparsed = lang.parseRequest(original.id, yamlStr)
    expect(reparsed.auth).toEqual(original.auth)
  })

  it("serializes multiline api_key auth with proper indentation and round-trips correctly", () => {
    const original: Request = {
      id: "multiline-apikey-auth-req",
      name: "Multiline apikey auth req",
      method: "GET",
      url: "https://example.com/api",
      headers: {},
      params: [],
      timeout: 0,
      followRedirects: true,
      maxRedirects: 5,
      auth: {
        type: "api_key",
        key: "X-API-Key",
        value: "multi\nline\nsecret",
        placement: "header",
      },
    }

    const yamlStr = lang.serializeRequest(original)
    expect(() => lang.parseRequest(original.id, yamlStr)).not.toThrow()
    const reparsed = lang.parseRequest(original.id, yamlStr)
    expect(reparsed.auth).toEqual(original.auth)
  })
})

describe("lang.serializeFolder — multiline values", () => {
  it("serializes multiline folder header values with proper indentation and round-trips correctly", () => {
    const folder: Folder = {
      id: "test-folder",
      name: "Test Folder",
      path: "/test-folder",
      children: [],
      overrides: {
        headers: {
          "X-Custom": { value: "line1\nline2\nline3", enabled: true },
        },
      },
    }

    const yamlStr = lang.serializeFolder(folder)
    expect(() => lang.parseFolder(yamlStr)).not.toThrow()
    const parsed = lang.parseFolder(yamlStr)
    expect(parsed.overrides?.headers?.["X-Custom"]?.value).toBe(
      "line1\nline2\nline3",
    )
  })

  it("serializes multiline folder auth bearer token with proper indentation and round-trips correctly", () => {
    const folder: Folder = {
      id: "test-folder",
      name: "Test Folder",
      path: "/test-folder",
      children: [],
      overrides: {
        auth: {
          type: "bearer",
          token: "line1\nline2\nline3",
        },
      },
    }

    const yamlStr = lang.serializeFolder(folder)
    expect(() => lang.parseFolder(yamlStr)).not.toThrow()
    const parsed = lang.parseFolder(yamlStr)
    expect(parsed.overrides?.auth).toEqual({
      type: "bearer",
      token: "line1\nline2\nline3",
    })
  })
})
