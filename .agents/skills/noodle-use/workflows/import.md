# Import workflow (CLI)

Convert OpenAPI 3.0 and Postman collections to noodle format using the `noodle import` CLI command.

## Prerequisites

`noodle` must be installed as a binary. The import subcommand is built into the noodle binary. Verify:

```bash
noodle import --help
```

If `noodle` is not found, guide the user to install: `brew install noodle` (macOS) or `curl -LsSf https://raw.githubusercontent.com/wilfredinni/noodle/main/scripts/install.sh | sh` (Linux/macOS).

## Import workflow

### Step 1: Identify the source file

Get the file path from the user. Common extensions:
- `.yaml` / `.yml` / `.json` → OpenAPI 3.0
- `.postman_collection.json` → Postman

### Step 2: Detect the format

If the user doesn't specify a format:
- Check file extension
- Check file content for signatures:
  - OpenAPI: contains `openapi:`, `paths:`, `info:` at top level
  - Postman: contains `info.schema` with `postman.com` URL
- If ambiguous, ask the user

### Step 3: Run the import

```bash
noodle import <source-path> --format <openapi|postman> --output <target-dir> --json
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
├── folder.yml                 (if root-level auth/headers were detected)
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
- **Check auth**: OpenAPI `securityDefinitions` and Postman auth are converted to noodle auth. Verify correctness.
- **Check environments**: Base URL and variables from the spec are extracted to env files. Verify values.
- **Rename folders**: Imported folder names may be tag names or path segments. Adjust `meta.name` for readability.
- **Remove unused requests**: The importer may generate endpoints you don't need. Delete `.yml` files manually.
- **Add `_color` to envs**: Imported environments may not have `_color`. Add it.

### Step 6: Run the evaluate workflow

After import, run the evaluate checks (see [evaluate.md](evaluate.md)) on the imported collection to catch common issues.

## OpenAPI-specific notes

OpenAPI 3.0 imports map:
- `info.title` → collection root name
- `servers[].url` → `$base_url` in environment
- `paths` → request `.yml` files, one per operation
- `parameters` → `params` field on requests
- `requestBody` → `body` + `body_type`
- `securityDefinitions` → `folder.yml` auth override or inline `auth` on requests
- Tags → folder grouping

Multiple servers in the spec create multiple environments.

## Postman-specific notes

Postman imports map:
- Collection name → collection root name
- Collection auth → `folder.yml` auth override
- Folder hierarchy → noodle folder structure
- Request auth → inline `auth` on requests (or `inherit` if same as parent)
- Pre-request scripts → not imported (noodle doesn't support scripts)
- Tests → not imported
- Collection variables → environment file

## After import

Always suggest the user:
1. Open the collection in noodle TUI to verify visually: `noodle -c <target-dir>`
2. Run a few requests to verify auth and URL substitution work
3. Adjust folder ordering with `seq`
4. Add descriptive display names to folders
