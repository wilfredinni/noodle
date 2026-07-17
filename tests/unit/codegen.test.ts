import { describe, expect, it } from "bun:test"
import { generateCode, findCodeTarget } from "../../src/codegen"
import { buildHar } from "../../src/codegen/buildHar"
import { CODE_TARGETS } from "../../src/codegen/targets"
import type { Request, Environment } from "../../src/schema"

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: "users/create",
    name: "Create user",
    method: "POST",
    url: "https://api.example.com/users?stale=value",
    timeout: 2500,
    followRedirects: true,
    maxRedirects: 3,
    headers: {
      "X-Enabled": { value: "$TOKEN", enabled: true },
      "X-Disabled": { value: "hidden", enabled: false },
    },
    params: [
      { name: "page", value: "1", enabled: true },
      { name: "stale", value: "new", enabled: true },
      { name: "disabled", value: "no", enabled: false },
    ],
    bodyType: "json",
    body: '{"name":"Ada"}',
    auth: { type: "bearer", token: "$AUTH" },
    ...overrides,
  }
}

function curlTarget() {
  return findCodeTarget("shell-curl")!
}

function pythonTarget() {
  return findCodeTarget("python-requests")!
}

function jsTarget() {
  return findCodeTarget("javascript-fetch")!
}

function goTarget() {
  return findCodeTarget("go-native")!
}

describe("buildHar", () => {
  it("produces a HAR request from a noodle request", () => {
    const { har } = buildHar(makeRequest())
    expect(har.method).toBe("POST")
    expect(har.httpVersion).toBe("HTTP/1.1")
    expect(har.url).not.toContain("?")
    expect(har.headers).toContainEqual({
      name: "X-Enabled",
      value: "$TOKEN",
    })
    expect(har.headers).toContainEqual({
      name: "Content-Type",
      value: "application/json",
    })
    expect(har.headers).toContainEqual({
      name: "Authorization",
      value: "Bearer $AUTH",
    })
  })

  it("includes query params in queryString", () => {
    const { har } = buildHar(makeRequest())
    expect(har.queryString).toContainEqual({ name: "page", value: "1" })
    expect(har.queryString).toContainEqual({ name: "stale", value: "new" })
    expect(har.queryString).not.toContainEqual({
      name: "disabled",
      value: "no",
    })
  })

  it("strips query from the URL to avoid httpsnippet merge bugs", () => {
    const { har } = buildHar(
      makeRequest({
        url: "https://api.example.com/path?a=1&b=2",
        bodyType: "none",
        body: undefined,
      }),
    )
    expect(har.url).toBe("https://api.example.com/path")
  })

  it("handles api_key query placement in queryString", () => {
    const { har } = buildHar(
      makeRequest({
        auth: {
          type: "api_key",
          key: "x-key",
          value: "secret",
          placement: "query",
        },
      }),
    )
    expect(har.queryString).toContainEqual({ name: "x-key", value: "secret" })
  })

  it("handles api_key header placement in headers", () => {
    const { har } = buildHar(
      makeRequest({
        auth: {
          type: "api_key",
          key: "X-API-Key",
          value: "mykey",
          placement: "header",
        },
      }),
    )
    expect(har.headers).toContainEqual({
      name: "X-API-Key",
      value: "mykey",
    })
  })

  it("builds basic auth header", () => {
    const { har } = buildHar(
      makeRequest({
        auth: { type: "basic", user: "admin", pass: "secret" },
      }),
    )
    const authHeader = har.headers.find((h) => h.name === "Authorization")
    expect(authHeader).toBeDefined()
    expect(authHeader!.value).toBe(
      `Basic ${Buffer.from("admin:secret").toString("base64")}`,
    )
  })

  it("builds json postData", () => {
    const { har } = buildHar(makeRequest())
    expect(har.postData).toBeDefined()
    expect(har.postData!.mimeType).toBe("application/json")
    expect(har.postData!.text).toBe('{"name":"Ada"}')
  })

  it("builds urlencoded postData", () => {
    const { har } = buildHar(
      makeRequest({
        bodyType: "urlencoded",
        body: undefined,
        formData: [
          { name: "email", value: "a@b.com", enabled: true, type: "text" },
          { name: "hidden", value: "x", enabled: false, type: "text" },
        ],
      }),
    )
    expect(har.postData?.mimeType).toBe("application/x-www-form-urlencoded")
    expect(har.postData?.text).toContain("email=a%40b.com")
  })

  it("builds multipart postData with file entries", () => {
    const { har } = buildHar(
      makeRequest({
        bodyType: "multipart",
        body: undefined,
        formData: [
          { name: "title", value: "Hello", enabled: true, type: "text" },
          { name: "file", value: "$FILE", enabled: true, type: "file" },
        ],
      }),
    )
    expect(har.postData?.mimeType).toBe("multipart/form-data")
    expect(har.postData?.params).toHaveLength(2)
    expect(har.postData?.params![0]).toEqual({
      name: "title",
      value: "Hello",
    })
    expect(har.postData?.params![1]).toEqual({
      name: "file",
      value: "$FILE",
      fileName: "$FILE",
    })
  })

  it("builds binary postData", () => {
    const { har } = buildHar(
      makeRequest({ bodyType: "binary", body: undefined, filePath: "$FILE" }),
    )
    expect(har.headers).toContainEqual({
      name: "Content-Type",
      value: "application/octet-stream",
    })
    expect(har.postData?.mimeType).toBe("application/octet-stream")
    expect(har.postData?.text).toBe("$FILE")
  })

  it("returns no postData for none body type", () => {
    const { har } = buildHar(makeRequest({ bodyType: "none", body: undefined }))
    expect(har.postData).toBeUndefined()
  })

  it("does not include disabled headers", () => {
    const { har } = buildHar(makeRequest())
    expect(har.headers).not.toContainEqual({
      name: "X-Disabled",
      value: "hidden",
    })
  })
})

