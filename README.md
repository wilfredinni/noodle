# <img src="assets/logo.png" data-canonical-src="/logo.png" width="32" height="32" /> noodle

## Your API client should live with your code.

Noodle is a fast, keyboard-first HTTP client for the terminal. Requests stay as
readable YAML files in your repository. They are easy to review, share,
automate, and keep long after the tool is gone.

No cloud account. No workspace sync. No proprietary format.

![Noodle terminal interface](assets/noodle.png)

<p align="center">
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/"><strong>Get started</strong></a> ·
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a> ·
  <a href="https://github.com/wilfredinni/noodle/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://app.notion.com/p/39128d9edba9809da834f351332baf57?v=39228d9edba98042ad07000cdbe5d751&source=copy_link">Roadmap</a>
</p>

## API work without the workspace gravity

Most API clients want to become the place your work lives. Noodle takes the
opposite approach: your repository is the source of truth.

- **Requests you can read.** One small `.yml` file per request. Diff it, review
  it, copy it, or edit it with any text editor.
- **A workflow that travels.** Open the same collection in the TUI, run it from
  the CLI, or hand it to an agent without translating it first.
- **Your data stays yours.** Noodle works from local files and stores declared
  secrets in your operating system's credential vault.
- **No clean-slate migration.** Bring in OpenAPI, Swagger, Postman, or Insomnia
  collections and export to OpenAPI or Postman when you need to leave.

## From first request to repeatable workflow

Install Noodle:

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

Create a collection and make your first request:

```bash
noodle collection create my-api
noodle request create users/get \
  --url https://api.example.com/users/42 \
  --collection ./my-api
noodle --collection ./my-api
```

What you edit in the terminal is simply a file:

```yaml
name: Get User
method: GET
url: $base_url/users/:userId
path_params:
  - name: userId
    value: $user_id
headers:
  Accept: application/json
```

Commit it beside the code it exercises. Teammates get the request, its folder
structure, and its shared configuration through the same workflow they already
use for everything else.

Prefer Homebrew?

```bash
brew tap wilfredinni/noodle
brew trust wilfredinni/noodle
brew install noodle
```

