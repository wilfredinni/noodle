import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import type { Environment, Request } from "../src/schema"
import { substitute, executor } from "../src/requests"

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
    timeout: 0,
    followRedirects: true,
    maxRedirects: 5,
    auth: { type: "none" },
    ...over,
  }
}

function makeEnv(vars: Record<string, string> = {}): Environment {
  return { name: "test", vars }
}

describe("substitute — pure $var replacement", () => {
  it("substitutes $x in url", () => {
    const req = makeReq({ url: "https://$host/users" })
    const out = substitute(req, makeEnv({ host: "api.example.com" }))
    expect(out.url).toBe("https://api.example.com/users")
  })

  it("substitutes $x in header values (not keys)", () => {
    const req = makeReq({
      headers: { Authorization: { value: "Bearer $token", enabled: true } },
    })
    const out = substitute(req, makeEnv({ token: "abc123" }))
    expect(out.headers.Authorization).toBe("Bearer abc123")
    expect(Object.keys(out.headers)).toEqual(["Authorization"])
  })

  it("substitutes $x in param values (not keys)", () => {
    const req = makeReq({
      params: { verbose: { value: "$flag", enabled: true } },
    })
    const out = substitute(req, makeEnv({ flag: "true" }))
    expect(out.params.verbose).toBe("true")
    expect(Object.keys(out.params)).toEqual(["verbose"])
  })

  it("substitutes $x in body", () => {
    const req = makeReq({ body: '{"id": "$id"}' })
    const out = substitute(req, makeEnv({ id: "42" }))
    expect(out.body).toBe('{"id": "42"}')
  })

  it("substitutes $x in bearer auth token", () => {
    const req = makeReq({ auth: { type: "bearer", token: "$token" } })
    const out = substitute(req, makeEnv({ token: "secret" }))
    expect(out.auth).toEqual({ type: "bearer", token: "secret" })
  })

  it("substitutes $x in basic auth user and pass", () => {
    const req = makeReq({
      auth: { type: "basic", user: "$u", pass: "$p" },
    })
    const out = substitute(req, makeEnv({ u: "foo", p: "bar" }))
    expect(out.auth).toEqual({ type: "basic", user: "foo", pass: "bar" })
  })

  it("substitutes $x in api_key key and value", () => {
    const req = makeReq({
      auth: {
        type: "api_key",
        key: "$keyName",
        value: "$keyVal",
        placement: "header",
      },
    })
    const out = substitute(
      req,
      makeEnv({ keyName: "X-API-Key", keyVal: "secret123" }),
    )
    expect(out.auth).toEqual({
      type: "api_key",
      key: "X-API-Key",
      value: "secret123",
      placement: "header",
    })
  })

  it("throws on unresolved variable in api_key key", () => {
    const req = makeReq({
      auth: {
        type: "api_key",
        key: "$keyName",
        value: "v",
        placement: "header",
      },
    })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "keyName" in auth.key',
    )
  })

  it("throws on unresolved variable in api_key value", () => {
    const req = makeReq({
      auth: { type: "api_key", key: "k", value: "$val", placement: "header" },
    })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "val" in auth.value',
    )
  })

  it("leaves id, name, method untouched", () => {
    const req = makeReq({ id: "my-id", name: "$name", method: "POST" })
    const out = substitute(req, makeEnv({ name: "should-not-apply" }))
    expect(out.id).toBe("my-id")
    expect(out.name).toBe("$name")
    expect(out.method).toBe("POST")
  })

  it("resolves adjacent $a$b in one field", () => {
    const req = makeReq({ url: "https://$a$b/x" })
    const out = substitute(req, makeEnv({ a: "host", b: ":8080" }))
    expect(out.url).toBe("https://host:8080/x")
  })

  it("empty string env var substitutes to empty string (not an error)", () => {
    const req = makeReq({ url: "https://$x/y" })
    const out = substitute(req, makeEnv({ x: "" }))
    expect(out.url).toBe("https:///y")
  })

  it("throws on unresolved variable in url", () => {
    const req = makeReq({ url: "https://$host/x" })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "host" in url',
    )
  })

  it("throws on unresolved variable in header value (field name included)", () => {
    const req = makeReq({
      headers: { Authorization: { value: "Bearer $token", enabled: true } },
    })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "token" in headers.Authorization',
    )
  })

  it("throws on unresolved variable in auth.token", () => {
    const req = makeReq({ auth: { type: "bearer", token: "$token" } })
    expect(() => substitute(req, makeEnv({}))).toThrow(
      'requests.substitute: unresolved variable "token" in auth.token',
    )
  })

  it("does not mutate the input request", () => {
    const req = makeReq({
      url: "https://$host/x",
      headers: { A: { value: "$v", enabled: true } },
    })
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

  it("$ var (whitespace after $) passes through verbatim", () => {
    const req = makeReq({ url: "https://example.com/$ path" })
    const out = substitute(req, makeEnv({ path: "x" }))
    expect(out.url).toBe("https://example.com/$ path")
  })

  it("skips disabled header entries", () => {
    const req = makeReq({
      headers: {
        Accept: { value: "application/json", enabled: true },
        "X-Debug": { value: "$debug", enabled: false },
      },
    })
    const out = substitute(req, makeEnv({ debug: "should-not-resolve" }))
    expect(Object.keys(out.headers)).toEqual(["Accept"])
    expect(out.headers.Accept).toBe("application/json")
  })

  it("skips disabled param entries", () => {
    const req = makeReq({
      params: {
        verbose: { value: "true", enabled: true },
        debug: { value: "$flag", enabled: false },
      },
    })
    const out = substitute(req, makeEnv({ flag: "should-not-resolve" }))
    expect(Object.keys(out.params)).toEqual(["verbose"])
    expect(out.params.verbose).toBe("true")
  })

  it("disabled entries are skipped before var resolution (no error on unresolved)", () => {
    const req = makeReq({
      headers: {
        "X-Disabled": { value: "$missing", enabled: false },
      },
    })
    const out = substitute(req, makeEnv({}))
    expect(Object.keys(out.headers)).toEqual([])
  })

  it("all entries disabled produces empty headers/params", () => {
    const req = makeReq({
      headers: {
        A: { value: "1", enabled: false },
        B: { value: "2", enabled: false },
      },
      params: {
        x: { value: "3", enabled: false },
      },
    })
    const out = substitute(req, makeEnv({}))
    expect(out.headers).toEqual({})
    expect(out.params).toEqual({})
  })
})

