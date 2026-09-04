import type { Auth, OAuth2AdditionalParameter } from "../schema"
import type { SelectItem } from "./Select"

export interface AuthFieldDef {
  row: number
  label: string
  field: string
  kind: "text" | "select" | "boolean" | "parameters"
  isSecret: boolean
  items?: SelectItem[]
  description?: string
  required?: boolean
}

const select = (values: readonly string[]): SelectItem[] =>
  values.map((value) => ({
    id: value,
    label: value
      .replaceAll("_", " ")
      .replace(/\b[a-z]/g, (character) => character.toUpperCase()),
  }))

function rows(definitions: Omit<AuthFieldDef, "row">[]): AuthFieldDef[] {
  return definitions.map((definition, index) => ({
    ...definition,
    row: index + 1,
  }))
}

const text = (
  label: string,
  field: string,
  options: Partial<Omit<AuthFieldDef, "row" | "label" | "field" | "kind">> = {},
): Omit<AuthFieldDef, "row"> => ({
  label,
  field,
  kind: "text",
  isSecret: false,
  ...options,
})

const choice = (
  label: string,
  field: string,
  values: readonly string[],
  description?: string,
): Omit<AuthFieldDef, "row"> => ({
  label,
  field,
  kind: "select",
  isSecret: false,
  items: select(values),
  description,
})

const checkbox = (
  label: string,
  field: string,
  description?: string,
): Omit<AuthFieldDef, "row"> => ({
  label,
  field,
  kind: "boolean",
  isSecret: false,
  description,
})

