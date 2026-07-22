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
| `body_type` | no | string | `"none"` | Body encoding: `none`, `json`, `multipart`, `urlencoded`, `binary` |
| `headers` | no | map | `{}` | Request headers. Omit if empty |
| `params` | no | list | `[]` | URL query parameters. Omit if empty. See format below. |
| `body` | no | string | — | Raw request body. Omit if no body |
| `form_data` | no | list | — | Multipart form entries. Omit if empty |
| `file_path` | no | string | — | Path to file for binary uploads |
| `auth` | no | map | — | Auth config. Omit for no auth |

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
    value: ./path/to/file.pdf
    type: file
```
Each entry: `name` (string, required), `value` (string, required), `enabled` (boolean, default true), `type` (`"text"` or `"file"`, default `"text"`).

### Auth

| Field | Bearer | Basic | API Key |
|-------|--------|-------|---------|
| `type` | `"bearer"` | `"basic"` | `"api_key"` |
| `token` | yes | — | — |
| `user` | — | yes | — |
| `pass` | — | yes | — |
| `key` | — | — | yes |
| `value` | — | — | yes |
| `placement` | — | — | `"header"` (default) or `"query"` |

### Binary body

When `body_type: binary`, set `file_path` to the file to upload:
```yaml
body_type: binary
file_path: ./data/photo.png
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
api_key=sk-abc123
# disabled_key=this_var_is_disabled
```

- `_color=<name>`: sidebar badge color. Valid: `primary`, `secondary`, `accent`, `error`, `warning`, `success`, `info`, `text`, `textMuted`, `background`, `backgroundPanel`, `backgroundElement`, `border`, `borderActive`, `borderSubtle`.
- `KEY=value`: active variable
- `# KEY=value`: commented out = disabled variable. Noodle skips these.

## Collection settings (`settings.yml`)

Single file at collection root:
```yaml
environment: development
```
Sets the default active environment name. Must match an env file in `.environments/`.

## Variable substitution rules

- Syntax: `$VARNAME` (dollar sign + word characters)
- Applied to: `url`, `headers` values, `params` values, `body`, `form_data` values, `file_path`, `auth` token/user/pass/key/value fields
- All `$var` references must resolve to a variable declared in the active environment
- Unresolved variables cause noodle to throw an error at request send time
- Multi-level substitution is NOT supported (`$VAR1` that evaluates to `$VAR2` won't be resolved again)

## Timeline file (`.timeline/<request-id>.yml`)

Response history for each request. Stored in `<collection>/.timeline/`, one file per request. Max 50 entries, newest first (prepended on save). Bodies larger than 10 KB are stored without truncation as gzip sidecars in `<request-id>.yml.bodies/`; their YAML field is replaced by a `bodyRef`. Treat timeline YAML and sidecars as generated, sensitive data. YAML array:

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
| `response` | object | Response data: `status` (number), `statusText` (string), `headers` (map), `body` (string when inline), `bodyRef` (object when sidecar-backed), `timeMs` (number — response time in ms), `size` (number — response body size in bytes) |
| `error` | object | Present instead of `response` if the request failed: `{ message: string }` |

The request snapshot can likewise contain either `body` or `bodyRef`. A `bodyRef` has `{ file, encoding: "gzip", size }`; its file is relative to the request's `.yml.bodies/` directory. Agents should read timeline data but should not create, rename, or edit sidecars directly.

**Useful queries agents can answer from timeline data:**
- Average response time for a request: sum all `response.timeMs` / count
- Success rate: count entries with `response.status` in 2xx range / total count
- Recent errors: filter entries where `error` is present
- Response size trend: compare `response.size` across entries
- Which environment was used: `envName` on each entry
