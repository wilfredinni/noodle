# Evaluate workflow

Audit noodle collections for REST best practices, security issues, naming conventions, and structural problems.

## Audit process

### Step 1: Load the entire collection

Read every `.yml` file in the collection directory (recursively, excluding hidden dirs). Parse each file to extract its fields.

### Step 2: Load all environments

Read every `.env` file in `.environments/`. Extract declared vars, disabled vars, and `_color`.

### Step 3: Run each check below

### Step 4: Report findings with severity

Each finding gets: **severity** (critical / warning / info), **file**, **issue**, **suggestion**. Group by severity, then by file. Present as a readable list.

## Security checks

### Hardcoded tokens/credentials

**Pattern**: Auth fields (`token`, `pass`, `key`, `value`) containing literal strings that are not `$var` references.

**Examples of problems**:
```yaml
auth:
  type: bearer
  token: sk-abc123realTokenHere
```
```yaml
auth:
  type: basic
  user: admin
  pass: realPassword123
```

**Why it's bad**: Secrets committed to source control. Anyone with access to the repo can see them.

**Fix**: Replace with `$var` references and declare in env files:
```yaml
auth:
  type: bearer
  token: $api_token
```

**Severity**: critical

### Tokens in URLs

**Pattern**: URLs containing `token=`, `api_key=`, `apiKey=`, `key=`, `secret=`, `password=` as query parameters.

**Example**:
```yaml
url: https://api.example.com/data?api_key=sk-abc123
```

**Why it's bad**: Tokens in URLs are logged by proxies, load balancers, and server access logs. Visible in browser history. Leaked via `Referer` header.

**Fix**: Use header-based auth or `$var` in a header:
```yaml
url: $base_url/data
headers:
  X-API-Key: $api_key
```

**Severity**: critical

### Auth fields in env files with real values

**Pattern**: Environment files containing real-looking secrets (not placeholders like `PLACEHOLDER` or `changeme`).

**Heuristics**:
- Values starting with `sk-`, `pk-`, `ghp_`, `gho_`, `github_pat_`
- Values that look like JWTs (long base64 strings with `.` separator)
- Values matching common API key formats (alphanumeric, 32+ chars)

**Why it's bad**: Env files may be shared or committed accidentally. Placeholder values are safer.

**Fix**: Replace with placeholder: `api_key=sk-your-key-here`. Keep real secrets in a local-only, gitignored file or a secrets manager.

**Severity**: critical

### HTTP instead of HTTPS in production env

**Pattern**: URLs in production environment starting with `http://` (not `https://`).

**Why it's bad**: Unencrypted traffic exposes all headers/body/params to network interception.

**Fix**: Use `https://` in production and staging environments.

**Severity**: warning (critical for production env)

### Missing auth on endpoints that should be authenticated

**Pattern**: No `auth` field on requests in folders where sibling requests have auth.

**Why it's bad**: Might be intentional (public endpoint) or might be an oversight.

**Fix**: Confirm with user. If intentional, no change. If oversight, add `auth: { type: inherit }`.

**Severity**: warning

### Auth on GET without HTTPS

**Pattern**: `auth` field present on a GET request whose URL starts with `http://`.

**Why it's bad**: Auth tokens sent in cleartext headers over HTTP.

**Fix**: Use `https://`.

**Severity**: warning

## REST practice checks

### Wrong HTTP method for operation type

**Pattern**: Request file name suggests one operation but `method` field says another.

**Heuristics**:
- File named `get-*` or `list-*` but method is POST/PUT/DELETE
- File named `create-*` or `add-*` but method is GET/DELETE
- File named `delete-*` or `remove-*` but method is GET/POST
- File named `update-*` or `edit-*` but method is GET/DELETE

**Why it's bad**: Misleading. Breaks HTTP semantics. Surprises readers.

**Fix**: Use the correct HTTP method:
- `get-*` / `list-*` → GET
- `create-*` / `add-*` → POST
- `update-*` / `edit-*` / `patch-*` → PUT or PATCH
- `delete-*` / `remove-*` → DELETE

**Severity**: warning

### GET request with body

**Pattern**: `method: GET` with `body` field present and non-empty.

**Why it's bad**: HTTP spec allows GET bodies but most servers, proxies, and CDNs ignore or drop it. Unreliable.

**Fix**: Use query params (`params` field) for GET, or change method to POST.

**Severity**: warning

### DELETE request with body

**Pattern**: `method: DELETE` with `body` field present and non-empty.

