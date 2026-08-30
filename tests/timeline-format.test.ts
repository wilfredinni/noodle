import { describe, it, expect } from "bun:test"
import {
  truncateUrl,
  relativeTime,
  entryMethod,
  entryStatus,
  entryAssertionStatus,
  entryTiming,
  entrySize,
  entryIsError,
  shortMethod,
  formatRequestUrl,
  formatRequestDisplayName,
  maskedAuthHeader,
  buildDetailRequestHeaders,
} from "../src/ui/timeline/formatTimeline"
import { buildTimelineEntry } from "../src/timelineEntry"
import type { Auth, Request, TimelineEntry } from "../src/schema"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../src/auth/defaults"

describe("truncateUrl", () => {
  it("returns full URL when shorter than max", () => {
    expect(truncateUrl("https://example.com", 60)).toBe("https://example.com")
  })

  it("returns full URL when exactly max", () => {
    const url = "a".repeat(60)
    expect(truncateUrl(url, 60)).toBe(url)
  })

  it("truncates with ... when longer than max", () => {
    const url = "https://jsonplaceholder.typicode.com/posts/1/comments"
    const result = truncateUrl(url, 30)
    expect(result.endsWith("...")).toBe(true)
    expect(result.length).toBe(30)
  })

  it("uses default max of 60", () => {
    const short = "https://short.url"
    const long = "https://" + "a".repeat(60) + ".com"
    expect(truncateUrl(short)).toBe(short)
    expect(truncateUrl(long).endsWith("...")).toBe(true)
    expect(truncateUrl(long).length).toBe(60)
  })

  it("preserves URL scheme and beginning", () => {
    const url = "https://jsonplaceholder.typicode.com/posts/1"
    const result = truncateUrl(url, 30)
    expect(result).toBe("https://jsonplaceholder.typ...")
  })

  it("handles small max gracefully", () => {
    expect(truncateUrl("hello", 3)).toBe("...")
    expect(truncateUrl("hello", 4)).toBe("h...")
    expect(truncateUrl("hello", 5)).toBe("hello")
    expect(truncateUrl("hello", 6)).toBe("hello")
    expect(truncateUrl("hello", 10)).toBe("hello")
  })

  it("returns full URL when max equals 3 and URL is short", () => {
    expect(truncateUrl("ab", 3)).toBe("ab")
    expect(truncateUrl("abc", 3)).toBe("abc")
  })

  it("returns full URL when URL is empty", () => {
    expect(truncateUrl("", 10)).toBe("")
  })
})

describe("NTLM timeline security", () => {
  it("masks the challenge header", () => {
    expect(
      maskedAuthHeader({
        type: "ntlm",
        username: "alice",
        password: "secret",
        domain: "EXAMPLE",
        workstation: "NOODLE",
      }),
    ).toEqual({ key: "Authorization", value: "NTLM ••••••••" })
  })

  it("redacts the password while retaining public identity fields", () => {
    const entry = buildTimelineEntry(
      {
        id: "ntlm",
        name: "NTLM",
        method: "GET",
        url: "https://example.com",
        timeout: 0,
        headers: {},
        params: [],
        auth: {
          type: "ntlm",
          username: "$USER",
          password: "$PASSWORD",
          domain: "$DOMAIN",
          workstation: "NOODLE",
        },
      },
      {
        status: "done",
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "",
          timeMs: 1,
        },
      },
      "dev",
      {
        name: "dev",
        vars: { USER: "alice", PASSWORD: "secret", DOMAIN: "EXAMPLE" },
        secretVars: { PASSWORD: "keychain" },
      },
    )
    expect(entry.request.auth).toEqual({
      type: "ntlm",
      username: "alice",
      password: "[REDACTED]",
      domain: "EXAMPLE",
      workstation: "NOODLE",
    })
  })
})

