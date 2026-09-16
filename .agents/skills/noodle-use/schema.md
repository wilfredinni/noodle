# Noodle schema reference

Complete file format specifications for noodle collections. All fields, all types, all constraints.

## Request file (`.yml`)

One request per file. Fields:

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | yes | string | n/a | Display name for the request |
| `method` | yes | string | n/a | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `url` | yes | string | n/a | Full URL. May contain `$var` references |
| `timeout` | yes | number | `0` | Request timeout in ms. `0` = no timeout. Expiry is a transport failure. |
| `tags` | no | list of strings | n/a | Case-sensitive suite tags. Every item must be non-empty and already trimmed. |
| `followRedirects` | no | boolean | `true` | Follow redirects with downgrade and cross-origin secret protections |
| `maxRedirects` | no | number | `5` | Maximum redirect chain length |
| `sendCookies` | no | boolean | `true` | Send matching cookies from the collection jar. `false` still captures response cookies. |
| `body_type` | no | string | `"none"` | Body encoding: `none`, `json`, `xml`, `multipart`, `urlencoded`, `binary` |
| `headers` | no | map | `{}` | Request headers. Omit if empty |
| `params` | no | list | `[]` | URL query parameters. Omit if empty. See format below. |
| `path_params` | no | list | `[]` | Values for `:name` URL path tokens. Omit if empty. See format below. |
| `body` | no | string | n/a | Raw request body. Omit if no body |
| `form_data` | no | list | n/a | Multipart form entries. Omit if empty |
| `file_path` | no | string | n/a | Path to file for binary uploads. `@/` starts at the user's home directory |
| `auth` | no | map | n/a | Auth config. Omit for no auth |
| `tls` | no | map | n/a | Per-request TLS override. Supports only `verify: true|false` |
| `scripts` | no | map | n/a | Optional string-valued inline `pre` and `post` phases |
| `capture` | no | map | None | Response expressions captured as run-scoped variables |
| `assert` | no | list | None | Response assertions evaluated by manual TUI sends and non-interactive run commands |

Noodle rejects HTTPS-to-HTTP redirects. On an origin change it disables request
auth, strips sensitive headers and headers containing known secret values, and
refuses a redirect that would preserve a body containing a known secret.
Redirect responses that switch to `GET` and discard the body may continue.
Caller-triggered cancellation propagates instead of being reported as a timeout.

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

Legacy map format (key: value) is still accepted on read but not recommended. Prefer the array format for multi-value support with the same param name.

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

<a id="inline-pre-request-script"></a>

### Inline request scripts

An optional `scripts` mapping accepts string-valued `pre` and/or `post` members.
Empty mappings, unknown members, and non-string sources are invalid. Empty
strings are valid no-ops. Standalone external-path-looking sources are rejected
with a phase-specific explanation; Noodle never resolves or reads script files.
Canonical YAML preserves source whitespace in literal blocks ordered pre then
post immediately before `capture` and `assert`:

```yaml
scripts:
  pre: |-
    const timestamp = new Date().toISOString();
    const body = request.body.json();
    request.body.setJson({ ...body, timestamp });
    request.headers.set(
      "X-Signature",
      crypto.hmacSha256(env.get("SIGNING_SECRET"), request.body.text(), "hex"),
    );
    run.set("request_nonce", crypto.randomBytes(16, "base64"));
  post: |-
    if (response.status === 201) {
      run.set("event_id", response.json().id);
    }
```

Script source is never variable-substituted. Pre runs synchronously
after folder overrides and one substitution pass, but before HTTP. Request and
RunScope changes are staged and all are discarded on an uncaught script
failure. On complete success, request mutations apply only to the in-memory
prepared copy and RunScope changes commit before HTTP. Those RunScope changes
remain available to later requests in the same collection run even when HTTP,
transport, capture, post, or assertion handling subsequently fails. A later
capture can overwrite a script value. Manual sends and `request run` use fresh
scopes.

