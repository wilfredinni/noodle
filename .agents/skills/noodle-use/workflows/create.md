# Create workflow

Scaffold noodle collections, requests, folders, and environments from scratch.

## Find an existing collection

Before creating a new collection, check if the user already has one that matches.

### Step 1: Read noodle's config

```bash
cat ~/.config/noodle/config.yml
```

Look for the `collections` field — an array of absolute paths to known collections.

### Step 2: Match by name

Extract the directory name from each path. If the user asks for "the stripe collection", look for a path ending in `/stripe` or `/stripe-api`. Return the full path.

### Step 3: If not found

If no collection matches, proceed to create a new one below. The new collection will be registered in config so future lookups find it.

## Create a new collection

When asked to create a new collection:

### Step 1: Determine the collection directory

Ask the user where to create it. Default: `./collections`. If they say "a collection for the Stripe API", suggest `./stripe-api/`.

### Step 2: Create the directory structure

```bash
mkdir -p <dir>/.environments
```

### Step 3: Create settings.yml

```yaml
environment: development
```

### Step 4: Create a default environment

File: `<dir>/.environments/development.env`:
```
_color=info
base_url=http://localhost:3000
```

`base_url` is the standard name for the root API URL. Adjust based on the API being scaffolded.

### Step 5: Register in noodle config

Write the absolute path to `~/.config/noodle/config.yml` so the collection appears in noodle's workspace switcher. Read the existing config, prepend the new path to `collections`, write back:

```yaml
collections:
  - /Users/me/Projects/stripe-api
  - /Users/me/Projects/other-api
```

If `collections` doesn't exist yet, create it with the new path. Paths must be absolute and resolved. See [config.md](reference/config.md) for the full config schema.

### Step 6: Report what was created

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

For a GET request with inherited auth:
```yaml
name: Get Users
method: GET
url: $base_url/users
body_type: none
timeout: 0
auth:
  type: inherit
```

For a POST request with body:
```yaml
name: Create User
method: POST
url: $base_url/users
body_type: json
timeout: 0
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

### Step 5: Create parent folder if needed

If the parent directory doesn't exist:
```bash
mkdir -p <dir>/<folder-path>
```

### Step 6: Write the file

Write the YAML content to `<dir>/<folder-path>/<file-name>.yml`.

### Step 7: Ensure the env declares needed vars

If the request uses `$base_url` or other env vars, verify they exist in the active environment. If not, add them with placeholder values.

## Add a folder with auth override

When asked to set up shared auth or headers:

### Step 1: Determine the folder

Where should the override apply? Root of collection? Specific subfolder?

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

Add `api_token=<placeholder>` to environments if `$api_token` is used and not yet declared.

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
api_key=sk-placeholder
```

### Step 4: Set _color appropriately

- `success` (green) for production
- `warning` (yellow) for staging
- `info` (blue) for development
- `accent` (purple) for other
