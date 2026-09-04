# Import workflow (CLI)

Import OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia collections into noodle format, or export a Noodle collection as OpenAPI 3.0.3 or Postman Collection v2.1.

## Prerequisites

`noodle` must be installed as a binary. The import subcommand is built into the noodle binary. Verify:

```bash
noodle import --help
```

If `noodle` is not found, guide the user to install: `brew install noodle` (macOS) or `curl -LsSf https://raw.githubusercontent.com/wilfredinni/noodle/main/scripts/install.sh | sh` (Linux/macOS).

## Import workflow

### Step 1: Identify the source file

Get the file path from the user. Common extensions:
- `.yaml` / `.yml` / `.json` → OpenAPI 3.0 or Swagger 2.0
- `.postman_collection.json` → Postman
- Insomnia v4/v5 JSON export → Insomnia

### Step 2: Detect the format

If the user doesn't specify a format:
- Check file extension
- Check file content for signatures:
  - OpenAPI: contains `openapi:`, `paths:`, `info:` at top level
  - Swagger: contains `swagger: "2.0"`
  - Postman: contains `info.schema` with `postman.com` URL
  - Insomnia: has `_type: "export"` and `__export_format` 4 or 5
- If ambiguous, ask the user

### Step 3: Run the import

```bash
noodle import <source-path> --format <openapi|swagger|postman|insomnia> --output <target-dir> --json
```

The `--output` flag specifies the parent directory. Defaults to `./collections` if omitted. Read `data.path` from the JSON result; it is the created collection directory.
After writing the collection, import automatically canonicalizes its request YAML
and pretty-prints valid JSON bodies. The JSON result reports the number of
formatted bodies in `data.formattedJsonBodies`.

### Step 4: Verify the output

Inspect the created collection with the automation CLI:

```bash
noodle collection inspect <data.path> --json
```

Its on-disk layout should resemble:

```bash
ls -R <data.path>/
```

Expected structure:
```
<data.path>/
├── settings.yml
├── <resource>/                (one folder per tag/path group)
│   ├── folder.yml
│   ├── <operation>.yml
│   └── ...
├── .environments/
│   └── <env-name>.env
└── ...
```

### Step 5: Review and organize

After import, the collection may need cleanup:
- **Check auth**: Source auth is converted when supported; verify correctness,
  especially after an Insomnia or Swagger import. Root-level `folder.yml` is
  never an effective auth source.
- **Check environments**: Base URL and variables from the spec are extracted to env files. Verify values.
- **Rename folders**: Imported folder names may be tag names or path segments. Adjust `meta.name` for readability.
- **Remove unused requests**: The importer may generate endpoints you don't need. Delete `.yml` files manually.
- **Add `_color` to envs**: Imported environments may not have `_color`. Add it.

### Step 6: Run the evaluate workflow

After import, run the evaluate checks (see [evaluate.md](evaluate.md)) on the imported collection to catch common issues.

## Format-specific notes

OpenAPI 3.0 imports map:
- `info.title` → collection root name
- `servers[].url` → `$base_url` in environment
- `paths` → request `.yml` files, one per operation
- `parameters` → `params` field on requests
- `requestBody` → `body` + `body_type`, including literal JSON and XML examples
- `components.securitySchemes` → `folder.yml` auth override or inline `auth` on requests
- Tags → folder grouping

HTTP `bearer`, `basic`, and `ntlm` security schemes map to their matching Noodle
auth types. NTLM credentials use generated environment-variable placeholders;
declare the password as a secret before running the imported request.
OpenAPI OAuth 2.0 authorization code, client credentials, implicit, and password
flows map to Noodle OAuth 2.0 auth with endpoint URLs, required scopes, and
generated credential placeholders. `openIdConnect` schemes map to discovery-backed
OAuth 2.0 auth; `x-noodle-oauth2-grant-type` preserves a non-default grant.
OAuth 1.0a has no OpenAPI 3.0 security-scheme representation and is not imported
from OpenAPI.