**Why it's bad**: Like GET, DELETE bodies are unreliable across infrastructure.

**Fix**: Use query params or change to POST.

**Severity**: info

### POST/PUT/PATCH without Content-Type

**Pattern**: POST/PUT/PATCH request with `body` but no `Content-Type` header.

**Why it's bad**: Server may misinterpret the body format. Behavior is server-dependent.

**Fix**: Add `Content-Type: application/json` (or appropriate type) to headers.

**Severity**: warning

### POST with body_type: none

**Pattern**: `method: POST` with `body_type: none` and no `body` field.

**Why it's bad**: Unusual but potentially intentional (empty POST is valid).

**Severity**: info (flag for review)

### Inconsistent URL patterns

**Pattern**: Some requests use `$base_url/` prefix, others use hardcoded URLs.

**Why it's bad**: Environment switching (dev → prod) won't work for hardcoded URLs.

**Fix**: Use `$base_url` consistently. Only use hardcoded URLs for external services not controlled by the environment.

**Severity**: warning

## Naming and structure checks

### Generic file names

**Pattern**: Files named `get.yml`, `post.yml`, `list.yml`, `create.yml`, `delete.yml`, `update.yml`.

**Why it's bad**: Ambiguous. When reading a file list, you can't tell what resource it operates on. Example: three `get.yml` files in different folders all look identical in search results.

**Fix**: Include the resource name: `get-users.yml`, `create-post.yml`, `delete-comment.yml`.

**Severity**: info

### Display name doesn't match file name

**Pattern**: `name: "List All Users"` in file `get-something-else.yml`.

**Why it's bad**: Confusing when navigating files and sidebar simultaneously. Makes debugging harder.

**Fix**: Align the display name with the resource + operation.

**Severity**: info

### Deep nesting (>3 levels)

**Pattern**: Files at depth 4 or more: `api/v2/enterprise/users/get-users.yml`.

**Why it's bad**: Hard to navigate in sidebar. Extra clicks. Often unnecessary — versioning can be expressed through environment URLs or folder names.

**Fix**: Flatten to max 3 levels. Options:
- Remove the `api/v2` prefix if the whole collection is v2
- Use `seq` for ordering instead of nesting
- Use display names to indicate version: `Users (v2)`

**Severity**: info

### Orphan requests (no folder context)

**Pattern**: Requests at collection root without a parent `folder.yml` for auth/headers, while sibling requests are in folders with auth.

**Why it's bad**: Root-level requests can't share auth with siblings. Each one repeats the same config.

**Fix**: Move into a folder or create root `folder.yml` with shared overrides.

**Severity**: info

### Missing folder display names

**Pattern**: `folder.yml` exists but has no `meta.name`. Directory name is used as fallback.

**Why it's bad**: Directory names like `posts_v2_internal` show as display names. Ugly.

**Fix**: Add `meta.name` with a clean display name:
```yaml
meta:
  name: Posts (Internal v2)
```

**Severity**: info

## Environment checks

### Unused variables

**Pattern**: Env file declares `VAR=value` but no request file references `$VAR`.

**Why it's bad**: Clutter. Makes env files harder to read. Suggests the env was copy-pasted without cleanup.

**Fix**: Remove unused variables from all environments.

**Severity**: info

### Missing variables

**Pattern**: Request references `$VAR` but one or more environment files don't declare `VAR`.

**Why it's bad**: Switching to that environment will cause a runtime error ("unresolved variable").

**Fix**: Add the missing variable to all environments with appropriate placeholder values.

**Severity**: warning

### Variable declared in one env but not another

**Pattern**: `development.env` has `api_key=...` but `production.env` doesn't declare `api_key`.

**Why it's bad**: Environment files should have the same set of variable names. Missing declarations cause confusion and runtime errors.

**Fix**: Sync variable declarations across all environments. Use placeholder values where the real value isn't known yet.

**Severity**: warning

### Stale commented-out variables

**Pattern**: Environment files with `# VAR=value` lines that were commented out long ago and no request uses `$VAR`.

**Why it's bad**: Clutter. Makes the file harder to parse.

**Fix**: Remove commented-out lines for variables that are no longer referenced.

**Severity**: info

### Missing _color

**Pattern**: Environment file without a `_color=<name>` line.

**Why it's bad**: No visual badge in sidebar. Can't distinguish environments at a glance.

**Fix**: Add `_color` as the first line with an appropriate color.

**Severity**: info
