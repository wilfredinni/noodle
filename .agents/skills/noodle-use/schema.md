# Noodle schema reference

Complete file format specifications for noodle collections. All fields, all types, all constraints.

## Request file (`.yml`)

One request per file. Fields:

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | yes | string | — | Display name for the request |
| `method` | yes | string | — | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `url` | yes | string | — | Full URL. May contain `$var` references |
| `timeout` | yes | number | `0` | Request timeout in ms. `0` = no timeout |
| `followRedirects` | no | boolean | `true` | Whether to follow HTTP redirects |
| `maxRedirects` | no | number | `5` | Maximum redirect chain length |
| `sendCookies` | no | boolean | `true` | Send matching cookies from the collection jar. `false` still captures response cookies. |
| `body_type` | no | string | `"none"` | Body encoding: `none`, `json`, `multipart`, `urlencoded`, `binary` |
| `headers` | no | map | `{}` | Request headers. Omit if empty |
| `params` | no | list | `[]` | URL query parameters. Omit if empty. See format below. |
| `path_params` | no | list | `[]` | Values for `:name` URL path tokens. Omit if empty. See format below. |
| `body` | no | string | — | Raw request body. Omit if no body |
| `form_data` | no | list | — | Multipart form entries. Omit if empty |
| `file_path` | no | string | — | Path to file for binary uploads. `@/` starts at the user's home directory |
| `auth` | no | map | — | Auth config. Omit for no auth |
| `tls` | no | map | — | Per-request TLS override. Supports only `verify: true|false` |

### Params

Array of entries. Each entry: `name` (string, required), `value` (string, required), `enabled` (boolean, default `true`).

```yaml
params:
  - name: userId
    value: $user_id
  - name: _limit
    value: "10"
  - name: disabled_param
    value: value
    enabled: false
```

Legacy map format (key: value) is still accepted on read but not recommended — prefer the array format for multi-value support with the same param name.

### Path params

Use `:name` tokens in the URL and give each token a matching entry in
`path_params`. These values are always required and sent; unlike query params,
they do not support `enabled: false`.

```yaml
url: $base_url/users/:userId
path_params:
  - name: userId
    value: $user_id
```

Noodle synchronizes path-param names with URL tokens. Values can use `$var`
references and must resolve in the active environment before sending.

### Header and param values

Two formats accepted for individual values:

**Simple string** (enabled):
```yaml
headers:
  Content-Type: application/json
```

**Disabled entry** (key is present but not sent):
```yaml
headers:
  Authorization: { value: "Bearer $token", enabled: false }
```

The simple string form is shorthand for `{ value: "...", enabled: true }`. Use the expanded form only when `enabled: false`.

Params use the dedicated array format shown above.

### Form data

Array of entries for `multipart` body type:
```yaml
form_data:
  - name: fieldName
    value: fieldValue
  - name: fileField
    value: '@/Documents/file.pdf'
    type: file
```
Each entry: `name` (string, required), `value` (string, required), `enabled` (boolean, default true), `type` (`"text"` or `"file"`, default `"text"`).

File entries and binary `file_path` support `@/relative/path` as a portable
shorthand for the current user's home directory. Quote these values because a
YAML plain scalar cannot begin with `@`. Absolute paths, ordinary relative
paths, and `$variable` paths remain supported; an environment variable may
also resolve to an `@/` path.

Keep `@/` values in collection files rather than expanding them yourself.
Noodle expands the shorthand only when it reads an upload file or writes an
output artifact such as a Postman export; those exports can reveal local home
directory paths and should be reviewed before sharing.

### Auth

| Field | Bearer | Basic | NTLMv2 | API Key | AWS SigV4 |
|-------|--------|-------|--------|---------|-----------|
| `type` | `"bearer"` | `"basic"` | `"ntlm"` | `"api_key"` | `"aws_sigv4"` |
| `token` | yes | — | — | — | — |
| `user` | — | yes | — | — | — |
| `pass` | — | yes | — | — | — |
| `username` | — | — | yes | — | — |
| `password` | — | — | yes | — | — |
| `domain` | — | — | optional | — | — |
| `workstation` | — | — | optional | — | — |
| `key` | — | — | — | yes | — |
| `value` | — | — | — | yes | — |
| `placement` | — | — | — | `"header"` (default) or `"query"` | — |
| `access_key` | — | — | — | — | yes |
| `secret_key` | — | — | — | — | yes |
| `region` | — | — | — | — | yes |
| `service` | — | — | — | — | yes |
| `session_token` | — | — | — | — | optional |