export function getAuthRows(auth: Auth | undefined): AuthFieldDef[] {
  if (!auth || auth.type === "none" || auth.type === "inherit") return []
  if (auth.type === "bearer") {
    return rows([
      text("Token", "token", {
        isSecret: true,
        required: true,
        description: "Bearer token sent in the Authorization header.",
      }),
    ])
  }
  if (auth.type === "basic") {
    return rows([
      text("Username", "user", {
        required: true,
        description: "Username used for HTTP Basic authentication.",
      }),
      text("Password", "pass", {
        isSecret: true,
        required: true,
        description: "Password used for HTTP Basic authentication.",
      }),
    ])
  }
  if (auth.type === "ntlm") {
    return rows([
      text("Username", "username", { required: true }),
      text("Password", "password", { isSecret: true, required: true }),
      text("Domain", "domain"),
      text("Workstation", "workstation"),
    ])
  }
  if (auth.type === "api_key") {
    return rows([
      text("Key", "key", {
        required: true,
        description: "Header or query parameter name for the API key.",
      }),
      text("Value", "value", {
        isSecret: true,
        required: true,
        description: "API key value sent with the request.",
      }),
      choice(
        "Add To",
        "placement",
        ["header", "query"],
        "Where to send the API key.",
      ),
    ])
  }
  if (auth.type === "aws_sigv4") {
    return rows([
      text("Access Key", "access_key", {
        required: true,
        description: "AWS access key ID used to identify the signer.",
      }),
      text("Secret Key", "secret_key", {
        isSecret: true,
        required: true,
        description: "AWS secret access key used to sign the request.",
      }),
      text("Region", "region", {
        required: true,
        description: "AWS region for the target service.",
      }),
      text("Service", "service", {
        required: true,
        description: "AWS service name included in the signing scope.",
      }),
      text("Session Token", "session_token", {
        isSecret: true,
        description: "Optional token for temporary AWS credentials.",
      }),
    ])
  }
  if (auth.type === "oauth1") {
    const definitions: Omit<AuthFieldDef, "row">[] = [
      text("Consumer Key", "consumer_key", {
        required: true,
        description: "Public identifier for the OAuth client.",
      }),
      text("Consumer Secret", "consumer_secret", {
        isSecret: true,
        description: "Shared secret used to sign OAuth requests.",
      }),
      text("Access Token", "access_token", {
        isSecret: true,
        description: "Token identifying the authorized user or resource.",
      }),
      text("Access Token Secret", "access_token_secret", {
        isSecret: true,
        description: "Secret paired with the access token for signing.",
      }),
      choice(
        "Signature Method",
        "signature_method",
        [
          "HMAC-SHA1",
          "HMAC-SHA256",
          "HMAC-SHA512",
          "RSA-SHA1",
          "RSA-SHA256",
          "RSA-SHA512",
          "PLAINTEXT",
        ],
        "Algorithm used to sign the request.",
      ),
    ]
    if (auth.signature_method.startsWith("RSA-")) {
      definitions.push(
        text("Private Key", "private_key", {
          isSecret: true,
          required: true,
          description: "RSA private key used for RSA signatures.",
        }),
        choice(
          "Private Key Type",
          "private_key_type",
          ["text", "file"],
          "Whether the RSA private key is text or a file path.",
        ),
      )
    }
    definitions.push(
      text("Callback URL", "callback_url", {
        description: "URL the provider redirects to during authorization.",
      }),
      text("Verifier", "verifier", {
        isSecret: true,
        description: "Verifier returned by the provider after authorization.",
      }),
      text("Timestamp", "timestamp", {
        description: "OAuth request timestamp; blank values are generated.",
      }),
      text("Nonce", "nonce", {
        isSecret: true,
        description: "Unique request value; blank values are generated.",
      }),
      text("Version", "version", {
        description: "OAuth protocol version sent in the signature.",
      }),
      text("Realm", "realm", {
        description: "Optional provider-defined realm value.",
      }),
      choice(
        "Add To",
        "placement",
        ["header", "query", "body"],
        "Where to place OAuth parameters in the request.",
      ),
      checkbox(
        "Include Body Hash",
        "include_body_hash",
        "Multipart body hashing is intentionally unavailable.",
      ),
    )
    return rows(definitions)
  }

  const browserGrant =
    auth.grant_type === "authorization_code" || auth.grant_type === "implicit"
  const grantDescription =
    auth.grant_type === "implicit" || auth.grant_type === "password"
      ? "OAuth flow used to obtain the access token. Legacy grant: prefer Authorization Code with S256 PKCE."
      : "OAuth flow used to obtain the access token."
  const definitions: Omit<AuthFieldDef, "row">[] = [
    choice(
      "Grant Type",
      "grant_type",
      ["authorization_code", "client_credentials", "implicit", "password"],
      grantDescription,
    ),
    text("Discovery URL", "discovery_url", {
      description:
        "OIDC issuer or discovery document URL used to fill missing OAuth endpoints.",
    }),
    choice(
      "Discovery URL Type",
      "discovery_url_kind",
      ["issuer", "document"],
      "Whether to derive the standard discovery path from an issuer or request the exact document URL.",
    ),
  ]
  if (browserGrant) {
    definitions.push(
      text("Authorization URL", "authorization_url", {
        required: !auth.discovery_url.trim(),
        description: "Provider endpoint used to authorize the client.",
      }),
    )
  }
  if (auth.grant_type !== "implicit") {
    definitions.push(
      text("Access Token URL", "access_token_url", {
        required: !auth.discovery_url.trim(),
        description:
          "Endpoint used to exchange credentials or an authorization code for a token.",
      }),
    )
  }
  definitions.push(
    text("Refresh Token URL", "refresh_token_url", {
      description:
        "Endpoint used to exchange a refresh token; blank uses the access token URL.",
    }),
    text("Client ID", "client_id", {
      required: true,
      description: "Public identifier for the OAuth client.",
    }),
    text("Client Secret", "client_secret", {
      isSecret: true,
      description: "Secret used to authenticate the OAuth client.",
    }),
  )
  if (auth.grant_type === "password") {
    definitions.push(
      text("Username", "username", {
        required: true,
        description: "Resource-owner username for the password grant.",
      }),
      text("Password", "password", {
        isSecret: true,
        required: true,
        description: "Resource-owner password for the password grant.",
      }),
    )
  }
  definitions.push(
    text("Scope", "scope", {
      description: "Space-separated permissions requested from the provider.",
    }),
    text("Audience", "audience", {
      description: "Optional API audience requested by the provider.",
    }),
  )
  if (browserGrant) {
    definitions.push(
      text("Redirect URI", "redirect_uri", {
        required: true,
        description: "Callback URI registered with the provider.",
      }),
    )
  }
  definitions.push(
    text("Credentials ID", "credentials_id", {
      description: "Share a securely cached token across matching requests.",
    }),
    checkbox(
      "Auto Fetch Token",
      "auto_fetch_token",
      "Fetch a token automatically before sending when none is cached.",
    ),
    checkbox(
      "Auto Refresh Token",
      "auto_refresh_token",
      "Refresh an expired token automatically when possible.",
    ),
  )
  if (auth.grant_type === "authorization_code") {
    definitions.push(
      checkbox(
        "PKCE",
        "pkce",
        "Protect authorization-code exchanges with a code verifier.",
      ),
    )
    if (auth.pkce) {
      definitions.push(
        choice(
          "PKCE Method",
          "pkce_method",
          ["S256", "plain"],
          auth.pkce_method === "plain"
            ? "How the PKCE challenge is derived from the verifier. Plain PKCE is legacy; use S256."
            : "How the PKCE challenge is derived from the verifier.",
        ),
      )
    }
  }
  if (auth.grant_type === "implicit") {
    definitions.push(
      choice(
        "Response Type",
        "implicit_response_type",
        ["token", "id_token", "token id_token"],
        "Tokens returned by the implicit grant.",
      ),
    )
  }
  if (auth.grant_type !== "implicit") {
    definitions.push(
      choice(
        "Client Authentication",
        "client_authentication",
        ["client_secret", "client_assertion"],
        "How the client authenticates at the token endpoint.",
      ),
    )
    if (auth.client_authentication === "client_secret") {
      definitions.push(
        choice(
          "Credentials Placement",
          "credentials_placement",
          ["body", "basic"],
          "Where client credentials are sent to the token endpoint.",
        ),
      )
    } else {
      definitions.push(
        choice(
          "Assertion Algorithm",
          "client_assertion_algorithm",
          [
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
          ],
          "Algorithm used to sign the client assertion.",
        ),
        text("Assertion Key", "client_assertion_key", {
          isSecret: true,
          required: true,
          description: "Key used to sign the client assertion.",
        }),
        choice(
          "Assertion Key Type",
          "client_assertion_key_type",
          ["text", "file"],
          "Whether the assertion key is text or a file path.",
        ),
        text("Assertion Issuer", "client_assertion_issuer", {
          description: "Issuer claim included in the client assertion.",
        }),
        text("Assertion Subject", "client_assertion_subject", {
          description: "Subject claim included in the client assertion.",
        }),
        text("Assertion Audience", "client_assertion_audience", {
          description: "Audience claim included in the client assertion.",
        }),
        text("Assertion Lifetime", "client_assertion_lifetime", {
          description: "Lifetime in seconds for the client assertion.",
        }),
      )
    }
  }
  definitions.push(
    choice(
      "Token Source",
      "token_source",
      ["access_token", "id_token"],
      "Which token to use when both access and ID tokens are available.",
    ),
    choice(
      "Add Token To",
      "token_placement",
      ["header", "query"],
      "Where to place the selected token on the request.",
    ),
  )
  if (auth.token_placement === "header") {
    definitions.push(
      text("Token Header", "token_header", {
        required: true,
        description: "Header name used when placing the token in a header.",
      }),
      text("Token Prefix", "token_prefix", {
        description: "Prefix added before the token in the header.",
      }),
    )
  } else {
    definitions.push(
      text("Token Query Key", "token_query_key", {
        required: true,
        description:
          "Query parameter name used when placing the token in the URL.",
      }),
    )
  }
  definitions.push(
    {
      label: "Authorization Parameters",
      field: "additional_parameters.authorization.query",
      kind: "parameters",
      isSecret: true,
      description:
        "URL-encoded name=value pairs; generated state and PKCE values win.",
    },
    {
      label: "Token Body Parameters",
      field: "additional_parameters.token.body",
      kind: "parameters",
      isSecret: true,
      description: "URL-encoded parameters added to token requests.",
    },
    {
      label: "Token Query Parameters",
      field: "additional_parameters.token.query",
      kind: "parameters",
      isSecret: true,
      description: "Query parameters added to token requests.",
    },
    {
      label: "Token Header Parameters",
      field: "additional_parameters.token.header",
      kind: "parameters",
      isSecret: true,
      description: "Headers added to token requests.",
    },
    {
      label: "Refresh Body Parameters",
      field: "additional_parameters.refresh.body",
      kind: "parameters",
      isSecret: true,
      description: "URL-encoded parameters added to refresh requests.",
    },
    {
      label: "Refresh Query Parameters",
      field: "additional_parameters.refresh.query",
      kind: "parameters",
      isSecret: true,
      description: "Query parameters added to refresh requests.",
    },
    {
      label: "Refresh Header Parameters",
      field: "additional_parameters.refresh.header",
      kind: "parameters",
      isSecret: true,
      description: "Headers added to refresh requests.",
    },
  )
  return rows(definitions)
}