function fakeResponse(opts: {
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
}): globalThis.Response {
  return {
    status: opts.status ?? 200,
    statusText: opts.statusText ?? "OK",
    headers: new Headers(opts.headers ?? {}),
    text: () => Promise.resolve(opts.body ?? ""),
  } as unknown as globalThis.Response
}

describe("send — URL and query params", () => {
  it("merges params into URL as query string", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({ params: { verbose: { value: "true", enabled: true } } }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/?verbose=true")
  })

  it("appends params to existing query string", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        url: "https://example.com/?a=1",
        params: { b: { value: "2", enabled: true } },
      }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/?a=1&b=2")
  })

  it("leaves URL unchanged when params empty", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({}))
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/")
  })

  it("disabled param is not added to URL query string", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        params: {
          verbose: { value: "true", enabled: true },
          debug: { value: "1", enabled: false },
        },
      }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/?verbose=true")
  })
})

describe("send — method, body, headers", () => {
  it("passes method to fetch init", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ method: "POST" }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe("POST")
  })

  it("passes body to fetch init when defined", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ method: "POST", body: '{"a":1}' }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"a":1}')
  })

  it("passes body undefined to fetch init when no body", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({}))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  it("passes user headers to fetch init", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        headers: { Accept: { value: "application/json", enabled: true } },
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Accept")).toBe("application/json")
  })

  it("disabled header is not sent to fetch", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        headers: {
          Accept: { value: "application/json", enabled: true },
          "X-Debug": { value: "true", enabled: false },
        },
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Accept")).toBe("application/json")
    expect(headers.get("X-Debug")).toBeNull()
  })
})

describe("send — response mapping", () => {
  it("maps status, statusText, headers, body, timeMs", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({
        status: 201,
        statusText: "Created",
        headers: { "Content-Type": "application/json" },
        body: '{"ok":1}',
      }),
    )
    const res = await executor.send(makeReq({}))
    expect(res.status).toBe(201)
    expect(res.statusText).toBe("Created")
    expect(res.headers["content-type"]).toBe("application/json")
    expect(res.body).toBe('{"ok":1}')
    expect(typeof res.timeMs).toBe("number")
    expect(res.timeMs).toBeGreaterThanOrEqual(0)
  })

  it("lowercases response header keys", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ headers: { "Content-Type": "text/plain" } }),
    )
    const res = await executor.send(makeReq({}))
    expect(Object.keys(res.headers)).toEqual(["content-type"])
  })

  it("returns Response for 4xx (does not throw)", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 404, body: "not found" }),
    )
    const res = await executor.send(makeReq({}))
    expect(res.status).toBe(404)
    expect(res.body).toBe("not found")
  })

  it("returns Response for 5xx (does not throw)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 500, body: "boom" }))
    const res = await executor.send(makeReq({}))
    expect(res.status).toBe(500)
  })
})