describe("relativeTime", () => {
  it('returns "now" for very recent timestamps', () => {
    expect(relativeTime(Date.now())).toBe("now")
    expect(relativeTime(Date.now() - 4000)).toBe("now")
  })

  it("returns seconds for under a minute", () => {
    expect(relativeTime(Date.now() - 5000)).toBe("5s")
    expect(relativeTime(Date.now() - 30000)).toBe("30s")
  })

  it("returns minutes for under an hour", () => {
    expect(relativeTime(Date.now() - 90000)).toBe("1m")
    expect(relativeTime(Date.now() - 1800000)).toBe("30m")
  })

  it("returns hours for under a day", () => {
    expect(relativeTime(Date.now() - 3600000)).toBe("1h")
    expect(relativeTime(Date.now() - 72000000)).toBe("20h")
  })

  it("returns days for longer periods", () => {
    expect(relativeTime(Date.now() - 90000000)).toBe("1d")
    expect(relativeTime(Date.now() - 259200000)).toBe("3d")
  })
})

function makeEntry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    timestamp: Date.now(),
    request: {
      id: "test-1",
      name: "test",
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: [],
    },
    ...over,
  }
}

describe("entryMethod", () => {
  it("returns method from entry", () => {
    expect(entryMethod(makeEntry())).toBe("GET")
    expect(
      entryMethod(
        makeEntry({ request: { ...makeEntry().request, method: "POST" } }),
      ),
    ).toBe("POST")
  })
})

describe("entryStatus", () => {
  it("returns null when no response and no error", () => {
    expect(entryStatus(makeEntry())).toBeNull()
  })

  it("returns status code from response", () => {
    expect(
      entryStatus(
        makeEntry({
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "",
            timeMs: 10,
            size: 0,
          },
        }),
      ),
    ).toBe(200)
    expect(
      entryStatus(
        makeEntry({
          response: {
            status: 404,
            statusText: "Not Found",
            headers: {},
            body: "",
            timeMs: 10,
            size: 0,
          },
        }),
      ),
    ).toBe(404)
  })

  it("returns 0 for error entries", () => {
    expect(entryStatus(makeEntry({ error: { message: "timeout" } }))).toBe(0)
  })
})

describe("entryTiming", () => {
  it("returns ms from response", () => {
    expect(
      entryTiming(
        makeEntry({
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "",
            timeMs: 150,
            size: 0,
          },
        }),
      ),
    ).toBe("150ms")
  })

  it("returns ERR for error entries", () => {
    expect(entryTiming(makeEntry({ error: { message: "timeout" } }))).toBe(
      "ERR",
    )
  })

  it('returns "-" when no response', () => {
    expect(entryTiming(makeEntry())).toBe("-")
  })
})

describe("entryIsError", () => {
  it("returns true when error exists", () => {
    expect(entryIsError(makeEntry({ error: { message: "fail" } }))).toBe(true)
  })

  it("returns false when no error", () => {
    expect(entryIsError(makeEntry())).toBe(false)
    expect(
      entryIsError(
        makeEntry({
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "",
            timeMs: 10,
            size: 0,
          },
        }),
      ),
    ).toBe(false)
  })
})

describe("entrySize", () => {
  it("returns size from response", () => {
    expect(
      entrySize(
        makeEntry({
          response: {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "",
            timeMs: 10,
            size: 42,
          },
        }),
      ),
    ).toBe(42)
  })

  it("returns null when no response", () => {
    expect(entrySize(makeEntry())).toBeNull()
  })

  it("returns null for error entries", () => {
    expect(entrySize(makeEntry({ error: { message: "fail" } }))).toBeNull()
  })
})

describe("shortMethod", () => {
  it("shortens DELETE and preserves other methods", () => {
    expect(shortMethod("DELETE")).toBe("DEL")
    expect(shortMethod("GET")).toBe("GET")
    expect(shortMethod("PATCH")).toBe("PATCH")
    expect(shortMethod("POST")).toBe("POST")
  })
})

