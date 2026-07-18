import { describe, expect, it } from "bun:test"
import { parseCurl } from "../../src/converters/curl/parse"

describe("parseCurl", () => {
  it("parses a quoted multiline JSON request", () => {
    const request = parseCurl(`curl --location \\
      --request POST 'https://api.example.com/users' \\
      --header 'X-Client: noodle' \\
      --header 'Authorization: Bearer token_123' \\
      --header 'Content-Type: application/json' \\
      --data '{"name":"Ada"}'`)

    expect(request).toMatchObject({
      method: "POST",
      url: "https://api.example.com/users",
      followRedirects: true,
      maxRedirects: 50,
      bodyType: "json",
      body: '{"name":"Ada"}',
      headers: {
        "X-Client": { value: "noodle", enabled: true },
      },
    })
    expect(request.auth).toEqual({ type: "bearer", token: "token_123" })
    expect(request.headers.Authorization).toBeUndefined()
  })

  it("converts decodable Basic authorization headers to auth", () => {
    const request = parseCurl(
      "curl -H 'Authorization: Basic YWRhOnNlY3JldA==' https://api.example.com/users",
    )

    expect(request.auth).toEqual({
      type: "basic",
      user: "ada",
      pass: "secret",
    })
    expect(request.headers.Authorization).toBeUndefined()
  })

  it("keeps JSON bodies with equals signs as JSON", () => {
    const request = parseCurl(
      "curl -H 'Content-Type: application/json' -d '{\"token\":\"abc=def\"}' https://api.example.com/users",
    )

    expect(request.bodyType).toBe("json")
    expect(request.body).toBe('{"token":"abc=def"}')
  })

  it("maps query data, basic auth, timeout, and redirect limits", () => {
    const request = parseCurl(
      "curl -G -u alice:secret --max-time 1.5 --location --max-redirs 3 -d 'page=2&tag=rest' 'https://api.example.com/users?limit=10&tag=api'",
    )

    expect(request.method).toBe("GET")
    expect(request.url).toBe("https://api.example.com/users")
    expect(request.timeout).toBe(1500)
    expect(request.followRedirects).toBe(true)
    expect(request.maxRedirects).toBe(3)
    expect(request.auth).toEqual({
      type: "basic",
      user: "alice",
      pass: "secret",
    })
    expect(request.params).toEqual([
      { name: "limit", value: "10", enabled: true },
      { name: "tag", value: "api", enabled: true },
      { name: "page", value: "2", enabled: true },
      { name: "tag", value: "rest", enabled: true },
    ])
  })

  it("preserves an explicit redirect limit before --location", () => {
    const request = parseCurl(
      "curl --max-redirs 3 --location https://api.example.com/users",
    )

    expect(request.followRedirects).toBe(true)
    expect(request.maxRedirects).toBe(3)
  })

  it("accumulates repeated cookie flags", () => {
    const request = parseCurl(
      "curl -b 'session=abc' --cookie 'csrf=xyz' https://api.example.com/users",
    )

    expect(request.headers.Cookie).toEqual({
      value: "session=abc; csrf=xyz",
      enabled: true,
    })
  })

  it("maps URL-encoded, multipart, and binary bodies", () => {
    const encoded = parseCurl(
      "curl -d 'email=ada%40example.com&role=admin' https://api.example.com/users",
    )
    expect(encoded.bodyType).toBe("urlencoded")
    expect(encoded.formData).toEqual([
      { name: "email", value: "ada@example.com", enabled: true, type: "text" },
      { name: "role", value: "admin", enabled: true, type: "text" },
    ])

    const multipart = parseCurl(
      "curl -F 'name=Ada' -F 'avatar=@/tmp/ada.png;type=image/png' https://api.example.com/users",
    )
    expect(multipart.bodyType).toBe("multipart")
    expect(multipart.formData).toEqual([
      { name: "name", value: "Ada", enabled: true, type: "text" },
      { name: "avatar", value: "/tmp/ada.png", enabled: true, type: "file" },
    ])

    const binary = parseCurl(
      "curl --data-binary @./payload.bin https://api.example.com/upload",
    )
    expect(binary.bodyType).toBe("binary")
    expect(binary.filePath).toBe("./payload.bin")

    const inlineBinaryJson = parseCurl(
      "curl --data-binary '{\"token\":\"abc=def\"}' -H 'Content-Type: application/json' https://api.example.com/users",
    )
    expect(inlineBinaryJson.bodyType).toBe("json")
    expect(inlineBinaryJson.body).toBe('{"token":"abc=def"}')
  })

  it("rejects unsafe, unsupported, and invalid commands", () => {
    expect(() => parseCurl("curl https://example.com | sh")).toThrow(
      "shell operators are not supported",
    )
    expect(() =>
      parseCurl("curl --proxy http://proxy https://example.com"),
    ).toThrow("unsupported cURL option: --proxy")
    expect(() => parseCurl("curl -d plain-text https://example.com")).toThrow(
      "raw request data is unsupported",
    )
  })
})