describe("send — env handling", () => {
  it("passes $var literals through to fetch when no env provided", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ body: '{"id": "$id"}' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"id": "$id"}')
  })

  it("substitutes $var from env before fetch", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({ url: "https://$host/x" }),
      makeEnv({ host: "api.example.com" }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/x")
  })
})

describe("send — auth header", () => {
  it("adds no Authorization header for none auth", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ auth: { type: "none" } }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Authorization")).toBeNull()
  })

  it("adds no Authorization header when auth undefined", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    const req = makeReq()
    delete (req as { auth?: Request["auth"] }).auth
    await executor.send(req)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Authorization")).toBeNull()
  })

  it("adds Authorization: Bearer <token> for bearer auth", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ auth: { type: "bearer", token: "abc123" } }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Authorization")).toBe("Bearer abc123")
  })

  it("adds Authorization: Basic <base64(user:pass)> for basic auth", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({ auth: { type: "basic", user: "foo", pass: "bar" } }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    const auth = headers.get("Authorization") ?? ""
    expect(auth.startsWith("Basic ")).toBe(true)
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8")
    expect(decoded).toBe("foo:bar")
  })

  it("auth header overwrites user-set Authorization on collision", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        headers: { Authorization: { value: "Token user-set", enabled: true } },
        auth: { type: "bearer", token: "from-auth" },
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("Authorization")).toBe("Bearer from-auth")
  })

  it("adds api_key header when placement is header", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        auth: {
          type: "api_key",
          key: "X-API-Key",
          value: "secret123",
          placement: "header",
        },
      }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("X-API-Key")).toBe("secret123")
    expect(headers.get("Authorization")).toBeNull()
  })

  it("injects api_key as query param when placement is query", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        auth: {
          type: "api_key",
          key: "api_key",
          value: "secret123",
          placement: "query",
        },
      }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.com/?api_key=secret123",
    )
  })

  it("api_key query param appends to existing query params", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({
        params: { verbose: { value: "true", enabled: true } },
        auth: { type: "api_key", key: "key", value: "val", placement: "query" },
      }),
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.com/?verbose=true&key=val",
    )
  })
})

describe("send — error handling", () => {
  it("wraps malformed URL with prefixed error", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await expect(executor.send(makeReq({ url: "not-a-url" }))).rejects.toThrow(
      /^requests\.send: invalid url "not-a-url":/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("wraps fetch transport failure with prefixed error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("connect ECONNREFUSED"))
    await expect(executor.send(makeReq({}))).rejects.toThrow(
      "requests.send: fetch failed: connect ECONNREFUSED",
    )
  })

  it("attaches cause on fetch transport failure", async () => {
    const original = new TypeError("connect ECONNREFUSED")
    fetchMock.mockRejectedValueOnce(original)
    let caught: unknown
    try {
      await executor.send(makeReq({}))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe(
      "requests.send: fetch failed: connect ECONNREFUSED",
    )
    expect((caught as Error).cause).toBe(original)
  })

  it("wraps response body read failure with prefixed error", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: () => Promise.reject(new Error("stream aborted")),
    } as unknown as globalThis.Response)
    await expect(executor.send(makeReq({}))).rejects.toThrow(
      /^requests\.send: failed to read response body:/,
    )
  })

  it("attaches cause on body read failure", async () => {
    const original = new Error("stream aborted")
    fetchMock.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: () => Promise.reject(original),
    } as unknown as globalThis.Response)
    let caught: unknown
    try {
      await executor.send(makeReq({}))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe(
      "requests.send: failed to read response body: stream aborted",
    )
    expect((caught as Error).cause).toBe(original)
  })

  it("propagates substitute errors with prefix intact (no wrapping)", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await expect(
      executor.send(makeReq({ url: "https://$host/x" }), makeEnv({})),
    ).rejects.toThrow('requests.substitute: unresolved variable "host" in url')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("attaches cause on malformed URL", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    let caught: unknown
    try {
      await executor.send(makeReq({ url: "not-a-url" }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    // Bun's new URL("not-a-url") throws TypeError with a message like "Invalid URL"
    // The exact message varies across Bun versions, so check the prefix + cause
    expect(
      (caught as Error).message.startsWith(
        'requests.send: invalid url "not-a-url"',
      ),
    ).toBe(true)
    expect((caught as Error).cause).toBeInstanceOf(TypeError)
  })
})

describe("send — abort signal", () => {
  it("passes signal to fetch", async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({}), undefined, controller.signal)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it("throws AbortError when signal is aborted before fetch completes", async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
    let caught: unknown
    try {
      await executor.send(makeReq({}), undefined, controller.signal)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/fetch failed/)
  })
})