describe("formatRequestUrl", () => {
  it("returns URL when no params are enabled", () => {
    expect(
      formatRequestUrl({
        ...makeEntry(),
        request: {
          ...makeEntry().request,
          params: [{ name: "skip", value: "x", enabled: false }],
        },
      }),
    ).toBe("https://example.com")
  })

  it("appends enabled params and encodes values", () => {
    expect(
      formatRequestUrl({
        ...makeEntry(),
        request: {
          ...makeEntry().request,
          params: [
            { name: "q", value: "hello world", enabled: true },
            { name: "skip", value: "x", enabled: false },
            { name: "tag", value: "a&b", enabled: true },
          ],
        },
      }),
    ).toBe("https://example.com?q=hello%20world&tag=a%26b")
  })

  it("uses ampersand when URL already has a query", () => {
    expect(
      formatRequestUrl({
        ...makeEntry(),
        request: {
          ...makeEntry().request,
          url: "https://example.com?existing=1",
          params: [{ name: "next", value: "2", enabled: true }],
        },
      }),
    ).toBe("https://example.com?existing=1&next=2")
  })
})

describe("formatRequestDisplayName", () => {
  it("combines folder path from id with request name when present", () => {
    expect(
      formatRequestDisplayName(
        makeEntry({
          request: {
            id: "leads/get-leads",
            name: "Get Leads",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
          },
        }),
      ),
    ).toBe("leads/Get Leads")
  })

  it("handles multi-level folder path", () => {
    expect(
      formatRequestDisplayName(
        makeEntry({
          request: {
            id: "api/v1/leads/get-leads",
            name: "Get Leads",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
          },
        }),
      ),
    ).toBe("api/v1/leads/Get Leads")
  })

  it("returns request name alone when no folder in id", () => {
    expect(
      formatRequestDisplayName(
        makeEntry({
          request: {
            id: "get-leads",
            name: "Get Leads",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
          },
        }),
      ),
    ).toBe("Get Leads")
  })

  it("falls back to file slug if request name is empty", () => {
    expect(
      formatRequestDisplayName(
        makeEntry({
          request: {
            id: "leads/get-leads",
            name: "",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
          },
        }),
      ),
    ).toBe("leads/get-leads")
  })
})

describe("maskedAuthHeader", () => {
  it("returns masked header for supported auth types, null for none/inherit", () => {
    expect(maskedAuthHeader(undefined)).toBeNull()
    expect(maskedAuthHeader({ type: "none" })).toBeNull()
    expect(maskedAuthHeader({ type: "inherit" })).toBeNull()
    expect(maskedAuthHeader({ type: "bearer", token: "secret" })).toEqual({
      key: "Authorization",
      value: "Bearer ••••••••",
    })
    expect(
      maskedAuthHeader({ type: "basic", user: "alice", pass: "secret" }),
    ).toEqual({
      key: "Authorization",
      value: "Basic ••••••••",
    })
    expect(
      maskedAuthHeader({
        type: "api_key",
        key: "X-API-Key",
        value: "secret",
        placement: "header",
      }),
    ).toEqual({ key: "X-API-Key", value: "••••••••" })
    expect(
      maskedAuthHeader({
        type: "api_key",
        key: "api_key",
        value: "secret",
        placement: "query",
      }),
    ).toBeNull()
    expect(
      maskedAuthHeader({
        type: "aws_sigv4",
        access_key: "AKID",
        secret_key: "secret",
        region: "us-east-1",
        service: "execute-api",
      }),
    ).toEqual({
      key: "Authorization",
      value: "AWS4-HMAC-SHA256 ••••••••",
    })
  })
})