NTLM uses the connection-bound NTLMv2 challenge exchange. Proxy NTLM,
NTLMv1, Kerberos/SPNEGO negotiation, signing, sealing, and channel binding are
not supported. Keep the password in a secret environment variable rather than
literal YAML.

AWS SigV4 is added as request headers after environment substitution. It supports
text, JSON, URL-encoded, and binary bodies. Multipart bodies are rejected because
their runtime-generated boundary and bytes cannot be signed reliably in advance.
Keep credentials in secret environment variables rather than literal YAML.

#### OAuth 1.0a

```yaml
auth:
  type: oauth1
  consumer_key: $oauth1_consumer_key
  consumer_secret: $oauth1_consumer_secret
  access_token: $oauth1_access_token
  access_token_secret: $oauth1_access_token_secret
  signature_method: HMAC-SHA256
  private_key: ""
  private_key_type: text
  callback_url: ""
  verifier: ""
  timestamp: ""
  nonce: ""
  version: "1.0"
  realm: ""
  placement: header
  include_body_hash: false
```

`consumer_key`, `consumer_secret`, `access_token`, and `access_token_secret`
are strings. The token pair may be blank when the provider does not require it.
Supported `signature_method` values are `HMAC-SHA1`, `HMAC-SHA256`,
`HMAC-SHA512`, `RSA-SHA1`, `RSA-SHA256`, `RSA-SHA512`, and `PLAINTEXT`; the
default is `HMAC-SHA1`. RSA methods require `private_key`, with
`private_key_type` set to `text` or `file`. File values may be
collection-relative or use `@/` home shorthand.

`placement` is `header` by default and may be `query` or `body`. Body placement
requires a URL-encoded body. `include_body_hash: true` adds an OAuth body hash,
but multipart bodies are not supported. Blank `timestamp` and `nonce` values
are generated for each signing operation. PLAINTEXT is allowed only over HTTPS
or loopback HTTP. Noodle signs each allowed redirect leg again and removes
OAuth credentials when the origin changes.

#### OAuth 2.0

```yaml
auth:
  type: oauth2
  grant_type: authorization_code
  authorization_url: https://identity.example.com/oauth/authorize
  access_token_url: https://identity.example.com/oauth/token
  refresh_token_url: https://identity.example.com/oauth/token
  client_id: $oauth2_client_id
  client_secret: $oauth2_client_secret
  username: ""
  password: ""
  scope: openid profile
  audience: https://api.example.com
  redirect_uri: http://127.0.0.1:8765/oauth/callback
  credentials_id: example-api
  auto_fetch_token: true
  auto_refresh_token: true
  pkce: true
  pkce_method: S256
  implicit_response_type: token
  credentials_placement: body
  client_authentication: client_secret
  client_assertion_algorithm: RS256
  client_assertion_key: ""
  client_assertion_key_type: text
  client_assertion_issuer: ""
  client_assertion_subject: ""
  client_assertion_audience: ""
  client_assertion_lifetime: 300
  token_source: access_token
  token_placement: header
  token_header: Authorization
  token_prefix: Bearer
  token_query_key: access_token
  additional_parameters:
    authorization:
      - name: prompt
        value: consent
        enabled: true
        placement: query
    token: []
    refresh: []
```

