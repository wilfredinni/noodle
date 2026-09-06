import { describe, expect, it } from "bun:test"
import {
  redactKnownSecrets,
  responseSensitiveValues,
} from "../../src/secrets/redact"

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