export function authRowCount(auth: Auth | undefined): number {
  return getAuthRows(auth).length + 1
}

function parameterValue(
  parameters: OAuth2AdditionalParameter[],
  placement: OAuth2AdditionalParameter["placement"],
): string {
  const result = new URLSearchParams()
  for (const parameter of parameters) {
    if (parameter.enabled && parameter.placement === placement) {
      result.append(parameter.name, parameter.value)
    }
  }
  return result.toString()
}

function additionalParameterField(field: string): {
  phase: "authorization" | "token" | "refresh"
  placement: OAuth2AdditionalParameter["placement"]
} | null {
  const match = field.match(
    /^additional_parameters\.(authorization|token|refresh)\.(query|header|body)$/,
  )
  if (!match) return null
  return {
    phase: match[1] as "authorization" | "token" | "refresh",
    placement: match[2] as OAuth2AdditionalParameter["placement"],
  }
}

export function authFieldValue(auth: Auth, field: string): string {
  if (auth.type === "none" || auth.type === "inherit") return ""
  if (auth.type === "oauth2" && field === "discovery_url_kind") {
    return auth.discovery_url_kind ?? "issuer"
  }
  const additional = additionalParameterField(field)
  if (auth.type === "oauth2" && additional) {
    return parameterValue(
      auth.additional_parameters[additional.phase],
      additional.placement,
    )
  }
  const value = (auth as unknown as Record<string, unknown>)[field]
  return value === undefined ? "" : String(value)
}