| Field group | Rules |
| ----------- | ----- |
| Grant | `grant_type` is `authorization_code`, `client_credentials`, `implicit`, or `password`. Authorization code and implicit require `authorization_url`; all non-implicit grants use `access_token_url`. `refresh_token_url` is optional. |
| Resource owner | `username` and `password` apply only to the password grant. Keep the password secret. |
| Browser flow | `redirect_uri` must be a loopback HTTP URL whose path is `/oauth/callback`. Authorization code defaults to `pkce: true` and `pkce_method: S256`; `plain` is supported only for compatibility. `implicit_response_type` is `token`, `id_token`, or `token id_token`. |
| Token lifecycle | `auto_fetch_token` and `auto_refresh_token` default to `true`. `credentials_id` is an optional stable key for sharing stored token state across compatible requests. |
| Client credentials | `credentials_placement` is `body` or `basic`. `client_authentication` is `client_secret` or `client_assertion`. |
| Client assertion | Algorithms are HS, RS, PS, or ES with 256, 384, or 512 suffixes. The key may be `text` or `file`; file paths may be collection-relative or use `@/`. Issuer, subject, and audience are optional overrides. Lifetime must be a positive integer and defaults to 300 seconds. |
| Resource token | `token_source` is `access_token` or `id_token`. `token_placement` is `header` or `query`; customize `token_header`, `token_prefix`, or `token_query_key` as needed. |
| Additional parameters | `authorization` entries support query placement only. `token` and `refresh` entries support body, header, or query placement. Every entry has `name`, `value`, optional `enabled` (default `true`), and `placement`. |

OAuth endpoints require HTTPS except for loopback hosts. The TUI may open the
system browser for authorization code and implicit grants. Automation never
opens a browser, but it may reuse or refresh stored browser credentials and may
fetch client-credentials or password tokens directly. Token responses prefer
the OS credential vault and fall back to memory for the current process only;
they are never serialized to YAML.

### Binary body

When `body_type: binary`, set `file_path` to the file to upload:
```yaml
body_type: binary
file_path: '@/Documents/photo.png'
```

### Minimal valid request

```yaml
name: My Request
method: GET
url: $base_url/endpoint
timeout: 0
```

## Folder file (`folder.yml`)

Optional. Defines display name, sort order, and inheritable headers/auth for requests in that directory.

```yaml
meta:
  name: Display Name
  seq: 5
headers:
  X-Custom: custom-value
auth:
  type: bearer
  token: $TOKEN
```

All three sections (`meta`, `headers`, `auth`) are optional. Omit `meta` to use the directory name as display name. Omit `seq` to sort alphabetically. Omit `headers`/`auth` for no overrides.

### Header inheritance

Folder headers merge additively. If a request defines `Content-Type: application/json` and the folder defines `X-API-Key: $KEY`, the effective headers for the request are:
```
Content-Type: application/json
X-API-Key: $KEY
```
If both define the same key, the request's value wins. Folder value is NOT applied.

### Auth inheritance

When a request has `auth: { type: inherit }`, walk up the directory tree. Use the auth from the nearest ancestor folder that defines an auth override. Example:

```
api/
├── folder.yml          # auth: { type: bearer, token: $TOKEN }
├── users/
│   ├── folder.yml      # (no auth override)
│   └── list.yml        # auth: { type: inherit } → inherits bearer from api/
```

## Environment file (`.env`)

Dotenv format in `<collection>/.environments/<name>.env`:

```
_color=success
base_url=https://api.example.com
# @secret api_key
api_key=
# disabled_key=this_var_is_disabled
```

- `_color=<name>`: sidebar badge color. Valid: `primary`, `secondary`, `accent`, `error`, `warning`, `success`, `info`, `text`, `textMuted`, `background`, `backgroundPanel`, `backgroundElement`, `border`, `borderActive`, `borderSubtle`.
- `KEY=value`: active public variable
- `# KEY=value`: commented out = disabled variable. Noodle skips these.
- `# @secret KEY` followed immediately by a blank `KEY=`: enabled secure value. The value resolves from `process.env.KEY` first, then the OS credential vault.
- `# @secret KEY` followed by `# KEY=`: disabled secure declaration. Secret placeholders must stay blank.

## Collection settings (`settings.yml`)

Single file at collection root:
```yaml
collection_id: 123e4567-e89b-42d3-a456-426614174000
name: Payments API
description: |-
  Requests for the payments platform.
timeline_max_entries: 50
environment: development
cookies:
  enabled: true
proxy:
  mode: custom
  url: http://proxy.example:8080
  bypass:
    - localhost
    - .internal.example
  auth: true
tls:
  verify: true
  ca_bundle: ./certs/internal-roots.pem
  client_certificates:
    - host: api.internal.example
      port: 443
      cert_file: ./certs/client-chain.pem
      key_file: ./certs/client-key.pem
      secret_id: 123e4567-e89b-42d3-a456-426614174001
```

