# Create workflow

Scaffold noodle collections, requests, folders, and environments from scratch.

## Find an existing collection

Before creating a new collection, check if the user already has one that matches.

### Step 1: List registered collections

```bash
noodle workspace list --json
```

Read the absolute paths from `data.collections`. Prefer this supported command to
parsing global config directly.

### Step 2: Match by name

Extract the directory name from each path. If the user asks for "the stripe collection", look for a path ending in `/stripe` or `/stripe-api`. Return the full path.

### Step 3: If not found

If no collection matches, use `collection init` for an existing directory or
proceed to create a new one below. Both paths register the collection so future
lookups find it.

## Create a new collection

When asked to create a new collection:

### Step 1: Determine the collection directory

Ask the user where to create it. Default: `./collections`. If they say "a collection for the Stripe API", suggest `./stripe-api/`.

### Step 2: Initialize an existing directory

If directory already contains request YAML or other project files, prefer:

```bash
noodle collection init <dir> --json
```

This preserves existing files, creates missing collection markers, and registers absolute path. It refuses missing paths, files, and directories already recognized as collections.

### Step 3: Create a starter collection

Use the automation CLI when a starter collection is sufficient:

```bash
noodle collection create <name> --output <parent-dir> --json
```

It creates the collection, `settings.yml`, an empty `development` environment,
an example request, and registers the absolute path.

### Step 4: Create a customized scaffold

For a customized collection, create the directory first and let Noodle bootstrap
and register it before editing the generated files:

```bash
mkdir -p <dir>
noodle collection init <dir> --json
```

Then edit `<dir>/settings.yml`,
`<dir>/.environments/development.env`, and request files as needed. Preserve the
generated `collection_id`.

Example settings:

```yaml
environment: development
```

Example development environment:

File: `<dir>/.environments/development.env`:
```
_color=info
base_url=http://localhost:3000
```

`base_url` is the standard name for the root API URL. Adjust based on the API being scaffolded.

Do not rewrite `~/.config/noodle/config.yml` to register a collection. The
supported create and init commands preserve unrelated global settings and update
the registry safely. Read [config.md](../reference/config.md) only when the user
specifically asks to change global preferences.

### Step 5: Report what was created

List all files/dirs created so the user can verify.

## Add requests to a collection

When asked to add a specific endpoint:

### Step 1: Listen for these details (ask if missing)

- HTTP method
- URL path (relative to `$base_url` or absolute)
- Request name (human-readable)
- Body (if POST/PUT/PATCH)
- Auth requirements
- Folder to place it in
- Expected response behavior when assertions are requested

### Step 2: Determine file path

Request ID = `<folder>/<hyphenated-name>`. Examples:
- "GET /users" → `users/get-users.yml` (ID: `users/get-users`)
- "POST /posts" → `posts/create-post.yml` (ID: `posts/create-post`)
- "DELETE /users/:id" → `users/delete-user.yml` (ID: `users/delete-user`)

### Step 3: Determine auth strategy

Check if the collection already has a folder with auth overrides:
- If yes and this endpoint uses the same auth → use `auth: { type: inherit }`
- If yes but this endpoint is unauthenticated → omit `auth` field
- If no and this endpoint needs auth → add `auth` inline on the request
- If many requests will share auth → suggest creating a `folder.yml` with auth override

### Step 4: Generate the YAML

For a GET request with inherited auth and query params:
```yaml
name: Get Users
method: GET
url: $base_url/users
body_type: none
timeout: 0
followRedirects: true
maxRedirects: 5
params:
  - name: page
    value: "1"
  - name: _limit
    value: "10"
auth:
  type: inherit
```

For a POST request with JSON body:
```yaml
name: Create User
method: POST
url: $base_url/users
body_type: json
timeout: 0
followRedirects: true
headers:
  Content-Type: application/json
auth:
  type: inherit
body: |-
  {
    "name": "",
    "email": ""
  }
```

`followRedirects` (default `true`) and `maxRedirects` (default `5`) are optional. Omit them to use defaults. `timeout` is in ms; `0` means no timeout. Params use the array format: each entry has `name`, `value`, and optional `enabled` (default `true`).

