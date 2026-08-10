# <img src="assets/logo.png" data-canonical-src="/logo.png" width="32" height="32" /> noodle

[![Greptile: The War on Bugs](https://www.greptile.com/badge.svg)](https://www.greptile.com/?utm_source=oss_badge&utm_medium=readme&utm_campaign=greptile_for_open_source)

## Readable requests. Versioned workflows. No lock-in.

Noodle is a terminal HTTP client that keeps requests as readable YAML files in
your repository. Write, send, inspect, and automate API requests without a
database, cloud account, or proprietary format.

![Noodle TUI](assets/noodle.png)

<p align="center">
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/">Quick Start</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a> ·
  <a href="https://github.com/wilfredinni/noodle/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://app.notion.com/p/39128d9edba9809da834f351332baf57?v=39228d9edba98042ad07000cdbe5d751&source=copy_link">Roadmap</a>
</p>

## Why Noodle

- **Keep requests in files you own.** One `.yml` file per request makes API
  work easy to review, share, and version with Git.
- **Keep shared context beside code.** Folders provide inheritable headers and
  auth; environments resolve `$variables` for development, staging, and
  production.
- **Work interactively or automate confidently.** Use the terminal UI for
  everyday exploration, then run, audit, and manage collections from scripts
  or agent workflows.

## Get started

### Install

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

Or install with Homebrew:

```bash
brew tap wilfredinni/noodle
brew trust wilfredinni/noodle
brew install noodle
```

The curl installer places the binary in `~/.local/bin/noodle` and verifies the
release SHA-256 checksum before replacing an existing binary. See the
[installation guide](https://noodlerest.dev/docs/getting-started/installation/)
for supported platforms and source builds.

### Create and send a request

```bash
noodle collection create my-api
noodle request create users/get --url https://api.example.com/users/42 --collection ./my-api
noodle request run users/get --collection ./my-api
```

Open the same collection in the TUI whenever you want to edit and inspect it:

```bash
noodle --collection ./my-api
```

## A request is just YAML

```yaml
name: Get User
method: GET
url: $base_url/users/:userId
path_params:
  - name: userId
    value: $user_id
headers:
  Accept: application/json
```

Use `$variables` from an environment file, keep required URL segments in
`path_params`, and commit the request with the rest of your project. Noodle
supports headers, query parameters, JSON, form, multipart, and binary bodies,
plus bearer, basic, and API-key authentication.

For multipart file entries and binary `file_path` values, use a quoted `@/`
path such as `'@/Documents/report.pdf'` to start from the current user's home
directory. Noodle completes the shorthand in the TUI and expands it only when
it reads a file or creates an export.

## Features

### Create and organize requests

- One Git-friendly YAML file per request, with direct YAML editing when you
  need it.
- Inline editing for URLs, headers, query and path parameters, bodies,
  authentication, and request settings.
- JSON, form, multipart, and binary request bodies, plus bearer, basic, and
  API-key authentication.
- Home-rooted `@/` path completion for multipart file fields and binary uploads.
- Folders with inheritable headers and authentication, alongside environments
  with `$variable` substitution and a built-in editor.

### Inspect and iterate

- Formatted response bodies, headers, clipboard copy, and JSONPath filtering.
- Live network traces for proxies, requests, redirects, responses, and failures.
- Per-request response history with a timeline for revisiting prior work.
- Fuzzy request and folder search, and a side-by-side or stacked layout.

### Make the terminal yours

- More than 30 built-in themes and customizable keybindings.
- Keyboard-first navigation, jump mode, and mouse controls including sidebar
  context menus.

### Configure network and collection settings

Open **Settings** with `F4` or from the `Ctrl+P` command palette to use the
system `HTTP_PROXY`/`HTTPS_PROXY` settings, set an app-wide custom proxy, or
override the current collection in `settings.yml`. Custom proxy credentials can
be entered directly or use `$VARNAME` references, for example
`http://$PROXY_USER:$PROXY_PASSWORD@proxy.example:8080`. Variables for both app
and collection proxies come from the active Noodle environment. Direct app
credentials are stored in the app config, while direct collection credentials
are stored in `settings.yml`; review either file before sharing it. Bypass
entries are optional, comma-separated, and support `*`, hosts, `.domain`
suffixes, IP addresses, and optional ports.

Use `--noproxy` with the TUI, `collection run`, or `request run` to force
direct connections for that invocation.

Collection TLS settings support certificate verification, a custom PEM CA
bundle, and PEM client certificates for mutual TLS. Client certificates match
the interpolated request host and port exactly; relative paths resolve from the
collection root, and encrypted private-key passphrases can use an active
environment variable. Passphrases must be stored as one exact `$VARNAME`
reference; literals and interpolated strings are rejected. A custom CA bundle
replaces the default trusted roots, so include every root the collection needs.

```yaml
tls:
  verify: true
  ca_bundle: ./certs/internal-roots.pem
  client_certificates:
    - host: api.internal.example
      port: 443
      cert_file: ./certs/client-chain.pem
      key_file: ./certs/client-key.pem
      passphrase: $MTLS_PASSPHRASE
```

Requests can override only verification with `tls.verify`; omit it to inherit
the collection. Use `--insecure` with the TUI, `collection run`, or `request
run` for a one-invocation override. PFX/PKCS#12 is not supported by Noodle;
convert it to a PEM certificate chain and private key first.

Redirects are followed only to HTTP or HTTPS URLs. Noodle refuses HTTPS-to-HTTP
downgrades and removes authorization, proxy authorization, cookies, `Host`, and
API-key authentication headers before following a cross-origin redirect.
Those headers remain removed for the rest of that redirect chain; same-origin
redirects preserve them.

Collection metadata and response-history retention also live in
`settings.yml`. `timeline_max_entries` defaults to 50 per request; lowering it
prunes older entries, and `0` disables timeline recording.

```yaml
name: Payments API
description: |-
  Requests for the payments platform.
timeline_max_entries: 50
environment: development
```

`settings.yml` is validated strictly whenever a collection is opened, audited,
or run. Unknown keys, invalid field types, malformed proxy/TLS blocks, and YAML
errors stop the operation instead of silently falling back to defaults. A
missing or empty file still uses defaults.

### Bring in and run existing work

- OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia collection imports.
- A non-interactive CLI for collection inspection, validation, request runs,
  and agent workflows.

## Import an existing collection

Bring an OpenAPI 3.0/Swagger 2.0 specification, Postman collection, or Insomnia export into Noodle:

```bash
noodle import ./specs/api.yaml --output ./collections
```

Noodle detects the supported format automatically. Use `--format openapi`,
`--format swagger`, `--format postman`, or `--format insomnia` when you need to choose explicitly. Imported valid JSON
request bodies are pretty-printed automatically.

In the TUI, open the command palette with `Ctrl+P` and choose **Import
Collection**. Choose whether to create a new collection or import into the
current one; save pending changes before importing into the current collection.

## Export a collection

Export a collection as an OpenAPI 3.0.3 request catalog:

```bash
noodle export ./collections --format openapi --output ./specs/openapi.yml
```

The export includes requests, enabled parameters and headers, request-body
examples, folders as tags, and supported authentication schemes. Each
environment with an enabled, nonempty `base_url` becomes an OpenAPI server;
other environment values and response timeline data are never exported. The
output file must be outside the collection directory.

Export to Postman Collection v2.1 as a bundle directory instead:

```bash
noodle export ./collections --format postman --output ./exports/postman
```

The output directory must be new or empty and is created with
`collection.postman_collection.json` plus one
`<environment>.postman_environment.json` file per Noodle environment. Environment
values are always redacted to empty strings, while enabled/disabled states are
preserved. Request literals in URLs, headers, parameters, bodies, file paths, and
auth fields stay runnable and can contain secrets. Home-relative `@/` file paths
expand to absolute paths, which can expose local usernames and directories, so
review exports before sharing them. Response timeline data is never exported.

Noodle-specific TLS settings are not translated into OpenAPI or Postman
exports.

The TUI also offers **Export Collection** from the `Ctrl+P` command palette,
with OpenAPI and Postman formats and a preview of the target path.

## Automation CLI

`noodle` without a subcommand opens the interactive TUI. The commands below
are non-interactive and support `--json`, which emits one
`{ status, data, errors }` envelope for scripts and agents.

| Command                                                                | Use it to                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `noodle workspace list`                                                | List registered collections.                             |
| `noodle collection create <name>`                                      | Create and register a collection.                        |
| `noodle collection inspect <path>`                                     | Inspect a collection's tree, metadata, and environments. |
| `noodle collection format <path>`                                      | Canonicalize request YAML and pretty-print JSON bodies.  |
| `noodle collection audit <path>`                                       | Validate collection files.                               |
| `noodle collection run <path>`                                         | Run every request in a collection.                       |
| `noodle export <path> --format <openapi\|postman> --output <path>`     | Export OpenAPI or a redacted Postman bundle.             |
| `noodle request create <id> --url <url> --collection <dir>`            | Create a minimal request.                                |
| `noodle request run <id> --collection <dir>`                           | Run one request.                                         |
| `noodle environment set <key> <value> --env <name> --collection <dir>` | Set an environment value.                                |

Run commands accept `--env <name>` when you want to override the collection's
default environment. Request IDs are collection-relative paths without `.yml`,
such as `users/get`.

For all commands, path rules, and JSON output details, see the
[CLI reference](https://noodlerest.dev/docs/getting-started/cli/).

## Use with AI agents

Install the `noodle-use` skill to teach supported coding agents how to create,
organize, audit, import, and automate Noodle collections.

```bash
npx skills add wilfredinni/noodle --skill noodle-use -g
```

Try prompts such as:

- “Scaffold a Noodle collection for the Stripe API with authentication and a few endpoints.”
- “Audit this collection for security issues and REST best practices.”
- “Convert this Insomnia export to a Noodle collection.”

Read the [AI agent skills guide](https://noodlerest.dev/docs/guides/ai-agent-skills/)
for supported workflows and examples.

## Updating

```bash
noodle update
```

Standalone installs use Noodle's update manifest and verify the matching
binary's SHA-256 checksum before replacement. Update checks are cached for one
hour; use `noodle update --force` to check immediately. Homebrew installs run
`brew upgrade noodle`.

## Development

```bash
bun install
bun run dev -- --collection ./collections --env development
bun test
bun run lint
bun run typecheck
bunx prettier --check ./src ./tests
```

`bun install` also enables the project's Git hooks. The pre-commit hook formats
and lints staged source and test files; the pre-push hook runs type checking
and the full test suite.

See [AGENTS.md](AGENTS.md) for architecture, conventions, testing guidance,
and release commands.