- `collection_id`: generated UUID used to keep OS-vault accounts stable when the collection moves; preserve it and do not copy one collection's ID into another
- `name`: optional display name; falls back to the collection directory name
- `description`: optional multiline collection notes
- `timeline_max_entries`: optional non-negative integer; defaults to 50, and `0` disables history
- `environment`: default active environment name; must match an env file in `.environments/`
- `cookies`: optional collection cookie policy with `enabled` (boolean). The jar is enabled by default. `false` prevents both sending and capturing jar cookies for the collection.
- `proxy`: optional collection proxy policy. Use `inherit` to follow global settings, `off` for direct connections, or `custom` with a credential-free `http` or `https` URL and optional bypass list. Settings persists `auth: true` when proxy authentication is enabled; credentials live in the OS vault. URLs containing credentials or variables are invalid.
- `tls`: optional collection TLS policy with `verify` (boolean), `ca_bundle` (PEM path), and `client_certificates` (list). Each client certificate requires an exact `host`, optional `port` (default 443), `cert_file`, `key_file`, optional generated UUID `secret_id`, and optional `enabled`. Relative paths resolve from the collection root. Enter encrypted-key passphrases in Settings; do not put them in YAML.

Settings are strict: unknown keys, wrong field types, malformed proxy/TLS
blocks, invalid cookie settings, and YAML errors fail loading and automation
runs. A missing or empty file uses defaults.

## Variable substitution rules

- Syntax: `$VARNAME` (dollar sign + word characters)
- Applied to: `url`, `headers` values, `params` values, `body`, `form_data` values, `file_path`, `auth` token/user/pass/key/value fields
- All `$var` references must resolve to a variable declared in the active environment
- Unresolved variables cause noodle to throw an error at request send time
- Multi-level substitution is NOT supported (`$VAR1` that evaluates to `$VAR2` won't be resolved again)

## Timeline file (`.timeline/<request-id>.yml`)

Response history for each request. Stored in `<collection>/.timeline/`, one file per request. Retention is controlled by `settings.yml` and defaults to 50 entries, newest first (prepended on save). Bodies larger than 10 KB are stored without truncation as gzip sidecars in `<request-id>.yml.bodies/`; their YAML field is replaced by a `bodyRef`. Treat timeline YAML and sidecars as generated, sensitive data. YAML array:

```yaml
- timestamp: 1783374564216
  envName: production
  request:
    id: posts/get-posts
    name: Get Posts
    method: GET
    url: https://api.example.com/posts
    headers: {}
    params: {}
    auth:
      type: none
  response:
    status: 200
    statusText: OK
    headers:
      content-type: application/json
    body: "[...]"
    timeMs: 56.27
    size: 27520
```

Each entry has:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | number | Unix timestamp in ms when the request was sent |
| `envName` | string | Name of the active environment when sent |
| `request` | object | Snapshot of the request at send time (id, name, method, url, headers, params, auth, body if present) |
| `id` | string | Unique entry ID, used to name large-body sidecars |
| `response` | object | Response data: `status` (number), `statusText` (string), `headers` (map), `body` (string when inline), `bodyRef` (object when sidecar-backed), `timeMs` (number), `size` (number), `sentCookies` (final request-leg name/value pairs), and `cookies` (final response `Set-Cookie` entries) |
| `error` | object | Present instead of `response` if the request failed: `{ message: string }` |

The request snapshot can likewise contain either `body` or `bodyRef`. A `bodyRef` has `{ file, encoding: "gzip", size }`; its file is relative to the request's `.yml.bodies/` directory. Declared environment secrets, proxy/TLS secrets, sensitive headers, and literal auth credentials are redacted from persisted request fields, but ordinary variables and server response fields remain intact. Agents should read timeline data but should not create, rename, or edit sidecars directly.

**Useful queries agents can answer from timeline data:**
- Average response time for a request: sum all `response.timeMs` / count
- Success rate: count entries with `response.status` in 2xx range / total count
- Recent errors: filter entries where `error` is present
- Response size trend: compare `response.size` across entries
- Which environment was used: `envName` on each entry
