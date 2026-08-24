---
name: noodle-use
description: Teach agents to create, organize, maintain, evaluate, import, convert, and automate noodle terminal REST client collections using supported CLI commands plus YAML and dotenv files.
---

# noodle-use

Terminal REST client. YAML files on disk. Dotenv environments. Prefer supported non-interactive automation commands; use file-level operations for richer collection edits. No Bun dependency.

## Quick routing

| Intent | Read |
|--------|------|
| Create new collection, request, folder, or environment | [workflows/create.md](workflows/create.md) |
| Configure collection metadata, history, cookies, proxy, or TLS | [workflows/create.md](workflows/create.md#configure-collection-settings) |
| Script collection discovery, validation, execution, or simple mutations | [workflows/automation.md](workflows/automation.md) |
| Refactor, rename, restructure existing collection | [workflows/organize.md](workflows/organize.md) |
| Audit collection for REST best practices and security | [workflows/evaluate.md](workflows/evaluate.md) |
| Import or export OpenAPI, Swagger, Postman, or Insomnia collections via CLI | [workflows/import.md](workflows/import.md) |
| Convert a cURL command or unsupported format at file level | [workflows/convert.md](workflows/convert.md) |
| Understand file formats, schemas, field rules | [schema.md](schema.md) |
| Understand naming conventions, ID rules, variable syntax | [reference/conventions.md](reference/conventions.md) |
| Read/write ~/.config/noodle/ settings | [reference/config.md](reference/config.md) |
| See annotated example files | [reference/examples.md](reference/examples.md) |

## Critical rules

These apply to ALL operations. Read before any workflow.

### Non-interactive CLI first
Do NOT import noodle's internal modules or run `bun`. Never run `noodle` in TUI mode; that's for humans. Use supported non-interactive commands (`workspace list`, `collection ...`, `request ...`, `environment set`, `secret ...`, `cookie ...`, `import`, and `export`) when they fully express the task. Use direct `.yml` and `.env` edits for folders, request bodies, auth, headers, params, assertions, new environment files, secret declarations, and conversions not supported by the CLI. Pass `--json` when output will be consumed programmatically.

### Variable syntax
`$VARNAME` (no braces). Regex `/\$(\w+)/g`. In request YAML it applies to `url`; enabled header values; enabled query-param names and values; `path_params` names and values; `body`; enabled `form_data` names and values; `file_path`; supported auth string fields and enabled OAuth 2 additional parameters; and string values nested inside assertion expectations. Disabled entries are preserved without substitution. Every reference that can be evaluated must have an environment declaration before the request runs.

### File extension
`.yml` NOT `.yaml`. Requests are one-per-file. Folders use `folder.yml`.

### ID convention
File at `auth/login.yml` → ID = `"auth/login"` (relative path minus `.yml`). Used for: tree navigation, file I/O, timeline storage, and UI state. Timeline YAML lives at `.timeline/auth/login.yml`; large bodies may be stored beside it in `.timeline/auth/login.yml.bodies/`. Treat both as generated, sensitive data and do not edit body references manually.

### Environment format
Dotenv-style `.env` files in `<collection>/.environments/`. `KEY=value` declares a public variable. `# KEY=value` disables it. `# @secret KEY` immediately followed by a blank `KEY=` declares an enabled secure value; use a commented blank placeholder to disable it. Secret values live in the OS credential vault, with `process.env.KEY` taking precedence. On headless Linux, the vault requires a running Secret Service provider such as GNOME Keyring or KWallet, a user D-Bus session, and an unlocked keyring collection; see the [Linux secret storage setup](https://noodlerest.dev/docs/reference/environment-format/#linux-and-headless-environments) guide when `secret set` reports that the `login` collection is unavailable. For unattended automation, prefer the same-named process environment variable or an external secret manager. `_color=<name>` sets sidebar badge color. Valid colors: primary, secondary, accent, error, warning, success, info, text, textMuted, background, backgroundPanel, backgroundElement, border, borderActive, borderSubtle.

### Folder inheritance
- `folder.yml` applies only inside its folder directory. A root-level `folder.yml` is ignored by the loader.
- Headers merge additively: folder header only applies if child request doesn't have the same header key.
- Auth: request with `type: inherit` uses nearest parent folder's auth override. Walk up the tree until a folder with an auth override is found.
- `folder.yml` format:
```yaml
meta:
  name: Display Name
  seq: 5
headers:
  X-API-Key: $API_KEY
auth:
  type: bearer
  token: $TOKEN
```
`meta` is optional. `meta.seq` controls sort order (lower = first, undefined = last). `meta.name` overrides display name (defaults to directory name).

### Collection settings
`settings.yml` at collection root supports generated `collection_id` plus optional
`name`, multiline `description`, `timeline_max_entries`, `environment`, `cookies`,
`proxy`, and `tls` fields.
Timeline retention defaults to 50 responses per request; `0` disables history.
Collection proxy mode is `inherit`, `off`, or `custom`. A custom proxy uses a
credential-free HTTP(S) URL plus an optional bypass list. Authentication is
configured in Settings; config stores only `auth: true`, while the username and
optional password live in the OS vault. URLs containing credentials or variables
are invalid. `--noproxy` overrides every saved policy for one TUI, `collection
run`, or `request run` invocation.
TLS settings support verification, a custom PEM CA bundle, and exact-host PEM
client certificates. Enter encrypted-key passphrases in Settings; config retains
only a generated `secret_id`. `--insecure` disables verification for one run.
Collection cookies are enabled by default and stored per collection. Use the
non-interactive `cookie list` command to inspect cookies plus storage warnings;
use `cookie clear` for explicit recovery because it backs up unreadable state
before resetting the jar. Plaintext fallback is mode `0600` and always reported.
Request `sendCookies: false` suppresses jar cookies on the outgoing request but
still captures response cookies. Cookie values are sensitive, and `cookie list`
includes them in both human and JSON output; never expose that output in logs.
Settings parsing is strict: malformed YAML, unknown keys, wrong types, and
invalid proxy/TLS/cookie blocks fail collection opening, auditing, and execution.

### Path safety
When creating/deleting files, only operate within the collection directory. Never create files outside the collection root. IDs must not contain `..`, leading `/`, backslashes, empty path segments, or hidden path segments.

### Authorization
Auth types: `none`, `inherit`, `bearer`, `basic`, `ntlm`, `api_key`, `aws_sigv4`, `oauth1`, `oauth2`.
- `none`: No auth. Omit the `auth` field entirely (don't write `{ type: none }`).
- `inherit`: Use parent folder's auth override. Only valid when a parent folder defines auth.
- `bearer`: `{ type: bearer, token: "$TOKEN" }`
- `basic`: `{ type: basic, user: "$USER", pass: "$PASS" }`
- `api_key`: `{ type: api_key, key: "X-API-Key", value: "$KEY", placement: "header" }`. Placement is `"header"` or `"query"`.
- `ntlm`: `{ type: ntlm, username: "$NTLM_USERNAME", password: "$NTLM_PASSWORD", domain: "$NTLM_DOMAIN", workstation: "$NTLM_WORKSTATION" }`. Domain and workstation are optional. Noodle supports connection-bound server NTLMv2 authentication only; keep the password in a secret environment variable.
- `aws_sigv4`: `{ type: aws_sigv4, access_key: "$AWS_ACCESS_KEY_ID", secret_key: "$AWS_SECRET_ACCESS_KEY", region: "us-east-1", service: "execute-api", session_token: "$AWS_SESSION_TOKEN" }`. `session_token` is optional. Signing uses headers and supports text, JSON, URL-encoded, and binary bodies; multipart is not supported.
- `oauth1`: Start with `{ type: oauth1, consumer_key: "$OAUTH1_CONSUMER_KEY", consumer_secret: "$OAUTH1_CONSUMER_SECRET", access_token: "$OAUTH1_ACCESS_TOKEN", access_token_secret: "$OAUTH1_ACCESS_TOKEN_SECRET", signature_method: "HMAC-SHA1", placement: "header" }`. Supported methods are HMAC-SHA1/256/512, RSA-SHA1/256/512, and PLAINTEXT. Placement is `header`, `query`, or `body`; body placement requires URL-encoded form data. RSA keys may be inline text or a collection-relative or `@/` file path.
- `oauth2`: Start with `{ type: oauth2, grant_type: authorization_code, authorization_url: "https://identity.example/authorize", access_token_url: "https://identity.example/token", client_id: "$OAUTH2_CLIENT_ID", client_secret: "$OAUTH2_CLIENT_SECRET", scope: "openid profile", redirect_uri: "http://127.0.0.1:8765/oauth/callback" }`. Supported grants are `authorization_code`, `client_credentials`, `implicit`, and `password`; authorization code defaults to S256 PKCE. Read [schema.md](schema.md) before authoring advanced token, client assertion, or additional-parameter fields.

Keep OAuth consumer secrets, token secrets, client secrets, passwords, and private signing keys in secret environment variables. OAuth 2 token responses live in the OS credential vault, with a session-only memory fallback if the vault is unavailable; never write tokens, authorization codes, PKCE verifiers, or generated state into collection files. Browser authorization is a TUI-only human workflow. Non-interactive `request run` and `collection run` may reuse or refresh stored browser credentials, and may acquire client-credentials or password tokens directly, but never open a browser.

Noodle cannot generate client-code snippets for NTLM, AWS SigV4, OAuth 1.0a, or OAuth 2.0 requests. Keep these requests in the collection and run them with noodle instead.
