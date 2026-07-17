import { describe, expect, it } from "bun:test"
import { generateCode, toCurlArgs } from "../../src/codegen"
import type { Request } from "../../src/schema"

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

describe("code generation", () => {
  it("builds explicit cURL arguments from the effective request", () => {
    expect(toCurlArgs(makeRequest())).toEqual([
      "curl",
      "--request",
      "POST",
      "--location",
      "--max-redirs",
      "3",
      "--max-time",
      "2.5",
      "--header",
      "X-Enabled: $TOKEN",
      "--header",
      "Content-Type: application/json",
      "--header",
      "Authorization: Bearer $AUTH",
      "--data-raw",
      '{"name":"Ada"}',
      "https://api.example.com/users?page=1&stale=new",
    ])
  })

  it("preserves placeholders as literal values in cURL and generated code", () => {
    const request = makeRequest({
      method: "GET",
      url: "https://api.example.com/$PATH",
      body: undefined,
      bodyType: "none",
    })

    expect(generateCode(request, "curl").code).toContain("$PATH")
    expect(generateCode(request, "python").code).toContain("$PATH")
    expect(generateCode(request, "python").code).toContain("$TOKEN")
  })

  it("generates every target for a URL rooted at a Noodle variable", () => {
    const request = makeRequest({
      method: "GET",
      url: "$base_url/photos/1",
      body: undefined,
      bodyType: "none",
    })

    for (const language of [
      "curl",
      "httpie",
      "wget",
      "javascript",
      "python",
      "go",
    ] as const) {
      expect(generateCode(request, language).code).toContain("$base_url")
    }
  })

  it("uses curlconverter for every supported non-cURL target", () => {
    const request = makeRequest()
    for (const language of [
      "httpie",
      "wget",
      "javascript",
      "python",
      "go",
    ] as const) {
      const result = generateCode(request, language)
      expect(result.language).toBe(language)
      expect(result.code.length).toBeGreaterThan(0)
      expect(Array.isArray(result.warnings)).toBe(true)
    }
  })

  it("does not surface converter warnings for redirect flags", () => {
    const result = generateCode(makeRequest(), "javascript")
    expect(result.warnings).not.toContain(
      "location: --location is not a supported option",
    )
    expect(result.warnings).not.toContain(
      "max-redirs: --max-redirs is not a supported option",
    )
  })

  it("formats multipart and binary file references without reading files", () => {
    const multipart = toCurlArgs(
      makeRequest({
        bodyType: "multipart",
        body: undefined,
        formData: [
          { name: "title", value: "Hello", enabled: true, type: "text" },
          { name: "file", value: "$FILE", enabled: true, type: "file" },
        ],
      }),
    )
    expect(multipart).toContain("file=@$FILE")

    const binary = toCurlArgs(
      makeRequest({ bodyType: "binary", body: undefined, filePath: "$FILE" }),
    )
    expect(binary).toContain("@$FILE")
    expect(binary).toContain("Content-Type: application/octet-stream")
  })
})