[See every installation option →](https://noodlerest.dev/docs/getting-started/installation/)

## Made for the whole API loop

### Explore without leaving the terminal

Edit URLs, parameters, headers, authentication, and bodies inline. Jump between
panes from the keyboard, switch environments in a keystroke, search large
collections, and choose from more than 30 themes.

![Variable completion in Noodle](assets/autocomplete.png)

### See what actually happened

Inspect formatted bodies and headers, filter JSON with JSONPath, follow the
network trace across redirects and proxies, and revisit previous responses in
the per-request timeline.

![Response timeline in Noodle](assets/timeline.png)

### Share configuration, not secrets

Use environment variables for development, staging, and production. Mark
sensitive values as secrets and Noodle keeps them out of environment files,
request history, generated code, search results, and exports.

![Secret management in Noodle](assets/secrets.png)

### OAuth 1.0a and OAuth 2.0

OAuth is first-class request and folder authentication. Keep credentials in
environment secrets and reference them with `$VARNAME`; generated OAuth 2
state, PKCE verifiers, authorization codes, and cached tokens are never written
to request YAML.

OAuth 1.0a supports HMAC, RSA, and PLAINTEXT signatures plus header, query, or
URL-encoded body placement:

```yaml
auth:
  type: oauth1
  consumer_key: $oauth1_consumer_key
  consumer_secret: $oauth1_consumer_secret
  access_token: $oauth1_access_token
  access_token_secret: $oauth1_access_token_secret
  signature_method: HMAC-SHA256 # HMAC-SHA1/512, RSA-SHA1/256/512, PLAINTEXT
  private_key: "" # PEM text, collection-relative path, or @/ home path for RSA
  private_key_type: text # text or file
  callback_url: ""
  verifier: ""
  timestamp: "" # blank generates a value
  nonce: "" # blank generates a value
  version: "1.0"
  realm: ""
  placement: header # header, query, or body
  include_body_hash: false
```

OAuth 2.0 supports authorization code, client credentials, implicit, and
password grants. Authorization code defaults to S256 PKCE, following
[current OAuth security guidance](https://www.rfc-editor.org/rfc/rfc9700.html):

```yaml
auth:
  type: oauth2
  grant_type: authorization_code
  authorization_url: https://identity.example.com/oauth/authorize
  access_token_url: https://identity.example.com/oauth/token
  refresh_token_url: https://identity.example.com/oauth/token
  client_id: $oauth2_client_id
  client_secret: $oauth2_client_secret
  username: "" # password grant only
  password: "" # password grant only
  scope: openid profile
  audience: https://api.example.com
  redirect_uri: http://127.0.0.1:8765/oauth/callback
  credentials_id: example-api # optional secure-token sharing key
  auto_fetch_token: true
  auto_refresh_token: true
  pkce: true
  pkce_method: S256 # S256 or legacy plain
  implicit_response_type: token # token, id_token, or "token id_token"
  credentials_placement: body # body or basic
  client_authentication: client_secret # client_secret or client_assertion
  client_assertion_algorithm: RS256 # HS, RS, PS, and ES 256/384/512
  client_assertion_key: ""
  client_assertion_key_type: text # text or file
  client_assertion_issuer: ""
  client_assertion_subject: ""
  client_assertion_audience: ""
  client_assertion_lifetime: 300
  token_source: access_token # access_token or id_token
  token_placement: header # header or query
  token_header: Authorization
  token_prefix: Bearer
  token_query_key: access_token
  additional_parameters:
    authorization:
      - name: prompt
        value: consent
        enabled: true
        placement: query
    token: [] # body, query, or header placement
    refresh: [] # body, query, or header placement
```

Authorization-code and implicit sends in the TUI open the system browser and
receive the result on the configured loopback callback, following the
[native-app browser and loopback guidance](https://www.rfc-editor.org/rfc/rfc8252.html).
The implicit and
password grants, plus plain PKCE, are retained for compatibility but are
legacy; prefer authorization code with S256 PKCE. Non-interactive commands
never open a browser: they may reuse or refresh stored browser credentials,
while client-credentials and password grants may fetch a token directly.

OAuth 2 token responses live in the operating system credential vault. If the
vault is unavailable, Noodle keeps the token in memory for the current session
and reports a warning; it never writes plaintext OAuth tokens. Use the command
palette to fetch/authorize, copy, or clear the current OAuth 2 token. OAuth 1
signatures and OAuth 2 cached state are intentionally excluded from generated
client code and exports.

### Automate the work you already explored

Every collection can be inspected, audited, formatted, and run without opening
the TUI. Commands support structured JSON output, so the same requests work in
scripts, CI, and agent workflows.

```bash
noodle request run users/get --collection ./my-api --env staging
noodle collection audit ./my-api --json
noodle collection run ./my-api --json
```

Noodle keeps one cookie jar per collection. Inspect it with
`noodle cookie list --collection ./my-api`; JSON output includes the storage
state, any non-fatal warnings, and each cookie's host-only scope. If the OS
credential vault is unavailable, Noodle uses a mode-`0600` plaintext file and
reports a persistent warning. Unreadable or corrupt storage is never replaced
automatically: requests continue without jar cookies, and an explicit
`noodle cookie clear --collection ./my-api` preserves the original as a backup
before resetting the jar.

[Explore the CLI →](https://noodlerest.dev/docs/getting-started/cli/)

## Bring your existing work

Import an OpenAPI 3.0 or Swagger 2.0 specification, a Postman collection, or an
Insomnia export:

```bash
noodle import ./specs/api.yaml --output ./collections
```

You can also export a collection to OpenAPI or Postman, so adopting Noodle is a
choice, not a trap.

[Learn about imports and exports →](https://noodlerest.dev/docs/)

## Built for people and agents who work in repositories

Because Noodle collections are plain files with a non-interactive CLI, coding
agents can create, organize, audit, and run them without screen scraping or a
hosted integration.

Install the `noodle-use` skill:

```bash
npx skills add wilfredinni/noodle --skill noodle-use -g
```

Then ask your agent to:

- “Scaffold a Noodle collection for this API.”
- “Audit these requests for security issues and REST best practices.”
- “Convert this Insomnia export into a Noodle collection.”

[Use Noodle with AI agents →](https://noodlerest.dev/docs/guides/ai-agent-skills/)

## Dive deeper

- [Quick start](https://noodlerest.dev/docs/getting-started/quick-start/)
- [Documentation](https://noodlerest.dev/docs/)
- [CLI reference](https://noodlerest.dev/docs/getting-started/cli/)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)

## Contributing

Noodle is built with Bun, TypeScript, React, and OpenTUI. To run it locally:

```bash
bun install
bun run dev -- --collection ./collections --env development
```

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and test commands.

Apache-2.0 licensed.
