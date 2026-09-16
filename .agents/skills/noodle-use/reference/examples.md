# Annotated examples

Complete, annotated noodle collection files. Use these as templates.

## Simple GET request

```yaml
name: Get Posts
method: GET
url: $base_url/posts
body_type: none
timeout: 0
followRedirects: true
```

Minimal valid request. Fields: name, method, url, timeout. `followRedirects` and `maxRedirects` omitted (use defaults: true, 5). `body_type` explicitly `none` since no body. No `headers`, `params`, `auth`, or `body` fields are needed.

## Request with response assertions

Request (`users/get-user.yml`):

```yaml
name: Get User
method: GET
url: $base_url/users/1
body_type: none
timeout: 0
assert:
  - expression: status
    operator: equals
    value: 200
  - expression: body.id
    operator: isNumber
  - expression: headers.Content-Type
    operator: contains
    value: application/json
  - expression: response.time
    operator: lt
    value: 500
    enabled: false
```

Assertions are top-level request fields. Manual TUI sends and non-interactive
runs evaluate enabled rows; `enabled: false` keeps a validated row without
producing a result. Validate the YAML, then run the affected request when
execution is authorized:

```bash
noodle collection audit ./my-api --json
noodle request run users/get-user --collection ./my-api --json
```

A failed assertion makes the command exit nonzero. Read structured results from
`data.result.assertions`; known secrets are redacted from expected and actual
values, but arbitrary server data remains visible.

## Request with sandboxed inline scripts

Request (`signed/create.yml`):

```yaml
name: Create signed event
method: POST
url: $base_url/events
body_type: json
body: '{"name":"deploy"}'
scripts:
  pre: |-
    const timestamp = new Date().toISOString();
    request.body.setJson({ ...request.body.json(), timestamp });
    request.headers.set("X-Timestamp", timestamp);
    request.headers.set(
      "X-Signature",
      crypto.hmacSha256(env.get("signing_secret"), request.body.text(), "hex"),
    );
    run.set("temporary_nonce", crypto.randomBytes(12, "base64"));
    console.info("prepared", timestamp);
  post: |-
    if (response.status === 201) {
      const event = response.json();
      run.set("event_id", event.id);
      if (typeof cookies !== "undefined") {
        cookies.set({ name: "last_event", value: String(event.id), httpOnly: true });
      }
      console.info("created", event.id, response.timeMs);
    }
assert:
  - expression: status
    operator: equals
    value: 201
```

Declare `signing_secret` as a secret in the selected environment. The script
source is literal, so `$name` text inside it is not environment substitution.
The body and header changes apply only to the prepared request. During a
collection run, `temporary_nonce` is available to this request's post script
and later requests and is discarded when the run ends. Human output reports the
script status and log count without printing `console` messages; JSON places
redacted logs in the request's `scripts` group.