Multiple servers in the spec create multiple environments.

Swagger 2.0 imports convert the specification to the same request model,
including JSON and XML request bodies, paths, supported parameters, and
security definitions. Swagger's `host`, `basePath`, and schemes become server
environments.

## Postman-specific notes

Postman imports map:
- Collection name → collection root name
- Folder hierarchy → noodle folder structure
- Folder auth → the matching nested `folder.yml` override
- Request auth → inline `auth` on requests (or `inherit` if same as parent)
- Pre-request scripts → not imported (noodle doesn't support scripts)
- Tests → not imported
- Collection variables → environment file
- Raw XML bodies → `body_type: xml` (from the raw language or XML Content-Type)

Only `{{WORD}}` Postman variables are supported. Dynamic generators such as
`{{$randomUUID}}` and dotted or hyphenated placeholders are rejected before
any collection files are written.

Postman collection-level auth is not preserved as an effective Noodle override.
A request without its own auth may import as `type: inherit`, but a root
`folder.yml` cannot satisfy that inheritance. When the source relies on
collection auth, review the imported requests before execution and, with the
user's intended configuration, either place them under a real shared parent
folder with an auth override or author auth on each root-level request. Never
copy literal credentials from the export into request YAML.

Postman `ntlm`, `awsv4`, `oauth1`, and `oauth2` auth map to Noodle NTLMv2, AWS
SigV4, OAuth 1.0a, and OAuth 2.0. Review signing methods, grant types, endpoint
URLs, token placement, region, service, and optional session tokens. Move every
credential and private key to a secret environment declaration before sending.

Insomnia v4/v5 JSON imports preserve supported workspaces, request groups,
requests, environments, headers, params, JSON and XML body types, and auth,
including NTLM, OAuth 1.0a, and OAuth 2.0. Cyclic request groups are skipped.

## Export a collection

Use `noodle export` for a collection you want to share in a standard format:

```bash
noodle export <collection-path> --format openapi --output ./openapi.yml --json
noodle export <collection-path> --format postman --output ./postman-bundle --json
```

OpenAPI exports write a 3.0.3 document. Enabled parameters and headers,
request-body examples, folders as tags, supported auth, and enabled nonempty
`base_url` values as servers are included. NTLM and AWS SigV4 are represented
as HTTP security schemes; validate compatibility with the target OpenAPI
consumer. OAuth 2.0 exports as standard flows when its selected grant has explicit
endpoints. Discovery-only auth exports as `openIdConnect` with a normalized
discovery URL and `x-noodle-oauth2-grant-type`; partial endpoint overrides are
rejected because OpenAPI cannot represent both sources faithfully. Client
credentials and cached tokens are never exported. OAuth 1.0a auth is omitted because
OpenAPI 3.0 has no matching security-scheme type. Other environment values and
response timeline data are not exported.

XML bodies export as literal string examples and preserve explicit XML MIME
types such as `application/soap+xml`.

Postman exports require a new or empty output directory. They create
`collection.postman_collection.json` and one redacted environment file per
Noodle environment. NTLM, AWS SigV4, OAuth 1.0a, and OAuth 2.0 use Postman's
matching auth representations. OAuth configuration is retained, but cached
OAuth 2 tokens and generated OAuth 1 signatures are not exported. Discovery-backed
OAuth 2 auth must provide every endpoint required by its selected grant because
Postman has no discovery field. Literal
request values are retained except that `@/` file paths expand to absolute home
paths, so inspect the bundle for secrets and local path disclosure before
sharing it. Keep the shorthand in source collection files; both formats
require an output path outside the collection. Noodle-specific TLS settings are
not translated to either export format. XML bodies export as Postman raw XML.

## After import

Always suggest the user:
1. Open the collection in noodle TUI to verify visually: `noodle -c <target-dir>`
2. Run a few requests to verify auth and URL substitution work
3. Adjust folder ordering with `seq`
4. Add descriptive display names to folders
