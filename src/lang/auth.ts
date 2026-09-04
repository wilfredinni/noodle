import { defaultOAuth1Auth, defaultOAuth2Auth } from "../auth/defaults"
import type {
  Auth,
  OAuth1Auth,
  OAuth1Placement,
  OAuth1SignatureMethod,
  OAuth2AdditionalParameter,
  OAuth2Auth,
  OAuth2ClientAssertionAlgorithm,
  OAuth2GrantType,
} from "../schema"

const OAUTH1_SIGNATURE_METHODS: readonly OAuth1SignatureMethod[] = [
  "HMAC-SHA1",
  "HMAC-SHA256",
  "HMAC-SHA512",
  "RSA-SHA1",
  "RSA-SHA256",
  "RSA-SHA512",
  "PLAINTEXT",
]
const OAUTH1_PLACEMENTS: readonly OAuth1Placement[] = [
  "header",
  "query",
  "body",
]
const OAUTH2_GRANTS: readonly OAuth2GrantType[] = [
  "authorization_code",
  "client_credentials",
  "implicit",
  "password",
]
const ASSERTION_ALGORITHMS: readonly OAuth2ClientAssertionAlgorithm[] = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
]

function mapping(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a mapping`)
  }
  return value as Record<string, unknown>
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const known = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!known.has(key)) throw new Error(`${path}: unknown field "${key}"`)
  }
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  fallback: string,
  path: string,
): string {
  const field = value[key]
  if (field === undefined) return fallback
  if (typeof field !== "string") {
    throw new Error(`${path}.${key} must be a string`)
  }
  return field
}

function optionalBoolean(
  value: Record<string, unknown>,
  key: string,
  fallback: boolean,
  path: string,
): boolean {
  const field = value[key]
  if (field === undefined) return fallback
  if (typeof field !== "boolean") {
    throw new Error(`${path}.${key} must be a boolean`)
  }
  return field
}

function enumValue<T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
  path: string,
): T {
  const field = value[key]
  if (field === undefined) return fallback
  if (typeof field !== "string" || !allowed.includes(field as T)) {
    throw new Error(
      `${path}.${key} must be one of ${allowed.join("|")}, got "${String(field)}"`,
    )
  }
  return field as T
}

function parseAdditionalParameters(
  value: unknown,
  phase: "authorization" | "token" | "refresh",
  path: string,
): OAuth2AdditionalParameter[] {
  if (value === undefined) return []
  if (!Array.isArray(value))
    throw new Error(`${path}.${phase} must be an array`)
  return value.map((item, index) => {
    const itemPath = `${path}.${phase}[${index}]`
    const raw = mapping(item, itemPath)
    rejectUnknown(raw, ["name", "value", "enabled", "placement"], itemPath)
    if (typeof raw.name !== "string" || typeof raw.value !== "string") {
      throw new Error(`${itemPath} requires string "name" and "value"`)
    }
    if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
      throw new Error(`${itemPath}.enabled must be a boolean`)
    }
    const allowed: readonly OAuth2AdditionalParameter["placement"][] =
      phase === "authorization" ? ["query"] : ["body", "header", "query"]
    const placement = enumValue(
      raw,
      "placement",
      allowed,
      phase === "authorization" ? "query" : "body",
      itemPath,
    )
    return {
      name: raw.name,
      value: raw.value,
      enabled: raw.enabled ?? true,
      placement,
    }
  })
}

function parseOAuth1(raw: Record<string, unknown>, path: string): OAuth1Auth {
  rejectUnknown(
    raw,
    [
      "type",
      "consumer_key",
      "consumer_secret",
      "access_token",
      "access_token_secret",
      "signature_method",
      "private_key",
      "private_key_type",
      "callback_url",
      "verifier",
      "timestamp",
      "nonce",
      "version",
      "realm",
      "placement",
      "include_body_hash",
    ],
    path,
  )
  const defaults = defaultOAuth1Auth()
  return {
    type: "oauth1",
    consumer_key: optionalString(
      raw,
      "consumer_key",
      defaults.consumer_key,
      path,
    ),
    consumer_secret: optionalString(
      raw,
      "consumer_secret",
      defaults.consumer_secret,
      path,
    ),
    access_token: optionalString(
      raw,
      "access_token",
      defaults.access_token,
      path,
    ),
    access_token_secret: optionalString(
      raw,
      "access_token_secret",
      defaults.access_token_secret,
      path,
    ),
    signature_method: enumValue(
      raw,
      "signature_method",
      OAUTH1_SIGNATURE_METHODS,
      defaults.signature_method,
      path,
    ),
    private_key: optionalString(raw, "private_key", defaults.private_key, path),
    private_key_type: enumValue(
      raw,
      "private_key_type",
      ["text", "file"],
      defaults.private_key_type,
      path,
    ),
    callback_url: optionalString(
      raw,
      "callback_url",
      defaults.callback_url,
      path,
    ),
    verifier: optionalString(raw, "verifier", defaults.verifier, path),
    timestamp: optionalString(raw, "timestamp", defaults.timestamp, path),
    nonce: optionalString(raw, "nonce", defaults.nonce, path),
    version: optionalString(raw, "version", defaults.version, path),
    realm: optionalString(raw, "realm", defaults.realm, path),
    placement: enumValue(
      raw,
      "placement",
      OAUTH1_PLACEMENTS,
      defaults.placement,
      path,
    ),
    include_body_hash: optionalBoolean(
      raw,
      "include_body_hash",
      defaults.include_body_hash,
      path,
    ),
  }
}

function parseOAuth2(raw: Record<string, unknown>, path: string): OAuth2Auth {
  rejectUnknown(
    raw,
    [
      "type",
      "grant_type",
      "discovery_url",
      "discovery_url_kind",
      "authorization_url",
      "access_token_url",
      "refresh_token_url",
      "client_id",
      "client_secret",
      "username",
      "password",
      "scope",
      "audience",
      "redirect_uri",
      "credentials_id",
      "auto_fetch_token",
      "auto_refresh_token",
      "pkce",
      "pkce_method",
      "implicit_response_type",
      "credentials_placement",
      "client_authentication",
      "client_assertion_algorithm",
      "client_assertion_key",
      "client_assertion_key_type",
      "client_assertion_issuer",
      "client_assertion_subject",
      "client_assertion_audience",
      "client_assertion_lifetime",
      "token_source",
      "token_placement",
      "token_header",
      "token_prefix",
      "token_query_key",
      "additional_parameters",
    ],
    path,
  )
  const defaults = defaultOAuth2Auth()
  const additional =
    raw.additional_parameters === undefined
      ? {}
      : mapping(raw.additional_parameters, `${path}.additional_parameters`)
  rejectUnknown(
    additional,
    ["authorization", "token", "refresh"],
    `${path}.additional_parameters`,
  )

  const lifetime =
    raw.client_assertion_lifetime ?? defaults.client_assertion_lifetime
  if (
    typeof lifetime !== "number" ||
    !Number.isSafeInteger(lifetime) ||
    lifetime <= 0
  ) {
    throw new Error(
      `${path}.client_assertion_lifetime must be a positive integer`,
    )
  }

  return {
    type: "oauth2",
    grant_type: enumValue(
      raw,
      "grant_type",
      OAUTH2_GRANTS,
      defaults.grant_type,
      path,
    ),
    discovery_url: optionalString(
      raw,
      "discovery_url",
      defaults.discovery_url,
      path,
    ),
    ...(raw.discovery_url_kind === undefined
      ? {}
      : {
          discovery_url_kind: enumValue(
            raw,
            "discovery_url_kind",
            ["issuer", "document"] as const,
            "issuer",
            path,
          ),
        }),
    authorization_url: optionalString(
      raw,
      "authorization_url",
      defaults.authorization_url,
      path,
    ),
    access_token_url: optionalString(
      raw,
      "access_token_url",
      defaults.access_token_url,
      path,
    ),
    refresh_token_url: optionalString(
      raw,
      "refresh_token_url",
      defaults.refresh_token_url,
      path,
    ),
    client_id: optionalString(raw, "client_id", defaults.client_id, path),
    client_secret: optionalString(
      raw,
      "client_secret",
      defaults.client_secret,
      path,
    ),
    username: optionalString(raw, "username", defaults.username, path),
    password: optionalString(raw, "password", defaults.password, path),
    scope: optionalString(raw, "scope", defaults.scope, path),
    audience: optionalString(raw, "audience", defaults.audience, path),
    redirect_uri: optionalString(
      raw,
      "redirect_uri",
      defaults.redirect_uri,
      path,
    ),
    credentials_id: optionalString(
      raw,
      "credentials_id",
      defaults.credentials_id,
      path,
    ),
    auto_fetch_token: optionalBoolean(
      raw,
      "auto_fetch_token",
      defaults.auto_fetch_token,
      path,
    ),
    auto_refresh_token: optionalBoolean(
      raw,
      "auto_refresh_token",
      defaults.auto_refresh_token,
      path,
    ),
    pkce: optionalBoolean(raw, "pkce", defaults.pkce, path),
    pkce_method: enumValue(
      raw,
      "pkce_method",
      ["S256", "plain"],
      defaults.pkce_method,
      path,
    ),
    implicit_response_type: enumValue(
      raw,
      "implicit_response_type",
      ["token", "id_token", "token id_token"],
      defaults.implicit_response_type,
      path,
    ),
    credentials_placement: enumValue(
      raw,
      "credentials_placement",
      ["body", "basic"],
      defaults.credentials_placement,
      path,
    ),
    client_authentication: enumValue(
      raw,
      "client_authentication",
      ["client_secret", "client_assertion"],
      defaults.client_authentication,
      path,
    ),
    client_assertion_algorithm: enumValue(
      raw,
      "client_assertion_algorithm",
      ASSERTION_ALGORITHMS,
      defaults.client_assertion_algorithm,
      path,
    ),
    client_assertion_key: optionalString(
      raw,
      "client_assertion_key",
      defaults.client_assertion_key,
      path,
    ),
    client_assertion_key_type: enumValue(
      raw,
      "client_assertion_key_type",
      ["text", "file"],
      defaults.client_assertion_key_type,
      path,
    ),
    client_assertion_issuer: optionalString(
      raw,
      "client_assertion_issuer",
      defaults.client_assertion_issuer,
      path,
    ),
    client_assertion_subject: optionalString(
      raw,
      "client_assertion_subject",
      defaults.client_assertion_subject,
      path,
    ),
    client_assertion_audience: optionalString(
      raw,
      "client_assertion_audience",
      defaults.client_assertion_audience,
      path,
    ),
    client_assertion_lifetime: lifetime,
    token_source: enumValue(
      raw,
      "token_source",
      ["access_token", "id_token"],
      defaults.token_source,
      path,
    ),
    token_placement: enumValue(
      raw,
      "token_placement",
      ["header", "query"],
      defaults.token_placement,
      path,
    ),
    token_header: optionalString(
      raw,
      "token_header",
      defaults.token_header,
      path,
    ),
    token_prefix: optionalString(
      raw,
      "token_prefix",
      defaults.token_prefix,
      path,
    ),
    token_query_key: optionalString(
      raw,
      "token_query_key",
      defaults.token_query_key,
      path,
    ),
    additional_parameters: {
      authorization: parseAdditionalParameters(
        additional.authorization,
        "authorization",
        `${path}.additional_parameters`,
      ),
      token: parseAdditionalParameters(
        additional.token,
        "token",
        `${path}.additional_parameters`,
      ),
      refresh: parseAdditionalParameters(
        additional.refresh,
        "refresh",
        `${path}.additional_parameters`,
      ),
    },
  }
}

export function parseAuth(
  value: unknown,
  prefix: "lang.parseRequest" | "lang.parseFolder",
  allowInherit: boolean,
): Auth {
  if (value === undefined) return { type: "none" }
  const raw = mapping(value, `${prefix}: "auth"`)
  if (raw.type === "none") return { type: "none" }
  if (raw.type === "inherit") {
    if (allowInherit) return { type: "inherit" }
    throw new Error(`${prefix}: invalid auth.type "inherit"`)
  }
  if (raw.type === "oauth1") return parseOAuth1(raw, `${prefix}: auth.oauth1`)
  if (raw.type === "oauth2") return parseOAuth2(raw, `${prefix}: auth.oauth2`)
  if (raw.type === "bearer") {
    if (typeof raw.token !== "string")
      throw new Error(`${prefix}: auth.bearer requires "token"`)
    return { type: "bearer", token: raw.token }
  }
  if (raw.type === "basic") {
    if (typeof raw.user !== "string" || typeof raw.pass !== "string") {
      throw new Error(`${prefix}: auth.basic requires "user" and "pass"`)
    }
    return { type: "basic", user: raw.user, pass: raw.pass }
  }
  if (raw.type === "ntlm") {
    if (
      typeof raw.username !== "string" ||
      typeof raw.password !== "string" ||
      (raw.domain !== undefined && typeof raw.domain !== "string") ||
      (raw.workstation !== undefined && typeof raw.workstation !== "string")
    ) {
      throw new Error(
        `${prefix}: auth.ntlm requires "username" and "password"; "domain" and "workstation" must be strings when present`,
      )
    }
    return {
      type: "ntlm",
      username: raw.username,
      password: raw.password,
      domain: raw.domain ?? "",
      workstation: raw.workstation ?? "",
    }
  }
  if (raw.type === "api_key") {
    if (typeof raw.key !== "string" || typeof raw.value !== "string") {
      throw new Error(`${prefix}: auth.api_key requires "key" and "value"`)
    }
    const placement = raw.placement ?? "header"
    if (placement !== "header" && placement !== "query") {
      throw new Error(
        `${prefix}: auth.api_key placement must be "header" or "query"`,
      )
    }
    return { type: "api_key", key: raw.key, value: raw.value, placement }
  }
  if (raw.type === "aws_sigv4") {
    if (
      typeof raw.access_key !== "string" ||
      typeof raw.secret_key !== "string" ||
      typeof raw.region !== "string" ||
      typeof raw.service !== "string" ||
      (raw.session_token !== undefined && typeof raw.session_token !== "string")
    ) {
      throw new Error(
        `${prefix}: auth.aws_sigv4 requires "access_key", "secret_key", "region", and "service"; "session_token" must be a string when present`,
      )
    }
    return {
      type: "aws_sigv4",
      access_key: raw.access_key,
      secret_key: raw.secret_key,
      region: raw.region,
      service: raw.service,
      ...(raw.session_token ? { session_token: raw.session_token } : {}),
    }
  }
  throw new Error(
    `${prefix}: invalid auth.type "${String(raw.type)}", expected none${allowInherit ? "|inherit" : ""}|bearer|basic|ntlm|api_key|aws_sigv4|oauth1|oauth2`,
  )
}

export function authToObj(auth: Auth): Record<string, unknown> {
  if (auth.type === "none" || auth.type === "inherit")
    return { type: auth.type }
  if (auth.type === "bearer") return { type: auth.type, token: auth.token }
  if (auth.type === "basic")
    return { type: auth.type, user: auth.user, pass: auth.pass }
  if (auth.type === "ntlm")
    return {
      type: auth.type,
      username: auth.username,
      password: auth.password,
      ...(auth.domain ? { domain: auth.domain } : {}),
      ...(auth.workstation ? { workstation: auth.workstation } : {}),
    }
  if (auth.type === "api_key")
    return {
      type: auth.type,
      key: auth.key,
      value: auth.value,
      placement: auth.placement,
    }
  if (auth.type === "aws_sigv4")
    return {
      type: auth.type,
      access_key: auth.access_key,
      secret_key: auth.secret_key,
      region: auth.region,
      service: auth.service,
      ...(auth.session_token ? { session_token: auth.session_token } : {}),
    }
  if (auth.type === "oauth1") {
    const { type, ...fields } = auth
    return { type, ...fields }
  }
  return {
    ...auth,
    additional_parameters: {
      authorization: auth.additional_parameters.authorization,
      token: auth.additional_parameters.token,
      refresh: auth.additional_parameters.refresh,
    },
  }
}
