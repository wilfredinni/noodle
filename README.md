# noodle

A terminal REST client. Inspect, send, and iterate on HTTP requests from YAML files on disk — inspired by [Bruno](https://github.com/usebruno/bruno).

## Status

Pre-v1. Core request lifecycle works end-to-end; the UI supports inline editing of request fields. See [Roadmap](#roadmap-to-v1).

## Quick start

```bash
bun install
bun run dev -- --collection ./collections --env development
```

Flags:

- `--collection <dir>` — collection directory to load (default `./collections`)
- `--env <name>` — environment name; loads `environments/<name>.yml` (optional)
- `-h, --help`

Requests are `.yml` files, one per request:

```yml
name: Get user
method: GET
url: http://{{host}}/users/{{id}}
headers:
  Authorization: Bearer {{token}}
params:
  id: "42"
```

Environments are `.yml` files holding `{{var}}` values:

```yml
name: development
vars:
  host: localhost:3000
  token: dev-token-123
```

## What works today

- **YAML request language** — `lang.parseRequest` / `serializeRequest`. Strict, typed, preserves `{{var}}` literals.
- **Filestore** — `loadCollection(dir)` walks a folder of `.yml` files into a `Collection`. `saveRequest(dir, req)` writes one back.
- **Request execution** — `executor.send(req, env?)` via Bun fetch. `substitute(req, env)` replaces `{{var}}` in url/headers/params/body/auth before fetch. Returns a `Response` for any HTTP status; throws only on transport errors (with `{ cause }`).
- **Environment loading** — `env.loadEnvironment(dir, name)` reads `environments/<name>.yml`, strict-validated (name, vars, unknown keys rejected; non-string values coerced). Path-traversal-safe.
- **CLI args** — `--collection`, `--env`, `--help`.
- **OpenAPI 3.0 importer** — `openApiImporter.import(spec)` converts an OpenAPI 3.0 spec (JSON or YAML) into a `Collection`, emitting `{{var}}` placeholders for path/query/header params and auth (bearer/basic).
- **Request pane** — renders full request detail: method (color-coded by verb), url, sorted headers, sorted params, pretty-printed JSON body, and masked auth. Inline editing for url, headers, params, and body via edit-browse mode (`e` to enter, `↑/↓` to navigate fields, `e/Enter` to edit, `Enter` to commit, `Esc` to cancel).
- **Sidebar** — lists requests from the loaded collection, arrow-key navigation, selection highlight.
- **Response pane** — renders idle / sending / done / error states. Done state shows status line (color-coded), sorted headers, and pretty-printed JSON body.
- **Send trigger** — press `s` to send the active (possibly edited) request with the current env. Edits are session-local until saved.

## Roadmap to v1

v1 = a **usable terminal UI**: you can browse a collection, see a request's full detail, edit it inline, send it with an environment, and save changes back to disk.

### 1. Full request detail view ✅

`RequestPane` renders the full request: method (color-coded), url, sorted headers, sorted params, pretty-printed body, and masked auth. Read-only foundation for editing.

### 2. Inline editing of request fields ✅

Edit url, headers, params, and body in-place before send via an edit-browse mode (`e` to enter, `↑/↓` to navigate fields, `e/Enter` to edit, `Enter` to commit, `Esc` to cancel). Body is single-line raw input; multiline deferred. Edits are session-local and preserved per request across sidebar switches.

### 3. Environment indicator + runtime switching

Show the active env name in the footer/header. Add a keybind to cycle loaded envs without restarting (loads all `environments/*.yml`, picks by name). Today env is CLI-only (`--env`); v1 exposes it in the UI.

### 4. Save request changes back to disk

Wire `filestore.saveRequest(dir, req)` to a keybind (e.g. `w`) so edited requests persist to their `.yml` file. Confirms overwrite.

### 5. Focus management between panes

`Tab` currently a no-op placeholder. Implement real focus cycling: Sidebar → Request pane → Response pane. Focused pane receives edit/key input.

### 6. Help overlay

`?` toggles a keybinding cheatsheet overlay. Lists all keys grouped by pane.

### Deferred past v1

- OpenAPI import via UI (CLI-only today)
- Multi-collection switching
- Request folders / nesting
- Response search / filtering
- Variable scoping per-request
- `.yaml` extension support (`.yml` only)

## Project layout

```
src/
├─ schema/        # Method, Auth, Request, Collection, Response, Environment types
├─ lang/          # YAML request language: parse + serialize
├─ filestore/     # loadCollection / saveRequest (disk I/O)
├─ env/           # loadEnvironment (env file I/O + validation)
├─ requests/      # executor.send + substitute ({{var}} replacement)
├─ converters/
│  └─ openapi/    # OpenAPI 3.0 → Collection importer
├─ app/           # CLI args, entry point, keymap stub
└─ ui/            # React components + hooks (Sidebar, RequestPane, ResponsePane, App)
collections/      # sample request .yml files
environments/     # sample env .yml files
tests/            # bun:test suites (317 tests)
```
