import type { Auth, OAuth1Auth, OAuth2Auth } from "../schema"

export const DEFAULT_OAUTH2_REDIRECT_URI =
  "http://127.0.0.1:8765/oauth/callback"

export function defaultOAuth1Auth(): OAuth1Auth {
  return {
    type: "oauth1",
    consumer_key: "",
    consumer_secret: "",
    access_token: "",
    access_token_secret: "",
    signature_method: "HMAC-SHA1",
    private_key: "",
    private_key_type: "text",
    callback_url: "",
    verifier: "",
    timestamp: "",
    nonce: "",
    version: "1.0",
    realm: "",
    placement: "header",
    include_body_hash: false,
  }
}

export function defaultOAuth2Auth(): OAuth2Auth {
  return {
    type: "oauth2",
    grant_type: "authorization_code",
    discovery_url: "",
    authorization_url: "",
    access_token_url: "",
    refresh_token_url: "",
    client_id: "",
    client_secret: "",
    username: "",
    password: "",
    scope: "",
    audience: "",
    redirect_uri: DEFAULT_OAUTH2_REDIRECT_URI,
    credentials_id: "",
    auto_fetch_token: true,
    auto_refresh_token: true,
    pkce: true,
    pkce_method: "S256",
    implicit_response_type: "token",
    credentials_placement: "body",
    client_authentication: "client_secret",
    client_assertion_algorithm: "HS256",
    client_assertion_key: "",
    client_assertion_key_type: "text",
    client_assertion_issuer: "",
    client_assertion_subject: "",
    client_assertion_audience: "",
    client_assertion_lifetime: 300,
    token_source: "access_token",
    token_placement: "header",
    token_header: "Authorization",
    token_prefix: "Bearer",
    token_query_key: "access_token",
    additional_parameters: {
      authorization: [],
      token: [],
      refresh: [],
    },
  }
}

export function defaultAuth(type: Auth["type"]): Auth {
  if (type === "none" || type === "inherit") return { type }
  if (type === "bearer") return { type, token: "" }
  if (type === "basic") return { type, user: "", pass: "" }
  if (type === "ntlm") {
    return { type, username: "", password: "", domain: "", workstation: "" }
  }
  if (type === "api_key") {
    return { type, key: "", value: "", placement: "header" }
  }
  if (type === "aws_sigv4") {
    return {
      type,
      access_key: "",
      secret_key: "",
      region: "",
      service: "",
      session_token: "",
    }
  }
  if (type === "oauth1") return defaultOAuth1Auth()
  return defaultOAuth2Auth()
}