The complete order is folder merge, environment/RunScope overlay, one
substitution pass, pre, HTTP, capture commits, post, assertions. Assertion
expectations keep the original substitution pass, not a second pass after post.
Post runs once for every completed response, including HTTP and capture errors,
but never for intermediate redirects/auth challenges or transport failures. It
sees successful captures. A post error preserves the response, captures, and
earlier successful writes, retains logs, rolls back only that invocation's
staged RunScope/cookie changes, and still evaluates assertions. Successful post
RunScope writes reach later collection requests even if assertions fail. Capture
persistence remains manual/`request run` only and still applies after later
post/assertion failures. Script writes are transient unless they explicitly
request persistence on a manual send or `request run`.

Public API:

| Global | Members |
| --- | --- |
| `request` | `url: string` and `method: Method`; read/write in pre, read-only in post |
| `request.headers` | `get(name)`, `has(name)`, `set(name, value)`, `delete(name)` |
| `request.params` | `get(name)`, `getAll(name)`, `set(name, value)`, `append(name, value)`, `delete(name)` |
| `request.body` | `text()`, `json()`, `setText(value)`, `setJson(value)`, `clear()` |
| `request.auth` | `clear()`, `setBearer(token)`, `setBasic(username, password)`, `setApiKey(key, value, placement)` |
| `env` | `get(name)` |
| `run` | `get(name)`, `set(name, value, options?)`, `unset(name, options?)`; options: `{ persist: "environment" \| "secret" }` |
| `crypto` | `sha256(value, encoding)`, `hmacSha256(secret, value, encoding)`, `randomBytes(size, encoding)` |
| `console` | `log(...values)`, `info(...values)`, `warn(...values)`, `error(...values)` |
| `response` (post only) | Read-only `status`, `statusText`, `timeMs`; `headers.get(name)`, `headers.has(name)`, `text()`, `json()` |
| `cookies` (post only, when available) | `get(name)`, `set(input)`, `delete(name)` |

The existing pre APIs are unchanged. In post, request readers reflect the final
Noodle-prepared HTTP leg after signing and cookie/header preparation: effective
URL, method, query parameters and headers. Every request mutator, including
URL/method assignment, centrally throws a clear read-only API error. Host
objects, streams, Bun types and upload buffers are never exposed.

Both phases may pass `{ persist: "environment" }` or `{ persist: "secret" }` to
`run.set` and `run.unset`. Set creates or updates a stored value using capture
serialization; unset removes an ordinary entry or both a secret's vault value
and declaration. CLI `secret delete` still retains its declaration. Missing
deletions are harmless. Environment operations reject declared secrets; secret
set may promote ordinary variables, but secret unset cannot delete them. Empty
secret values and reserved `_color` names are rejected.

Manual sends and `request run` require an existing active environment and honor
persistence. Collection runs and the TUI Runner apply only runtime changes and
report persistence as transient. No options retain existing behavior.
`env.get` keeps its initial snapshot, including resolved secrets; `run.get`
sees current staged/committed scope writes. Persistent unset suppresses the
baseline variable for the remaining run until a successful set or capture;
plain unset removes only the override. There is no second substitution pass.

Script success commits runtime changes before asynchronous host persistence.
Pre persistence precedes HTTP; existing capture saves precede post persistence,
so an explicit post intent wins durably. The latest explicit intent per key
within a phase wins, and later transient writes do not change its saved-value
snapshot. VM failure discards the phase's intents. Persistence failure attempts
storage rollback, retains successful runtime/request/cookie changes, reports
redacted per-operation errors, and makes automation fail in the script category
without skipping remaining phases. Secrets never use plaintext fallback.
Staging permits 100 distinct keys and a 256 KiB combined serialized intent batch
per invocation; host storage runs outside the 500 ms VM deadline.

Response header reads are case-insensitive and missing headers return null.
Timing is milliseconds. `response.text()` lazily transfers the original VM
string without truncation, capped at 5 MiB of UTF-8 before copying.
`response.json()` uses the captured native VM JSON parser and caches success or
failure per invocation; JSON null is preserved. The text cap applies when either
body reader is called, not to metadata-only post processing. Invalid JSON is a
structured `ScriptApiValidationError`. Cached JSON objects belong only to that
invocation, not the host response or the capture/assertion resolver. Ordinary
bridge and RunScope values still obey the 256 KiB/depth-32 limits, so extract
small fields instead of copying an entire large response into `run.set`. VM allocation and
deadline failures remain resource errors rather than invalid-JSON API errors;
later invocations use fresh runtimes.