describe("buildDetailRequestHeaders", () => {
  it("includes masked auth header and filters matching raw header (bearer)", () => {
    const headers = buildDetailRequestHeaders(
      { type: "bearer", token: "secret12345" },
      {
        Authorization: { value: "Bearer secret12345", enabled: true },
        "Content-Type": { value: "application/json", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Authorization", value: "Bearer ••••••••" },
      { key: "Content-Type", value: "application/json" },
    ])
  })

  it("includes masked auth header and filters matching raw header (basic)", () => {
    const headers = buildDetailRequestHeaders(
      { type: "basic", user: "alice", pass: "s3cret" },
      {
        Authorization: { value: "Basic YWxpY2U6czNjcmV0", enabled: true },
        "Content-Type": { value: "application/json", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Authorization", value: "Basic ••••••••" },
      { key: "Content-Type", value: "application/json" },
    ])
  })

  it("includes masked api_key header and filters the matching raw key", () => {
    const headers = buildDetailRequestHeaders(
      {
        type: "api_key",
        key: "X-API-Key",
        value: "my-secret",
        placement: "header",
      },
      {
        "X-API-Key": { value: "my-secret", enabled: true },
        Accept: { value: "application/json", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Accept", value: "application/json" },
      { key: "X-API-Key", value: "••••••••" },
    ])
  })

  it("case-insensitive filter when raw header key differs in case", () => {
    const headers = buildDetailRequestHeaders(
      { type: "bearer", token: "tok" },
      {
        authorization: { value: "Bearer tok", enabled: true },
        "Content-Type": { value: "text/plain", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Authorization", value: "Bearer ••••••••" },
      { key: "Content-Type", value: "text/plain" },
    ])
  })

  it("does not filter api_key when placement is query", () => {
    const headers = buildDetailRequestHeaders(
      { type: "api_key", key: "api_key", value: "secret", placement: "query" },
      {
        api_key: { value: "secret", enabled: true },
      },
    )
    expect(headers).toEqual([{ key: "api_key", value: "secret" }])
  })

  it("returns empty array when no headers or auth", () => {
    const headers = buildDetailRequestHeaders(undefined, {})
    expect(headers).toEqual([])
  })

  it("returns only raw headers when auth is none", () => {
    const headers = buildDetailRequestHeaders(
      { type: "none" },
      {
        Authorization: { value: "Bearer explicit", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Authorization", value: "Bearer explicit" },
    ])
  })

  it("skips disabled headers", () => {
    const headers = buildDetailRequestHeaders(
      { type: "bearer", token: "tok" },
      {
        Authorization: { value: "Bearer tok", enabled: false },
        "Content-Type": { value: "application/json", enabled: true },
      },
    )
    expect(headers).toEqual([
      { key: "Authorization", value: "Bearer ••••••••" },
      { key: "Content-Type", value: "application/json" },
    ])
  })
})

describe("buildTimelineEntry", () => {
  it("redacts OAuth 1 and OAuth 2 credentials and additional parameter values", () => {
    const response = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: "",
      timeMs: 1,
    }
    const base = {
      id: "oauth",
      name: "OAuth",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      timeout: 0,
    }
    const oauth1 = buildTimelineEntry(
      {
        ...base,
        auth: {
          ...defaultOAuth1Auth(),
          consumer_key: "public-consumer",
          consumer_secret: "consumer-secret",
          access_token: "access-token",
          access_token_secret: "token-secret",
          private_key: "private-key",
          verifier: "secret-verifier-value",
          nonce: "secret-nonce-value",
          timestamp: "secret-timestamp-value",
        },
      },
      { status: "done", response },
    )
    const oauth2 = buildTimelineEntry(
      {
        ...base,
        auth: {
          ...defaultOAuth2Auth(),
          client_id: "public-client",
          token_prefix: "$TOKEN_PREFIX",
          client_secret: "client-secret",
          username: "username",
          password: "password-secret",
          client_assertion_key: "assertion-key",
          additional_parameters: {
            authorization: [
              {
                name: "prompt",
                value: "authorization-secret",
                enabled: true,
                placement: "query",
              },
            ],
            token: [],
            refresh: [],
          },
        },
      },
      { status: "done", response },
      "dev",
      { name: "dev", vars: { TOKEN_PREFIX: "Token" } },
    )
    expect(JSON.stringify(oauth1.request)).not.toMatch(
      /consumer-secret|access-token|token-secret|private-key|secret-verifier-value|secret-nonce-value|secret-timestamp-value/,
    )
    expect(JSON.stringify(oauth1.request)).toContain("public-consumer")
    expect(JSON.stringify(oauth2.request)).not.toMatch(
      /client-secret|password-secret|assertion-key|authorization-secret/,
    )
    expect(JSON.stringify(oauth2.request)).toContain("public-client")
    expect(JSON.stringify(oauth2.request)).toContain("Token")
    expect(JSON.stringify(oauth2.request)).not.toContain("$TOKEN_PREFIX")
  })

  it("builds entry from request and done result", () => {
    const req = {
      id: "req-1",
      name: "Test",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: { "content-type": { value: "application/xml", enabled: true } },
      params: [],
      body: "<key>val</key>",
      bodyType: "xml" as const,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 201,
        statusText: "Created",
        headers: {},
        body: "",
        timeMs: 42,
      },
      request: req,
      envName: "dev",
    }
    const entry = buildTimelineEntry(req, result, "dev")
    expect(entry.request.method).toBe("POST")
    expect(entry.request.url).toBe("https://api.example.com")
    expect(entry.request.bodyType).toBe("xml")
    expect(entry.response?.status).toBe(201)
    expect(entry.response?.timeMs).toBe(42)
    expect(entry.response?.size).toBe(0)
    expect(entry.envName).toBe("dev")
  })

  it("does not persist capture declarations in timeline request snapshots", () => {
    const req: Request = {
      id: "capture",
      name: "Capture",
      method: "GET",
      url: "https://api.example.com",
      headers: {},
      params: [],
      timeout: 0,
      captures: { token: { value: "body.token", enabled: true } },
    }
    const response = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: '{"token":"server-value"}',
      timeMs: 1,
    }

    const entry = buildTimelineEntry(req, { status: "done", response })

    expect(entry.request).not.toHaveProperty("captures")
    expect(JSON.stringify(entry)).not.toContain("body.token")
  })

  it("does not create assertion outcomes for disabled-only declarations", () => {
    const req: Request = {
      id: "disabled-assertion",
      name: "Disabled assertion",
      method: "GET",
      url: "https://api.example.com",
      headers: {},
      params: [],
      timeout: 0,
      assertions: [
        {
          expression: "status",
          operator: "equals",
          value: 500,
          enabled: false,
        },
      ],
    }
    const response = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    }

    const entry = buildTimelineEntry(req, {
      status: "done",
      response,
      execution: {},
    })
    expect(entry.assertions).toBeUndefined()
    expect(entryAssertionStatus(entry)).toBeNull()
  })

  it("persists redacted assertion results without capture runtime data", () => {
    const secret = "timeline-assertion-secret"
    const req = {
      id: "assertion",
      name: "Assertion",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      timeout: 0,
      captures: { token: { value: "body.token", enabled: true } },
      assertions: [
        {
          expression: "body.token",
          operator: "equals" as const,
          value: secret,
        },
      ],
    }
    const response = {
      status: 200,
      statusText: "OK",
      headers: {},
      body: "{}",
      timeMs: 1,
    }
    const entry = buildTimelineEntry(
      req,
      {
        status: "done",
        response,
        execution: {
          assertions: {
            evaluated: true,
            results: [
              {
                expression: "body.token",
                operator: "equals",
                expected: secret,
                actual: secret,
                passed: false,
                message: `Expected ${secret}`,
              },
            ],
          },
          captures: {
            evaluated: true,
            results: [
              {
                variable: "token",
                expression: "body.token",
                success: true,
                type: "string",
                value: secret,
              },
            ],
          },
        },
      },
      "dev",
      {
        name: "dev",
        vars: { TOKEN: secret },
        secretVars: { TOKEN: "keychain" },
      },
    )
    expect(entry.assertions?.results[0]?.expected).toBe("[REDACTED]")
    expect(entry.assertions?.results[0]?.actual).toBe("[REDACTED]")
    expect(entry.assertions?.results[0]?.message).toBe("Expected [REDACTED]")
    expect(entryAssertionStatus(entry)).toBe("failed")
    expect(JSON.stringify(entry)).not.toContain("captures")
    expect(JSON.stringify(entry)).not.toContain("timeline-assertion-secret")
  })

  it("supports assertion not-evaluated state and old entries", () => {
    const oldEntry: TimelineEntry = {
      timestamp: 1,
      request: {
        id: "old",
        name: "Old",
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
      },
    }
    expect(entryAssertionStatus(oldEntry)).toBeNull()
    expect(
      entryAssertionStatus({
        ...oldEntry,
        assertions: { evaluated: false, results: [] },
      }),
    ).toBe("not-evaluated")
  })

  it("redacts request credentials without altering the server response", () => {
    const secret = "timeline-secret"
    const req = {
      id: "req-secret",
      name: "Secret",
      method: "POST" as const,
      url: "https://api.example.com/$TOKEN",
      headers: {
        Authorization: { value: "Bearer $TOKEN", enabled: true },
      },
      params: [],
      body: '{"token":"$TOKEN"}',
      timeout: 0,
    }
    const response = {
      status: 200,
      statusText: secret,
      headers: { "set-cookie": secret, "x-echo": secret },
      body: `echo:${secret}`,
      timeMs: 1,
    }
    const entry = buildTimelineEntry(req, { status: "done", response }, "dev", {
      name: "dev",
      vars: { TOKEN: secret },
      secretVars: { TOKEN: "keychain" },
    })
    expect(entry.request.url).toBe("https://api.example.com/$TOKEN")
    expect(entry.request.headers.Authorization!.value).toBe("[REDACTED]")
    expect(entry.response?.statusText).toBe(secret)
    expect(entry.response?.headers["set-cookie"]).toBe(secret)
    expect(entry.response?.headers["x-echo"]).toBe(secret)
    expect(entry.response?.body).toBe(`echo:${secret}`)
    expect(response.body).toBe(`echo:${secret}`)
  })

  it("redacts literal and secret-variable AWS credentials", () => {
    const req = {
      id: "req-aws",
      name: "AWS",
      method: "GET" as const,
      url: "https://service.us-east-1.amazonaws.com",
      headers: {},
      params: [],
      auth: {
        type: "aws_sigv4" as const,
        access_key: "literal-access",
        secret_key: "$AWS_SECRET_ACCESS_KEY",
        region: "us-east-1",
        service: "execute-api",
        session_token: "literal-session",
      },
      timeout: 0,
    }
    const entry = buildTimelineEntry(
      req,
      {
        status: "done",
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "",
          timeMs: 1,
        },
      },
      "dev",
      {
        name: "dev",
        vars: { AWS_SECRET_ACCESS_KEY: "resolved-secret" },
        secretVars: { AWS_SECRET_ACCESS_KEY: "keychain" },
      },
    )

    expect(entry.request.auth).toEqual({
      type: "aws_sigv4",
      access_key: "[REDACTED]",
      secret_key: "[REDACTED]",
      region: "us-east-1",
      service: "execute-api",
      session_token: "[REDACTED]",
    })
    expect(JSON.stringify(entry.request)).not.toContain("literal-access")
    expect(JSON.stringify(entry.request)).not.toContain("literal-session")
    expect(JSON.stringify(entry.request)).not.toContain("resolved-secret")
  })

  it("redacts auth secrets supplied through public variables", () => {
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      },
    }
    const environment = {
      name: "dev",
      vars: {
        USER: "alice",
        KEY: "X-API-Key",
        TOKEN: "public-token",
        PASSWORD: "public-password",
        API_VALUE: "public-api-value",
        ACCESS: "public-access",
        SECRET: "public-secret",
        SESSION: "public-session",
        REGION: "us-east-1",
        SERVICE: "execute-api",
      },
    }
    const auths: Auth[] = [
      { type: "bearer", token: "$TOKEN" },
      { type: "basic", user: "$USER", pass: "$PASSWORD" },
      {
        type: "api_key",
        key: "$KEY",
        value: "$API_VALUE",
        placement: "header",
      },
      {
        type: "aws_sigv4",
        access_key: "$ACCESS",
        secret_key: "$SECRET",
        session_token: "$SESSION",
        region: "$REGION",
        service: "$SERVICE",
      },
    ]
    const snapshots = auths.map(
      (auth) =>
        buildTimelineEntry(
          {
            id: "auth",
            name: "Auth",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
            timeout: 0,
            auth,
          },
          result,
          "dev",
          environment,
        ).request.auth,
    )

    expect(snapshots).toEqual([
      { type: "bearer", token: "[REDACTED]" },
      { type: "basic", user: "alice", pass: "[REDACTED]" },
      {
        type: "api_key",
        key: "X-API-Key",
        value: "[REDACTED]",
        placement: "header",
      },
      {
        type: "aws_sigv4",
        access_key: "[REDACTED]",
        secret_key: "[REDACTED]",
        session_token: "[REDACTED]",
        region: "us-east-1",
        service: "execute-api",
      },
    ])
    expect(JSON.stringify(snapshots)).not.toContain("public-")
  })

  it("copies network activity into the saved entry", () => {
    const req = {
      id: "req-network",
      name: "Network",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      auth: undefined,
      timeout: 0,
    }
    const entry = buildTimelineEntry(req, {
      status: "done",
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 5,
        network: [{ timeMs: 0, type: "request", message: "GET example" }],
      },
    })
    expect(entry.network).toEqual([
      { timeMs: 0, type: "request", message: "GET example" },
    ])
  })

  it("copies failed network activity into the saved entry", () => {
    const req = {
      id: "req-network-error",
      name: "Network error",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      auth: undefined,
      timeout: 0,
    }
    const error = Object.assign(new Error("offline"), {
      network: [
        { timeMs: 0, type: "request" as const, message: "GET example" },
        { timeMs: 2, type: "error" as const, message: "offline" },
      ],
    })
    const entry = buildTimelineEntry(req, {
      status: "error",
      request: req,
      error,
    })
    expect(entry.network).toEqual(error.network)
  })

  it("resolves public variables and path params while preserving secret placeholders", () => {
    const req = {
      id: "req-3",
      name: "Env",
      method: "GET" as const,
      url: "$base_url/comments/:commentId/$TOKEN",
      headers: {
        "X-Comment": { value: "$comment_id", enabled: true },
        "X-Disabled": { value: "$comment_id", enabled: false },
        Authorization: { value: "Bearer $TOKEN", enabled: true },
      },
      params: [
        { name: "$comment_name", value: "$comment_id", enabled: true },
        { name: "disabled", value: "$comment_id", enabled: false },
      ],
      pathParams: [{ name: "commentId", value: "$comment_id", enabled: true }],
      body: '{"id":"$comment_id","token":"$TOKEN"}',
      auth: { type: "basic" as const, user: "$comment_id", pass: "$TOKEN" },
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 5,
      },
      request: req,
      envName: "dev",
    }
    const entry = buildTimelineEntry(req, result, "dev", {
      name: "dev",
      vars: {
        base_url: "https://api.example.com",
        comment_id: "42",
        comment_name: "comment",
        TOKEN: "top-secret",
      },
      secretVars: { TOKEN: "keychain" },
    })
    expect(entry.request.url).toBe("https://api.example.com/comments/42/$TOKEN")
    expect(entry.request.headers).toEqual({
      "X-Comment": { value: "42", enabled: true },
      "X-Disabled": { value: "$comment_id", enabled: false },
      Authorization: { value: "[REDACTED]", enabled: true },
    })
    expect(entry.request.params).toEqual([
      { name: "comment", value: "42", enabled: true },
      { name: "disabled", value: "$comment_id", enabled: false },
    ])
    expect(entry.request.pathParams).toEqual([
      { name: "commentId", value: "42", enabled: true },
    ])
    expect(entry.request.body).toBe('{"id":"42","token":"$TOKEN"}')
    expect(entry.request.auth).toEqual({
      type: "basic",
      user: "42",
      pass: "[REDACTED]",
    })
  })

  it("builds error entry", () => {
    const req = {
      id: "req-2",
      name: "Fail",
      method: "GET" as const,
      url: "https://down.example.com",
      headers: {},
      params: [],
      body: undefined,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "error" as const,
      error: new Error("Network error"),
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.error).toBeDefined()
    expect(entry.error!.message).toBe("Network error")
    expect(entry.response).toBeUndefined()
  })

  it("preserves request body longer than 10_000 chars for sidecar storage", () => {
    const longBody = "x".repeat(15_000)
    const req = {
      id: "req-trunc",
      name: "Trunc",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body: longBody,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 10,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body?.length).toBe(15_000)
    expect(entry.request.body).toBe(longBody)
  })

  it("preserves response body longer than 10_000 chars for sidecar storage", () => {
    const longBody = "y".repeat(20_000)
    const req = {
      id: "req-resp-trunc",
      name: "RespTrunc",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body: undefined,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: longBody,
        timeMs: 10,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.response?.body?.length).toBe(20_000)
    expect(entry.response?.body).toBe(longBody)
    expect(entry.response?.size).toBe(20_000)
  })

  it("keeps short body unchanged", () => {
    const body = '{"key":"val"}'
    const req = {
      id: "req-short",
      name: "Short",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 201,
        statusText: "Created",
        headers: {},
        body: "",
        timeMs: 5,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBe(body)
  })

  it("includes byte-accurate size for multibyte body", () => {
    const body = "".concat(...Array.from({ length: 500 }, () => "ñ"))
    const req = {
      id: "req-utf8",
      name: "UTF8",
      method: "POST" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body,
        timeMs: 5,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.response?.size).toBe(1000)
  })

  it("keeps empty body as empty string", () => {
    const req = {
      id: "req-empty",
      name: "Empty",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body: "",
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 204,
        statusText: "No Content",
        headers: {},
        body: "",
        timeMs: 3,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBe("")
    expect(entry.response?.body).toBe("")
    expect(entry.response?.size).toBe(0)
  })

  it("keeps undefined body as undefined", () => {
    const req = {
      id: "req-no-body",
      name: "NoBody",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      body: undefined,
      auth: undefined,
      timeout: 0,
    }
    const result = {
      status: "done" as const,
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "",
        timeMs: 1,
      },
      request: req,
      envName: undefined,
    }
    const entry = buildTimelineEntry(req, result)
    expect(entry.request.body).toBeUndefined()
    expect(entry.response?.size).toBe(0)
  })

  it("redacts loaded settings secrets from timeline errors", () => {
    const req = {
      id: "settings-secret",
      name: "Settings secret",
      method: "GET" as const,
      url: "https://api.example.com",
      headers: {},
      params: [],
      timeout: 0,
    }
    const entry = buildTimelineEntry(
      req,
      {
        status: "error" as const,
        error: new Error("proxy rejected bun-proxy-password"),
        request: req,
      },
      undefined,
      undefined,
      ["bun-proxy-password"],
    )
    expect(entry.error?.message).toBe("proxy rejected [REDACTED]")
  })
})
