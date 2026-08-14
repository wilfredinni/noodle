import { describe, expect, it } from "bun:test"
import { defaultOAuth1Auth, defaultOAuth2Auth } from "../src/auth/defaults"
import {
  authFieldValue,
  authRowCount,
  getAuthRows,
  updateAuthField,
} from "../src/ui/authRows"

describe("OAuth auth rows", () => {
  it("shows grant-specific and signature-specific fields", () => {
    const rsaFields = getAuthRows({
      ...defaultOAuth1Auth(),
      signature_method: "RSA-SHA256",
    }).map((row) => row.field)
    expect(rsaFields).toContain("private_key")
    expect(rsaFields).toContain("private_key_type")

    const authorizationCode = defaultOAuth2Auth()
    const codeFields = getAuthRows(authorizationCode).map((row) => row.field)
    expect(codeFields).toContain("authorization_url")
    expect(codeFields).toContain("pkce_method")
    expect(codeFields).not.toContain("username")

    const passwordFields = getAuthRows({
      ...authorizationCode,
      grant_type: "password",
    }).map((row) => row.field)
    expect(passwordFields).toContain("username")
    expect(passwordFields).toContain("password")
    expect(passwordFields).not.toContain("authorization_url")
    expect(authRowCount(authorizationCode)).toBe(codeFields.length + 1)
  })

  it("edits phase and placement parameter groups without losing other metadata", () => {
    const auth = {
      ...defaultOAuth2Auth(),
      additional_parameters: {
        authorization: [],
        token: [
          {
            name: "X-Existing",
            value: "header-secret",
            enabled: true,
            placement: "header" as const,
          },
          {
            name: "disabled",
            value: "keep-me",
            enabled: false,
            placement: "body" as const,
          },
        ],
        refresh: [],
      },
    }
    expect(authFieldValue(auth, "additional_parameters.token.header")).toBe(
      "X-Existing=header-secret",
    )
    const updated = updateAuthField(
      auth,
      "additional_parameters.token.body",
      "tenant=one&tenant=two",
    )
    expect(updated.type).toBe("oauth2")
    if (updated.type !== "oauth2") throw new Error("expected OAuth 2")
    expect(updated.additional_parameters.token).toEqual([
      {
        name: "X-Existing",
        value: "header-secret",
        enabled: true,
        placement: "header",
      },
      {
        name: "disabled",
        value: "keep-me",
        enabled: false,
        placement: "body",
      },
      { name: "tenant", value: "one", enabled: true, placement: "body" },
      { name: "tenant", value: "two", enabled: true, placement: "body" },
    ])
  })
})