Use only synchronous `request`, `env`, `run`, `crypto`, `random`, and `console` APIs.
Post also exposes bounded response text/JSON, metadata and headers, with the
final prepared request read-only. Capture commits happen before post and
assertions after it, even on post failure. `event_id` reaches later collection
requests but stays transient. Cookies are optional, host-only and scoped to the
final URL; domains and inaccessible paths are rejected. Omitted expiry is
session lifetime and cookie saves remain deferred. Both phases stage changes
and roll back only the failing invocation. Pre failure prevents HTTP; post
failure preserves the response and captures. Prefer a declarative capture when
conditional processing is unnecessary.
Imports, fetch, timers, host modules, and Promises are unavailable. See
[schema.md](../schema.md#inline-request-scripts) for exact methods and fixed
resource limits.

## Random data across script phases and requests

First request (`random/1-create.yml`):

```yaml
name: Create random user
method: POST
url: $base_url/users
body_type: json
body: '{}'
scripts:
  pre: |-
    random.seed(42);
    request.body.setJson({
      id: random.uuid(),
      name: random.name(),
      email: random.exampleEmail(),
      age: random.number({ min: 18, max: 80 }),
    });
  post: |-
    if (response.status === 201) {
      run.set("next_user", { id: random.uuid(), name: random.name() });
    }
```

Later request (`random/2-create.yml`):

```yaml
name: Create prepared user
method: POST
url: $base_url/users
body_type: json
body: '{}'
scripts:
  pre: |-
    const user = run.get("next_user");
    if (!user) throw Error("Run random/1-create first in the same collection run");
    request.body.setJson(user);
```

Run these in collection order to share transient values. A separate manual send
or `request run` has its own scope. Pre's seed does not seed post or the later
request; each invocation starts independently. Use `random.seed` in each phase
that needs reproducibility, plus explicit `refDate` for relative dates. Generated
passwords are automatically masked in Results; ordinary random data remains
visible. See [the full catalog](../schema.md#script-random-api) for bounded options.

## Chained requests with response capture

First request (`users/create-user.yml`):

```yaml
name: Create User
method: POST
url: $base_url/users
body_type: json
body: '{"name":"Ada"}'
capture:
  user_id:
    value: body.id
  request_id:
    value: headers.x-request-id
  optional_trace:
    value: headers.x-trace
    enabled: false
```

Later request (`users/get-created-user.yml`):

```yaml
name: Get Created User
method: GET
url: $base_url/users/$user_id
headers:
  X-Request-ID: $request_id
assert:
  - expression: status
    operator: equals
    value: 200
  - expression: body.id
    operator: isNumber
  - expression: body.name
    operator: equals
    value: Ada
```

Cleanup request (`users/delete-user.yml`):

```yaml
name: Delete User
method: DELETE
url: $base_url/users/$user_id
assert:
  - expression: status
    operator: equals
    value: 204
```

Run the workflow in collection order:

```bash
noodle collection run ./my-api users/create-user users/get-created-user users/delete-user --json
```

`user_id` and `request_id` exist only for this collection command and never
modify environment files. Every capture uses the object form. Add
`enabled: false` to keep a validated declaration without resolving it or
changing RunScope.

Read capture results from `data.results[].captures`. Human output never prints
captured values. Structured output redacts known secrets, credentials, cookies,
and sensitive response headers but preserves arbitrary server data. A
`persist: secret` capture is always fully redacted. Persistence applies only to
manual TUI sends and CLI `request run`, never collection runs.

## Login and authenticated chaining

Declare `$password` as a secret in the environment used by the run. This
prompts without echo and stores the value in the operating system vault:

```bash
noodle secret set password --env development --collection ./my-api
```

Login request (`auth/login.yml`):

```yaml
name: Login
method: POST
url: $base_url/login
body_type: json
body: '{"email":"ada@example.com","password":"$password"}'
capture:
  access_token:
    value: body.access_token
    persist: secret
assert:
  - expression: status
    operator: equals
    value: 200
```

Authenticated request (`auth/profile.yml`):

```yaml
name: Get Profile
method: GET
url: $base_url/profile
auth:
  type: bearer
  token: $access_token
assert:
  - expression: status
    operator: equals
    value: 200
  - expression: body.email
    operator: equals
    value: ada@example.com
```

```bash
noodle collection run ./my-api auth/login auth/profile --json
```

The collection run uses the captured token only in its transient RunScope; it
does not persist it despite the declaration. Run `auth/login` alone with
`request run` only when storing the token in the selected environment's OS-vault
account is intentional.

## POST with JSON body

```yaml
name: Create Post
method: POST
url: $base_url/posts
body_type: json
timeout: 0
headers:
  Content-Type: application/json
  x-api-key: $x_api_key
body: |-
  {
    "title": "foo",
    "body": "bar",
    "userId": 1
  }
```

JSON body with headers. `body` uses YAML literal block scalar `|-` for multi-line content. Headers include auth key (`$x_api_key`), so the env must declare `x_api_key`. `Content-Type` is per-request rather than inherited from a folder override.

## POST with XML body

```yaml
name: SOAP Lookup
method: POST
url: $base_url/soap
body_type: xml
timeout: 0
headers:
  Content-Type: application/soap+xml
body: |-
  <Envelope>
    <Lookup id="$lookup_id" />
  </Envelope>
```

XML is not reformatted or schema-validated. It is sent exactly as stored after
environment-variable substitution.

## Bearer auth request

```yaml
name: Bearer Auth
method: GET
url: https://httpbin.org/bearer
body_type: none
timeout: 0
auth:
  type: bearer
  token: $api_token
```

Auth is inline on the request. `$api_token` must be defined in the active environment. Alternative: put auth in `folder.yml` and use `type: inherit` on the request.

## Inheriting auth from folder

Folder (`auth/folder.yml`):
```yaml
auth:
  type: basic
  user: user
  pass: pass
```

Request (`auth/basic-auth.yml`):
```yaml
name: Basic Auth
method: GET
url: https://httpbin.org/basic-auth/user/pass
body_type: none
timeout: 0
auth:
  type: inherit
```

Request inherits `basic` auth from parent folder. No need to repeat credentials.

## OAuth 1.0a request

```yaml
name: OAuth 1 Resource
method: GET
url: $base_url/resource
body_type: none
timeout: 0
auth:
  type: oauth1
  consumer_key: $oauth1_consumer_key
  consumer_secret: $oauth1_consumer_secret
  access_token: $oauth1_access_token
  access_token_secret: $oauth1_access_token_secret
  signature_method: HMAC-SHA256
  placement: header
```

Declare the four credential variables as secrets. Noodle generates the nonce,
timestamp, and request-specific signature at send time.

## OAuth 2.0 authorization code request

```yaml
name: OAuth 2 Resource
method: GET
url: $base_url/resource
body_type: none
timeout: 0
auth:
  type: oauth2
  grant_type: authorization_code
  discovery_url: https://identity.example.com
  client_id: $oauth2_client_id
  client_secret: $oauth2_client_secret
  scope: openid profile
  redirect_uri: http://127.0.0.1:8765/oauth/callback
  pkce: true
  pkce_method: S256
```

Noodle resolves the authorization and token endpoints from the issuer on demand.
The human user must complete first-time browser authorization in the TUI.
Later automation runs may reuse or refresh the stored token, but they never
open a browser or write the token into this file.

## Folder with headers override

Folder (`posts/folder.yml`):
```yaml
meta:
  name: Posts
  seq: 1
headers:
  X-Custom-Header: shared-value
```

Requests in `posts/` automatically get `X-Custom-Header` unless they define it themselves.

## Request with query params

```yaml
name: Get With Params
method: GET
url: $base_url/posts
body_type: none
timeout: 0
followRedirects: true
params:
  - name: userId
    value: $user_id
  - name: _limit
    value: "10"
```

`params` use the array format: each entry has `name`, `value`, and optional `enabled` (defaults to `true`). This supports multiple values for the same param name. Values with `$` are substituted from env. Plain strings (like `"10"`) are sent literally.

## Multipart form upload

```yaml
name: Upload File
method: POST
url: $base_url/upload
body_type: multipart
timeout: 0
form_data:
  - name: description
    value: A photo
  - name: file
    value: '@/Pictures/photo.png'
    type: file
```

`form_data` for multipart. Text fields (default `type: "text"`) send string values. File fields (`type: "file"`) send file contents from `value` path.
`@/` means the current user's home directory and must be quoted in YAML. Keep
the shorthand in the collection; noodle expands it only when reading the file
or producing an output artifact.

## Complete environment file

File: `.environments/development.env`:
```
_color=success
base_url=https://jsonplaceholder.typicode.com
post_id=1
user_id=1
# @secret api_token
api_token=
# @secret x_api_key
x_api_key=
```

`_color` on line 1 sets the sidebar badge to green. `api_token` and `x_api_key`
are secure declarations whose values must come from `noodle secret set` or the
process environment; their placeholders stay blank. An ordinary disabled
variable would use `# disabled_key=value`.

## Complete collection layout

```
my-api/
├── settings.yml                  # environment: development
├── get-health.yml                # name: Health Check, method: GET
├── users/
│   ├── folder.yml                # meta plus bearer auth override
│   ├── get-users.yml             # auth: { type: inherit }
│   ├── get-user.yml              # auth: { type: inherit }
│   └── create-user.yml           # auth: { type: inherit }
├── posts/
│   ├── folder.yml                # meta: { name: "Posts", seq: 2 }
│   ├── get-posts.yml
│   └── create-post.yml
└── .environments/
    ├── development.env
    └── production.env
```

`users/folder.yml` provides bearer auth to requests inside `users/`, so those
requests can use `inherit`. `get-health.yml` and the `posts/` requests omit auth
and default to no authentication. A root `folder.yml` would be ignored.
`settings.yml` points to `development` as the default environment.
