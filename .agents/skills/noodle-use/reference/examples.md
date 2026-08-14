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

Minimal valid request. Fields: name, method, url, timeout. `followRedirects` and `maxRedirects` omitted (use defaults: true, 5). `body_type` explicitly `none` since no body. No `headers`, `params`, `auth`, `body` — omitted when not needed.

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

JSON body with headers. `body` uses YAML literal block scalar `|-` for multi-line content. Headers include auth key (`$x_api_key`) — the env must declare `x_api_key`. `Content-Type` is per-request (not in folder override).

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
  authorization_url: https://identity.example.com/oauth/authorize
  access_token_url: https://identity.example.com/oauth/token
  refresh_token_url: https://identity.example.com/oauth/token
  client_id: $oauth2_client_id
  client_secret: $oauth2_client_secret
  scope: openid profile
  redirect_uri: http://127.0.0.1:8765/oauth/callback
  pkce: true
  pkce_method: S256
```

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
├── folder.yml                    # auth: { type: bearer, token: $TOKEN }
├── get-health.yml                # name: Health Check, method: GET
├── users/
│   ├── folder.yml                # meta: { name: "Users", seq: 1 }
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

Root `folder.yml` provides bearer auth. `users/` requests use `inherit` — they pick up the root auth. `posts/` requests don't declare auth — defaults to no auth. `settings.yml` points to `development` as the default env.