For a request with a URL path parameter:

```yaml
name: Get User
method: GET
url: $base_url/users/:userId
body_type: none
timeout: 0
path_params:
  - name: userId
    value: $user_id
```

Every `:name` token must have exactly one matching `path_params` entry. Path
parameters are always enabled and their names and values support environment
substitution.

### Step 5: Add response assertions when requested

Use the contract supplied by the user or API specification. Do not infer
assertions from one live response or invent expected values. Prefer stable
contract checks over volatile response data.

Add assertions as a top-level `assert` list:

```yaml
assert:
  - expression: status
    operator: equals
    value: 200
  - expression: body.id
    operator: isNumber
  - expression: headers.Content-Type
    operator: contains
    value: application/json
```

Read the [response assertion schema](../schema.md#response-assertions) for the
supported expressions, operators, and value rules. Expected strings may use
`$VARNAME`; verify every referenced variable exists in the active environment.

### Step 6: Create parent folder if needed

If the parent directory doesn't exist:
```bash
mkdir -p <dir>/<folder-path>
```

### Step 7: Write the file

Write the YAML content to `<dir>/<folder-path>/<file-name>.yml`.

### Step 8: Ensure the env declares needed vars

For an existing environment and a single variable, prefer:

```bash
noodle environment set <key> <value> --env <environment> --collection <dir> --json
```

If the request uses `$base_url` or other env vars, verify they exist in the active environment. If not, add them with placeholder values.

### Step 9: Validate and verify

After editing request YAML, validate the collection:

```bash
noodle collection audit <dir> --json
```

When the user has authorized request execution, run the affected request and
inspect its assertion results. Obtain explicit authorization before sending a
non-idempotent request such as POST, PUT, PATCH, or DELETE.

```bash
noodle request run <id> --collection <dir> --env <environment> --json
```

## Add a folder with auth override

When asked to set up shared auth or headers:

### Step 1: Determine the folder

Where should the override apply? Specific subfolder. Root-level `folder.yml` is ignored by noodle; root requests cannot receive folder overrides.

### Step 2: Write folder.yml

```yaml
meta:
  name: API
  seq: 1
headers:
  Content-Type: application/json
auth:
  type: bearer
  token: $api_token
```

`meta.seq`: lower = first in sidebar. Use increments of 1 for clarity.

### Step 3: Ensure the env has the auth variable

Declare sensitive values without plaintext and set them through the secret CLI:

```dotenv
# @secret api_token
api_token=
```

```bash
noodle secret set api_token --env <environment> --collection <dir>
```

## Add an environment

### Step 1: Determine name and base URL

Ask for environment name (development, staging, production) and the base URL.

### Step 2: Copy from an existing env if possible

If another environment exists, copy its variable declarations and only change values. This keeps envs in sync.

### Step 3: Write the file

File: `<dir>/.environments/<name>.env`:
```
_color=success
base_url=https://api.example.com
# @secret api_key
api_key=
```

After writing the declaration, use
`noodle secret set api_key --env <name> --collection <dir>` to store the value
in the OS credential vault. A same-named process environment value takes
precedence for CI and other automation.

### Step 4: Set _color appropriately

- `success` (green) for production
- `warning` (yellow) for staging
- `info` (blue) for development
- `accent` (purple) for other

## Configure collection settings

When the user asks to change collection metadata or behavior:

1. Inspect the current settings with `noodle collection inspect <dir> --json`.
2. Read [the collection settings schema](../schema.md#collection-settings-settingsyml).
3. Edit only the requested fields in `<dir>/settings.yml`. Preserve
   `collection_id`, verify that `environment` names an existing environment, and
   keep proxy credentials and encrypted-key passphrases out of YAML.
4. Run `noodle collection audit <dir> --json` after the edit.

Agents may set collection name, description, timeline retention, cookie policy,
credential-free proxy policy, and TLS or mTLS file metadata. Proxy credentials
and encrypted client-key passphrases require the human Settings workflow because
Noodle stores them in the OS vault rather than in collection files.