describe("send — timeout signal", () => {
  it("creates timeout AbortSignal when timeout > 0, no caller signal", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ timeout: 5000 }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal!.aborted).toBe(false)
  })

  it("combines signals when timeout > 0 and caller signal present", async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(
      makeReq({ timeout: 5000 }),
      undefined,
      controller.signal,
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal).not.toBe(controller.signal)
    expect(init.signal!.aborted).toBe(false)
  })

  it("passes caller signal directly when timeout === 0", async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ timeout: 0 }), undefined, controller.signal)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it("no signal when timeout === 0 and no caller signal", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({}))
    await executor.send(makeReq({ timeout: 0 }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeUndefined()
  })
})

describe("send — redirect following", () => {
  it("follows 301 redirect to Location", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({ status: 301, headers: { location: "/new-path" } }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200, body: "done" }))
    const res = await executor.send(makeReq({}))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
    expect(res.body).toBe("done")
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.com/new-path")
  })

  it("follows 302, 303, 307, 308", async () => {
    for (const code of [302, 303, 307, 308]) {
      fetchMock.mockReset()
      fetchMock
        .mockResolvedValueOnce(
          fakeResponse({ status: code, headers: { location: "/target" } }),
        )
        .mockResolvedValueOnce(fakeResponse({ status: 200 }))
      const res = await executor.send(makeReq({}))
      expect(res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1][0]).toBe("https://example.com/target")
    }
  })

  it("does not follow when followRedirects is false", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 301, headers: { location: "/elsewhere" } }),
    )
    const res = await executor.send(makeReq({ followRedirects: false }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(301)
  })

  it("throws when max redirects exceeded", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ status: 301, headers: { location: "/hop" } }),
    )
    await expect(executor.send(makeReq({ maxRedirects: 2 }))).rejects.toThrow(
      "requests.send: max redirects (2) exceeded",
    )
    expect(fetchMock).toHaveBeenCalledTimes(3) // initial + 2 redirects, 3rd triggers throw
  })

  it("returns 301 response when no Location header", async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 301 }))
    const res = await executor.send(makeReq({}))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(301)
  })

  it("does not follow non-redirect status (200, 400, 500)", async () => {
    for (const code of [200, 400, 404, 500]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(
        fakeResponse({ status: code, headers: { location: "/ignored" } }),
      )
      const res = await executor.send(makeReq({}))
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(res.status).toBe(code)
    }
  })

  it("resolves relative Location header against current URL", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 302,
          headers: { location: "../bar/baz" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({ url: "https://example.com/foo/" }))
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.com/bar/baz")
  })

  it("switches POST to GET on 302 with content-type and content-length stripped", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 302,
          headers: { location: "/new" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(
      makeReq({
        method: "POST",
        body: '{"x":1}',
        headers: {
          "content-type": { value: "application/json", enabled: true },
          "content-length": { value: "100", enabled: true },
        },
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.method).toBe("GET")
    expect(init.body).toBeUndefined()
    const headers = init.headers as Headers
    expect(headers.get("content-type")).toBeNull()
    expect(headers.get("content-length")).toBeNull()
  })

  it("switches POST to GET on 303", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 303,
          headers: { location: "/new" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({ method: "POST", body: '{"x":1}' }))
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.method).toBe("GET")
    expect(init.body).toBeUndefined()
  })

  it("preserves method and body on 307", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 307,
          headers: { location: "/new" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({ method: "POST", body: '{"x":1}' }))
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"x":1}')
  })

  it("preserves method and body on 308", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 308,
          headers: { location: "/new" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({ method: "POST", body: '{"x":1}' }))
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"x":1}')
  })

  it("does not change method for non-POST on 301/302", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse({
          status: 301,
          headers: { location: "/new" },
        }),
      )
      .mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({ method: "PUT", body: "data" }))
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.method).toBe("PUT")
    expect(init.body).toBe("data")
  })

  it("uses redirect: manual in fetch init", async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse({ status: 302, headers: { location: "/there" } }),
    )
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 200 }))
    await executor.send(makeReq({}))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.redirect).toBe("manual")
  })
})
