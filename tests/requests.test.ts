import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import type { Environment, Request } from "../src/schema"
import { substitute } from "../src/requests/substitute"

let fetchMock: ReturnType<typeof mock>
let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
  fetchMock = mock()
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeReq(over: Partial<Request> = {}): Request {
  return {
    id: "x",
    name: "X",
    method: "GET",
    url: "https://example.com",
    headers: {},
    params: {},
    auth: { type: "none" },
    ...over,
  }
}

function makeEnv(vars: Record<string, string> = {}): Environment {
  return { name: "test", vars }
}

describe("substitute — pure {{var}} replacement", () => {
  it("substitutes {{x}} in url", () => {
    const req = makeReq({ url: "https://{{host}}/users" })
    const out = substitute(req, makeEnv({ host: "api.example.com" }))
    expect(out.url).toBe("https://api.example.com/users")
  })

  it("substitutes {{x}} in header values (not keys)", () => {
    const req = makeReq({ headers: { Authorization: "Bearer {{token}}" } })
    const out = substitute(req, makeEnv({ token: "abc123" }))
    expect(out.headers.Authorization).toBe("Bearer abc123")
    // key unchanged
    expect(Object.keys(out.headers)).toEqual(["Authorization"])
  })

  it("substitutes {{x}} in param values (not keys)", () => {
    const req = makeReq({ params: { verbose: "{{flag}}" } })
    const out = substitute(req, makeEnv({ flag: "true" }))
    expect(out.params.verbose).toBe("true")
    expect(Object.keys(out.params)).toEqual(["verbose"])
  })

  it("substitutes {{x}} in body", () => {
    const req = makeReq({ body: '{"id": "{{id}}"}' })
    const out = substitute(req, makeEnv({ id: "42" }))
    expect(out.body).toBe('{"id": "42"}')
  })

  it("substitutes {{x}} in bearer auth token", () => {
    const req = makeReq({ auth: { type: "bearer", token: "{{token}}" } })
    const out = substitute(req, makeEnv({ token: "secret" }))
    expect(out.auth).toEqual({ type: "bearer", token: "secret" })
  })

  it("substitutes {{x}} in basic auth user and pass", () => {
    const req = makeReq({
      auth: { type: "basic", user: "{{u}}", pass: "{{p}}" },
    })
    const out = substitute(req, makeEnv({ u: "foo", p: "bar" }))
    expect(out.auth).toEqual({ type: "basic", user: "foo", pass: "bar" })
  })

  it("leaves id, name, method untouched", () => {
    const req = makeReq({ id: "my-id", name: "{{name}}", method: "POST" })
    const out = substitute(req, makeEnv({ name: "should-not-apply" }))
    expect(out.id).toBe("my-id")
    expect(out.name).toBe("{{name}}")
    expect(out.method).toBe("POST")
  })

  it("resolves adjacent {{x}}{{y}} in one field", () => {
    const req = makeReq({ url: "https://{{a}}{{b}}/x" })
    const out = substitute(req, makeEnv({ a: "host", b: ":8080" }))
    expect(out.url).toBe("https://host:8080/x")
  })

  it("empty string env var substitutes to empty string (not an error)", () => {
    const req = makeReq({ url: "https://{{x}}/y" })
    const out = substitute(req, makeEnv({ x: "" }))
    expect(out.url).toBe("https:///y")
  })

  it("throws on unresolved variable in url", () => {
    const req = makeReq({ url: "https://{{host}}/x" })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "host" in url',
    )
  })

  it("throws on unresolved variable in header value (field name included)", () => {
    const req = makeReq({ headers: { Authorization: "Bearer {{token}}" } })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "token" in headers.Authorization',
    )
  })

  it("throws on unresolved variable in auth.token", () => {
    const req = makeReq({ auth: { type: "bearer", token: "{{token}}" } })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "token" in auth.token',
    )
  })

  it("does not mutate the input request", () => {
    const req = makeReq({ url: "https://{{host}}/x", headers: { A: "{{v}}" } })
    const original = JSON.parse(JSON.stringify(req))
    substitute(req, makeEnv({ host: "h", v: "1" }))
    expect(req).toEqual(original)
  })

  it("preserves undefined auth (treats as none, no throw)", () => {
    const req = makeReq()
    delete (req as { auth?: Request["auth"] }).auth
    const out = substitute(req, makeEnv({}))
    expect(out.auth).toBeUndefined()
  })

  it("preserves undefined body (no substitution attempted)", () => {
    const req = makeReq()
    const out = substitute(req, makeEnv({}))
    expect(out.body).toBeUndefined()
  })

  it("{{ var }} (whitespace inside braces) passes through verbatim", () => {
    const req = makeReq({ url: "https://example.com/{{ path }}" })
    const out = substitute(req, makeEnv({ path: "x" }))
    expect(out.url).toBe("https://example.com/{{ path }}")
  })
})
