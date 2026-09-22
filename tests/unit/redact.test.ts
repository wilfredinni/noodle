import { describe, expect, it } from "bun:test"
import {
  redactKnownSecrets,
  requestSensitiveValues,
  responseSensitiveValues,
} from "../../src/secrets/redact"

describe("request redaction", () => {
  it("does not treat valueless sensitive query names as secrets", () => {
    for (const query of ["token", "token=", "%74oken", "token&password="]) {
      const url = `https://api.example.com/x?${query}`
      const secrets = requestSensitiveValues({ url, headers: {} })

      expect(secrets).toEqual([])
      expect(redactKnownSecrets(`token missing: ${url}`, secrets)).toBe(
        `token missing: ${url}`,
      )
    }
  })

  it("retains encoded and decoded query secrets alongside valueless parameters", () => {
    const url =
      "https://api.example.com/x?token&api_key=child%2Bpassword+value%3D"
    const secrets = requestSensitiveValues({ url, headers: {} })

    expect(
      redactKnownSecrets(`token ${url} child+password value=`, secrets),
    ).toBe(
      "token https://api.example.com/x?token&api_key=[REDACTED] [REDACTED]",
    )
  })
})

describe("response redaction", () => {
  it("redacts primitive query values without replacing IDs or URL paths", () => {
    expect(
      redactKnownSecrets(
        'request-1 https://example.com/true/null?count=1 {"n":1,"b":true,"v":null}',
        [
          { kind: "json-primitive", value: "1" },
          { kind: "json-primitive", value: "true" },
          { kind: "json-primitive", value: "null" },
        ],
      ),
    ).toBe(
      'request-1 https://example.com/true/null?count=[REDACTED] {"n":[REDACTED],"b":[REDACTED],"v":[REDACTED]}',
    )
  })

  it("does not use short cookie values as global substring secrets", () => {
    const secrets = responseSensitiveValues({
      headers: { "set-cookie": "session=1" },
      cookies: [
        {
          name: "session",
          value: "1",
          expires: null,
          secure: false,
          httpOnly: false,
        },
      ],
    })

    expect(secrets).toEqual(["session=1"])
    expect(redactKnownSecrets("count=1 session=1", secrets)).toBe(
      "count=1 [REDACTED]",
    )
  })

  it("extracts cookie values from combined Set-Cookie headers", () => {
    const secrets = responseSensitiveValues({
      headers: {
        "set-cookie":
          'first="alpha-cookie"; Expires=Wed, 21 Oct 2026 07:28:00 GMT, second=beta-cookie; HttpOnly',
      },
    })

    expect(redactKnownSecrets("alpha-cookie:beta-cookie", secrets)).toBe(
      "[REDACTED]:[REDACTED]",
    )
  })
})
