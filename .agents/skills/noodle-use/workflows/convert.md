# Convert workflow (file-level)

Convert Insomnia exports and Swagger 2.0 specs to noodle collections by reading source files and writing noodle `.yml` files directly. No CLI required — pure file-level transformation.

## Prerequisites

None. The agent reads the source file and writes noodle files. No noodle binary needed for conversion (though the user will need noodle to use the collection).

## Insomnia conversion

Insomnia exports as JSON or YAML. Each export contains a list of resources (requests, folders, environments).

### Step 1: Read the Insomnia export file

Parse the JSON/YAML. The top-level is a single export object:

```json
{
  "_type": "export",
  "__export_format": 4,
  "__export_date": "2024-01-01T00:00:00.000Z",
  "__export_source": "insomnia.desktop.app:v2024.1.0",
  "resources": [
    { "_type": "workspace", ... },
    { "_type": "request_group", ... },
    { "_type": "request", ... },
    { "_type": "environment", ... }
  ]
}
```

### Step 2: Extract the workspace

Find the resource with `_type: "workspace"`. This gives you the collection name. If no workspace exists, use the export filename.

### Step 3: Build a folder tree

Process `request_group` resources. Each group has:
- `name`: display name
- `parentId`: references another group (or workspace for top-level)
- `_id`: unique identifier

Build a tree: workspace → groups → subgroups → requests. Each group becomes a noodle folder.

### Step 4: Convert each request

For each `_type: "request"` resource:

| Insomnia field | Noodle field | Notes |
|---------------|--------------|-------|
| `name` | `name` | Direct copy |
| `method` | `method` | Direct copy (GET, POST, etc.) |
| `url` | `url` | Full URL. Replace base with `$base_url` if shared across requests |
| `headers[]` | `headers` | Each header: `{ name, value, disabled }`. Convert to noodle header format |
| `parameters[]` | `params` | Query params: `{ name, value, disabled }` |
| `body.mimeType` | `body_type` | Map: `application/json` → `json`, `application/x-www-form-urlencoded` → `urlencoded`, `multipart/form-data` → `multipart`. Else `none` |
| `body.text` | `body` | Raw body text |
| `body.params[]` | `form_data` | For multipart/urlencoded bodies |
| `authentication` | `auth` | See auth mapping below |
| `settingFollowRedirects` | `followRedirects` | `"global"` → true (default), `"off"` → false |

**Auth mapping:**

| Insomnia auth type | Noodle auth |
|-------------------|-------------|
| `none` / not set | Omit `auth` field |
| `bearer` | `{ type: bearer, token: "$api_token" }` (use var, extract real token to env) |
| `basic` | `{ type: basic, user: "$username", pass: "$password" }` (use vars) |
| `apikey` | `{ type: api_key, key: "...", value: "$api_key", placement: "header" }` |
| `oauth2` | Cannot map directly. Use `bearer` with token. Note to user that OAuth2 requires manual setup. |

**Important**: When auth contains literal values (not variable references), extract them into environment variables and use `$var` references in the request file. Never write hardcoded credentials to noodle YAML files.

### Step 5: Generate environment files

Insomnia has `_type: "environment"` resources with `data` objects mapping var names to values. Separate by environment (sub-environments have `parentId` pointing to a base environment).

Create `.environments/<name>.env` for each:
```
_color=info
base_url=https://api.example.com
var_name=var_value
```

Map Insomnia's environment colors to noodle `_color` values if available.

### Step 6: Write the collection

Create the directory structure and write all files:
- `settings.yml` with `environment: <default-env-name>`
- `folder.yml` for each group (with `meta.name` and `meta.seq`)
- Request `.yml` files
- `.environments/*.env` files

### Step 7: Report

List what was created. Suggest the user run the evaluate workflow on the result.

## Swagger 2.0 conversion

Swagger 2.0 specs are JSON or YAML files defining an API.

### Step 1: Read the Swagger file

Parse the JSON/YAML. Top-level keys: `swagger: "2.0"`, `info`, `host`, `basePath`, `schemes`, `paths`, `definitions`, `parameters`, `securityDefinitions`.

Verify `swagger` field is `"2.0"`. If it's `openapi: 3.x.x`, this is OpenAPI 3.0 — use the `noodle import` CLI instead (see [import.md](import.md)).

### Step 2: Determine base URL

From `schemes`, `host`, and `basePath`:
```
schemes: ["https"]
host: api.example.com
basePath: /v2
```

Base URL = `https://api.example.com/v2`. This becomes `$base_url` in the environment.

If there are multiple hosts or no host, default to `http://localhost`.

### Step 3: Build environments

Create at least a `development.env`:
```
_color=info
base_url=https://api.example.com/v2
```

If multiple `schemes` are defined, note that production likely uses `https` and development `http`.

### Step 4: Process security definitions

Swagger `securityDefinitions` define auth schemes:

| Swagger type | Noodle auth |
|-------------|-------------|
| `basic` | `{ type: basic, user: "$user", pass: "$pass" }` |
| `apiKey` (in: "header") | `{ type: api_key, key: "...", value: "$api_key", placement: "header" }` |
| `apiKey` (in: "query") | `{ type: api_key, key: "...", value: "$api_key", placement: "query" }` |
| `oauth2` | `{ type: bearer, token: "$access_token" }` (simplified mapping) |

The `security` array at top level or per-operation specifies which definitions apply. Use the first one as the root `folder.yml` auth override if the whole API uses the same auth.

Write to root `folder.yml`:
```yaml
auth:
  type: bearer
  token: $api_token
```

Add the auth variable to environments.

### Step 5: Process paths into requests

For each path and HTTP method in `paths`:

**URL**: `$base_url<path>`. Replace path parameters (`{id}`) with `$var` references or hardcoded values. For example, `/users/{userId}` → `$base_url/users/$user_id`.

**Name**: Extract from `operationId` if present. Otherwise, construct: `<method> <path-summary>`. Example: `getUserById` → `Get User By ID`.

**Method**: Direct from the operation key.

**Headers and params**: From `parameters` arrays (path-level + operation-level).

- `in: "query"` with `required: true` → `params` field with good default or `$var`
- `in: "header"` → `headers` field
- `in: "path"` → embedded in URL
- `in: "body"` → `body` field, `body_type` from consumes

**Body**: From the `body` parameter or request body schema. Generate a JSON template with empty/placeholder values. Use `body_type: json`.

**Consumes/Produces**: MIME types for the operation. `consumes: [application/json]` → `body_type: json`. Set `Content-Type` and `Accept` headers accordingly.

### Step 6: Group requests into folders

Group by `tags` from each operation. Operations without tags go in the root or a `general/` folder.

Create `folder.yml` for each group:
```yaml
meta:
  name: <Tag Name>
  seq: <index>
```

### Step 7: Handle path parameters

Swagger path parameters like `/users/{userId}` need noodle `$var` references: `$base_url/users/$user_id`. Note: noodle uses `$var`, not `{var}`.

Add the path parameter variable to environments. If a default is specified in the Swagger schema, use it:
```
user_id=1
```

### Step 8: Write the collection

Create the full directory structure:
```
<output-dir>/
├── settings.yml
├── folder.yml                   (with auth from securityDefinitions)
├── <tag-group>/
│   ├── folder.yml               (meta.name + seq)
│   ├── <operation>.yml
│   └── ...
└── .environments/
    └── development.env
```

### Step 9: Report and suggest evaluate

List created files and suggest running the evaluate workflow on the result.