export function authFieldAtRow(
  auth: Auth | undefined,
  row: number,
): AuthFieldDef | undefined {
  return getAuthRows(auth).find((definition) => definition.row === row)
}

export function authValueAtRow(auth: Auth | undefined, row: number): string {
  const definition = authFieldAtRow(auth, row)
  return auth && definition ? authFieldValue(auth, definition.field) : ""
}

export function updateAuthField(
  auth: Auth,
  field: string,
  value: string | boolean | number,
): Auth {
  if (auth.type === "none" || auth.type === "inherit") return auth
  const additional = additionalParameterField(field)
  if (auth.type === "oauth2" && additional) {
    const parameters = [...new URLSearchParams(String(value))].map(
      ([name, parameterValue]) => ({
        name,
        value: parameterValue,
        enabled: true,
        placement: additional.placement,
      }),
    )
    return {
      ...auth,
      additional_parameters: {
        ...auth.additional_parameters,
        [additional.phase]: [
          ...auth.additional_parameters[additional.phase].filter(
            (parameter) =>
              parameter.placement !== additional.placement ||
              !parameter.enabled,
          ),
          ...parameters,
        ],
      },
    }
  }
  if (auth.type === "oauth2" && field === "client_assertion_lifetime") {
    const lifetime = Number(value)
    return {
      ...auth,
      client_assertion_lifetime:
        Number.isSafeInteger(lifetime) && lifetime > 0 ? lifetime : 300,
    }
  }
  return { ...auth, [field]: value } as Auth
}