`cookies` is absent when the jar is disabled/unavailable or `sendCookies: false`.
Response Set-Cookie processing happens before post, even under request
suppression. `get(name)` returns the first applicable matching value in
tough-cookie order or null. `delete(name)` removes all applicable same-name
cookies and preserves inaccessible matches. `set(input)` requires string `name`
and `value`, optional applicable string `path`, optional ISO 8601 date-time
string `expires`, optional boolean `secure` and `httpOnly`, and optional
`sameSite: strict|lax|none`. Unknown attributes, including `domain`, are invalid.
Cookies are host-only for the final effective URL; omitted path uses normal
default-path rules, omitted expiry means session lifetime, and past expiry is
allowed. Prefix validation and secure-origin rules reuse tough-cookie,
including [localhost treatment](https://github.com/salesforce/tough-cookie#potentially-trustworthy-origins-are-considered-secure).
There is no browser-navigation SameSite context. A complete batch is revalidated
against the current jar before synchronous publication with RunScope writes.
Successful operations enter the existing journal and retain deferred saves,
locking, encryption, and storage warnings. Success does not promise immediate
disk durability. Applicable, received, read, staged, overwritten, and deleted
values are registered for redaction even on failure; short values can over-mask
otherwise public output.

Header names are case-insensitive. `set` preserves the first matching key's
casing and position while removing duplicate case variants; `delete` removes
all case variants. Parameter names are case-sensitive. Parameter operations
affect only enabled declarations, preserve duplicate order, leave disabled
declarations untouched, and append new entries at the end.

`body.text()` returns JSON, XML, or raw text, and returns null for absent,
multipart, URL-encoded, or binary bodies. `body.json()` parses the current
textual body and throws for absent or invalid JSON. `setText`, `setJson`, and
`clear` replace incompatible body, form-data, and file fields. `setJson` stores
compact JSON with `body_type: json`; `clear` sets `body_type: none`.

Auth helpers replace the complete prepared auth config. `setApiKey` placement
is `header` or `query`. Auth arguments, HMAC secrets, and generated random
values are known secrets. `env.get` reads only the selected environment and
never RunScope overrides. `env` and `run` names match `^\w+$` and reject unsafe
prototype names. `run.set` accepts only bounded JSON-compatible values. Crypto
inputs are UTF-8 strings; encoding is exactly `hex` or `base64`; random size is
an integer from 0 through 4096.

The sandbox uses a fresh QuickJS runtime and context for each script with these
fixed limits:

| Limit | Value |
| --- | ---: |
| Execution deadline | 500 ms |
| QuickJS runtime memory | 32 MiB |
| QuickJS stack | 512 KiB |
| UTF-8 source | 256 KiB |
| Console entries | 100 |
| Combined console text | 64 KiB |
| Random bytes per call | 4 KiB |
| One bridged value | 256 KiB |
| Response text, UTF-8 | 5 MiB |
| Bridged JSON depth | 32 |
| Console serialization depth | 4 |

The shared WASM memory is fixed at 64 MiB. Bun, process, filesystem, shell,
network, timer, worker, module-loader, and other host APIs are absent. Static
and dynamic imports, returned Promises, queued jobs, and other async execution
are unsupported. Bridged objects must be plain or null-prototype JSON without
cycles, unsafe keys, non-finite numbers, or unsupported members.

Treat collections containing scripts as trusted code. `env.get` can read
selected-environment secrets, and a script can place them in the prepared URL,
headers, or body that Noodle sends immediately afterward.

Requests with scripts return `scripts: { evaluated, results }` containing only
executed results in pre/post order with `phase: pre|post`, `scope: request`, `sourceKind: inline`, `success`,
`durationMs`, redacted `logs`, an optional normalized error, and optional
`persistence` outcomes with variable, target, operation, status
(`saved|transient|failed`), and redacted errors only. `success` records VM
execution; persistence failures also fail the overall request. Preparation
failures before script execution use `evaluated: false`; requests without a
script omit the group. Human run output distinguishes Pre-script/Post-script
and never prints logs. TUI Results uses Pre-request/Post-response rows with
expandable logs and phase-specific error locations. Script failures participate
in the fixed failure-category order and collection continuation/fail-fast only
after available response diagnostics finish. No Console panel or script editor
is added. Script source,
status, and logs are never stored in `.timeline`, while a successful manual
timeline request snapshot reflects the prepared request mutations.

### Response captures

An optional `capture` mapping assigns response expressions to run variables and
can persist successful captures during an individual run:

```yaml
capture:
  user_id:
    value: body.user.id
  access_token:
    value: body.access_token
    persist: secret
  optional_trace:
    value: headers.x-trace
    enabled: false
```

Variable names must match `^\w+$`. Expressions use the same grammar as
assertions and are validated while loading the request, before it can be sent.
Duplicate mapping keys are invalid YAML. Capture expressions themselves are
never variable-substituted.

Every entry must be an object with required string `value`, optional
`persist: secret|environment`, and optional boolean `enabled`. Unknown fields,
invalid persistence values, and scalar shorthand are rejected. Omitted
`enabled` normalizes to `true`; canonical YAML uses multiline fields ordered
`value`, `persist`, then `enabled` and omits transient persistence and
`enabled: true`. Disabled declarations are still validated while loading but
produce no result, failure, summary count, RunScope mutation, or write.

Environment values and resolved declared secrets load first. RunScope values
then override same-named values, and the latest successful capture or script
write wins. String values substitute verbatim. Numbers, booleans, null, arrays,
and objects use `JSON.stringify()`. Missing is a failed capture that creates no
binding; explicit JSON null is a successful value that substitutes as `null`.

Captures are evaluated after the response arrives and before post and assertions.
Every successful result commits, even when another capture, the HTTP status, or
a later post script or assertion fails. Failed recaptures leave the prior
successful value unchanged. Captures are visible to the same request's post
script and later requests, but never change the already-sent request or
resubstitute assertion expectations. A capture failure fails the request and
command, but a collection run continues in collection order.

One scope exists for each top-level `request run`, `collection run`, or manual
TUI send. Transient values are discarded when it returns and never modify
request YAML, collection settings, or timeline history. During manual TUI sends
and CLI `request run`, a successful `persist: environment` capture overwrites
and enables a plaintext value but refuses to replace a declared secret;
`persist: secret` stores the value in the OS vault and leaves only its blank
secret declaration in `.env`. The active or `--env`/settings environment is
required. Persistence runs sequentially in declaration order, keeps partial
successes, and a failed write fails the capture without discarding the HTTP
response. CLI `collection run` and the TUI Runner ignore persistence and keep
the shared scope transient. Secret capture values and values captured from
sensitive response headers are always fully redacted from capture results,
including collection runs.

### Response assertions

An optional `assert` list validates responses from manual TUI sends and
non-interactive `request run` and `collection run` commands. A failed assertion
makes the request and command fail. An HTTP status of 400 or higher also fails
the run even if a status assertion passes. TUI results appear beside the
response and in redacted timeline assertion history.

```yaml
assert:
  - expression: status
    operator: equals
    value: 200
  - expression: body.users[0].id
    operator: isNumber
  - expression: headers.Content-Type
    operator: contains
    value: application/json
  - expression: response.time
    operator: lt
    value: 500
    enabled: false
```

Each assertion accepts optional boolean `enabled`; omitted means `true` and is
omitted from canonical YAML. Disabled assertions remain validated and visible
for authoring, but are not substituted, evaluated, or included in results,
failures, summaries, or timeline assertion outcomes.

Expressions are `status`, `response.time`, `headers.<name>` with
case-insensitive header lookup, or `body` followed by dot properties and array
indexes. `body` by itself addresses the entire JSON value. Dot-property names
must start with a letter or underscore and may then contain letters, digits,
underscores, or hyphens. Brackets accept only non-negative array indexes;
quoted property access such as `body["user.name"]` is not supported. Body
expressions require valid JSON.

Operators without `value`: `exists`, `notExists`, `isString`, `isNumber`,
`isBoolean`, `isArray`, `isObject`, `isNull`, `notNull`.

Operators with a JSON-compatible `value`: `equals`, `notEquals`, `gt`, `gte`,
`lt`, `lte`, `contains`, `notContains`, `matches`. Numeric comparisons require
finite numbers and never coerce strings. JSON numbers use JavaScript number
semantics, so integers beyond the safe-integer range can lose precision. String
comparisons and containment are case-sensitive. Equality is typed recursive
equality with no coercion: arrays must have the same values in the same order,
while object key order does not matter. Array containment searches for one
deeply equal member; object values support equality, existence, and type checks
but not ordering or substring operators. A missing path is distinct from a
present `null`: only `notExists` matches the former, while `isNull`, `notNull`,
and equality apply to the latter. `matches` uses an unanchored JavaScript regular
expression with no flags unless the pattern contains its own anchors. Patterns
may be at most 1000 characters and reject backreferences, groups, alternation,
braced quantifiers, and unsafe repetition. `response.time` is measured in
milliseconds.

String values recursively support `$VARNAME` substitution; expressions and
operators do not. Known secret values are redacted from both expected and actual
run results. Arbitrary server values remain visible, so treat assertion results
as sensitive response data.

### Declarative execution order

Every manual send and automation request follows this order:

1. Merge folder overrides.
2. Overlay the current RunScope for substitution.
3. Substitute the request once.
4. Run the request-level pre-script against a staged prepared copy.
5. Commit successful script request and RunScope mutations.
6. Send the prepared request.
7. Evaluate and commit captures in declaration order.
8. Execute post using committed captures and the final prepared request; commit
   successful transient RunScope and URL-scoped cookie changes together.
9. Evaluate assertions against the same response views, including after post failure.

Manual sends and `request run` use isolated scopes. `collection run` and the TUI
Runner share one scope across selected requests in collection order after target
and tag filtering. HTTP/capture errors still reach post; post errors still reach assertions;
transport failures have no response views to evaluate.

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
| `token` | yes | n/a | n/a | n/a | n/a |
| `user` | n/a | yes | n/a | n/a | n/a |
| `pass` | n/a | yes | n/a | n/a | n/a |
| `username` | n/a | n/a | yes | n/a | n/a |
| `password` | n/a | n/a | yes | n/a | n/a |
| `domain` | n/a | n/a | optional | n/a | n/a |
| `workstation` | n/a | n/a | optional | n/a | n/a |
| `key` | n/a | n/a | n/a | yes | n/a |
| `value` | n/a | n/a | n/a | yes | n/a |
| `placement` | n/a | n/a | n/a | `"header"` (default) or `"query"` | n/a |
| `access_key` | n/a | n/a | n/a | n/a | yes |
| `secret_key` | n/a | n/a | n/a | n/a | yes |
| `region` | n/a | n/a | n/a | n/a | yes |
| `service` | n/a | n/a | n/a | n/a | yes |
| `session_token` | n/a | n/a | n/a | n/a | optional |

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
  discovery_url: https://identity.example.com
  authorization_url: ""
  access_token_url: ""
  refresh_token_url: ""
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
| Grant and endpoints | `grant_type` is `authorization_code`, `client_credentials`, `implicit`, or `password`. `discovery_url` defaults to an OIDC issuer; set `discovery_url_kind: document` to request that exact discovery-document URL. Explicit `authorization_url` and `access_token_url` values win; `refresh_token_url` is optional and otherwise uses the token endpoint. |
| Resource owner | `username` and `password` apply only to the password grant. Keep the password secret. |
| Browser flow | `redirect_uri` must be a loopback HTTP URL whose path is `/oauth/callback`. Authorization code defaults to `pkce: true` and `pkce_method: S256`; `plain` is supported only for compatibility. `implicit_response_type` is `token`, `id_token`, or `token id_token`. |
| Token lifecycle | `auto_fetch_token` and `auto_refresh_token` default to `true`. `credentials_id` is an optional stable key for sharing stored token state across compatible requests. |
| Client credentials | `credentials_placement` is `body` or `basic`. `client_authentication` is `client_secret` or `client_assertion`. |
| Client assertion | Algorithms are HS, RS, PS, or ES with 256, 384, or 512 suffixes. The key may be `text` or `file`; file paths may be collection-relative or use `@/`. Issuer, subject, and audience are optional overrides. Lifetime must be a positive integer and defaults to 300 seconds. |
| Resource token | `token_source` is `access_token` or `id_token`. `token_placement` is `header` or `query`; customize `token_header`, `token_prefix`, or `token_query_key` as needed. |
| Additional parameters | `authorization` entries support query placement only. `token` and `refresh` entries support body, header, or query placement. Every entry has `name`, `value`, optional `enabled` (default `true`), and `placement`. |

OAuth discovery and resolved endpoints require HTTPS except for loopback hosts. The TUI may open the
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

### XML body

XML bodies are sent unchanged. Noodle adds `Content-Type: application/xml`
when no enabled Content-Type header exists; set an explicit header for MIME
types such as `text/xml` or `application/soap+xml`.

```yaml
body_type: xml
body: |-
  <request>
    <id>$request_id</id>
  </request>
```

### Minimal valid request

```yaml
name: My Request
method: GET
url: $base_url/endpoint
timeout: 0
```

## Folder file (`folder.yml`)

Optional. Defines display name, sort order, suite tags, and inheritable headers/auth for requests in that directory.

This file applies only when it is inside a child directory. A `folder.yml` at
the collection root is ignored and cannot provide collection-wide headers,
authentication, metadata, or ordering.

```yaml
meta:
  name: Display Name
  seq: 5
tags:
  - smoke
  - users
headers:
  X-Custom: custom-value
auth:
  type: bearer
  token: $TOKEN
```

All four sections (`meta`, `tags`, `headers`, `auth`) are optional. Omit `meta` to use the directory name as display name. Omit `seq` to sort alphabetically. Omit `headers`/`auth` for no overrides.

### Tag inheritance

Tags are case-sensitive, non-empty, trimmed strings. A request's effective tags
are the set union of its own `tags` and the `tags` from every ancestor folder.
Duplicates have no additional effect, and a descendant cannot remove an
inherited tag. A root-level `folder.yml` is ignored, including its tags.

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
- Public, disabled, and secret keys must match `^\w+$`; `_color` is reserved.
- Values preserve everything after the first `=` exactly, including trailing spaces.

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
- Escape: `$$` emits one literal dollar, so `$$NAME` emits literal `$NAME` and
  `$$$NAME` emits `$` followed by the resolved value of `NAME`
- Applied to: `url`; enabled header values; enabled `params` names and values;
  `path_params` names and values; `body`; enabled `form_data` names and values;
  `file_path`; supported auth credential, endpoint, identifier, key, path, and
  enabled OAuth 2 additional-parameter string fields; and string values nested
  recursively inside assertion expectations. Capture expressions are not
  substituted
- Disabled headers, query params, form entries, and OAuth 2 additional parameters
  are preserved without substitution until enabled
- Every evaluated `$var` reference must resolve in the active environment or the current automation RunScope
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
| `assertions` | object | Optional redacted manual-send assertion group: `{ evaluated: boolean, results: AssertionResult[] }` |

The request snapshot can likewise contain either `body` or `bodyRef`. A `bodyRef` has `{ file, encoding: "gzip", size }`; its file is relative to the request's `.yml.bodies/` directory. Declared environment, proxy, and TLS secrets; substituted and literal credentials; cookie credentials; known captured secrets; and assertion result metadata are recursively redacted from request and response history. Sensitive response headers such as `Set-Cookie` are field-masked, and redaction at save time also covers compressed request and response sidecars. Marking or updating a secret does not rewrite existing history. Unknown server data can remain visible, so timeline files are sensitive. Capture declarations, capture results, and RunScope values are never stored in timeline entries, and non-interactive run commands do not create timeline history. Agents should read timeline data but should not create, rename, or edit sidecars directly.

**Useful queries agents can answer from timeline data:**
- Average response time for a request: sum all `response.timeMs` / count
- Success rate: count entries with `response.status` in 2xx range / total count
- Recent errors: filter entries where `error` is present
- Response size trend: compare `response.size` across entries
- Which environment was used: `envName` on each entry