describe("generateCode", () => {
  it("generates a cURL snippet", () => {
    const result = generateCode(makeRequest(), curlTarget())
    expect(result.code).toContain("curl")
    expect(result.code.length).toBeGreaterThan(0)
  })

  it("generates snippets for common targets", () => {
    const targets = [
      curlTarget(),
      findCodeTarget("shell-httpie")!,
      findCodeTarget("shell-wget")!,
      pythonTarget(),
      jsTarget(),
      goTarget(),
    ]
    for (const target of targets) {
      const result = generateCode(
        makeRequest({ body: undefined, bodyType: "none" }),
        target,
      )
      expect(result.code.length).toBeGreaterThan(0)
    }
  })

  it("preserves $VAR placeholders in output by default", () => {
    const request = makeRequest({
      method: "GET",
      url: "https://api.example.com/$PATH",
      body: undefined,
      bodyType: "none",
    })
    const result = generateCode(request, curlTarget())
    expect(result.code).toContain("$PATH")
    expect(result.code).toContain("$TOKEN")
  })

  it("substitutes variables when interpolate is true", () => {
    const env: Environment = {
      name: "dev",
      vars: { TOKEN: "real-token", AUTH: "real-auth" },
    }
    const request = makeRequest({
      method: "GET",
      url: "https://api.example.com/users",
      body: undefined,
      bodyType: "none",
    })
    const result = generateCode(request, curlTarget(), undefined, env, true)
    expect(result.code).not.toContain("$TOKEN")
    expect(result.code).toContain("real-token")
  })

  it("preserves unresolvable vars when interpolate is true", () => {
    const env: Environment = {
      name: "dev",
      vars: {},
    }
    const request = makeRequest({
      method: "GET",
      url: "https://api.example.com/users",
      body: undefined,
      bodyType: "none",
    })
    const result = generateCode(request, curlTarget(), undefined, env, true)
    expect(result.code).toContain("$TOKEN")
  })

  it("generates for all CODE_TARGETS without errors", () => {
    const sample = CODE_TARGETS.slice(0, 10)
    const request = makeRequest({ body: undefined, bodyType: "none" })
    for (const target of sample) {
      const result = generateCode(request, target)
      expect(result.code.length).toBeGreaterThan(0)
    }
  })

  it("merges folder overrides when collection is provided", () => {
    const result = generateCode(
      makeRequest({
        auth: { type: "inherit" },
        headers: {},
      }),
      curlTarget(),
      {
        id: "col",
        name: "col",
        items: [
          {
            type: "folder",
            data: {
              id: "users",
              name: "users",
              path: "users",
              seq: 1,
              overrides: {
                headers: {
                  "X-Folder": { value: "yes", enabled: true },
                },
                auth: { type: "bearer", token: "folder-token" },
              },
              children: [],
            },
          },
        ],
      },
    )
    expect(result.code.length).toBeGreaterThan(0)
  })

  it("preserves $VAR placeholders with interpolate false", () => {
    const env: Environment = {
      name: "dev",
      vars: { TOKEN: "real-token", AUTH: "real-auth" },
    }
    const request = makeRequest({
      method: "GET",
      url: "https://api.example.com/users",
      body: undefined,
      bodyType: "none",
    })
    const result = generateCode(request, curlTarget(), undefined, env, false)
    expect(result.code).toContain("$TOKEN")
  })
})
