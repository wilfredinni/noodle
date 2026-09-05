# Architecture

## Collection directory layout

Example collection on disk:

```
my-collection/
├── settings.yml              ← { collection_id: UUID, environment: "dev" }
├── list-users.yml            ← Request file: id = "list-users"
├── get-user.yml              ← Request file: id = "get-user"
├── auth/
│   ├── folder.yml            ← { meta: { name: "Auth", seq: 1 }, headers: {...} }
│   ├── login.yml             ← Request: id = "auth/login"
│   └── refresh.yml           ← Request: id = "auth/refresh"
├── .environments/
│   ├── development.env       ← KEY=value or # @secret KEY + blank KEY=
│   └── production.env
├── .noodle/
│   ├── collection-id         ← Concurrency-safe ID reservation
│   └── ui-state.yml          ← Last selection, expanded folders, per-request tabs
├── .timeline/                ← Per-request response history (max 50 entries each)
│   ├── list-users.yml
│   ├── list-users.yml.bodies/  ← Gzip sidecars for bodies over 10 KB
│       └── <entry-id>-response.gz
│   └── auth/
│       └── login.yml
└── .git/                     ← Skipped by walk()
```

### How `walk()` loads a collection

`filestore/load.ts: walk()` recursively reads the directory tree:

1. **Resolve path** — follows symlinks via `realpath()`, detects symlink escapes
2. **Read directory entries** — `readdir()` with `withFileTypes`
3. **Skip hidden** — entries starting with `.` are ignored (both files and dirs)
4. **Skip known dirs** — `.noodle`, `.timeline`, `.git`, `node_modules` are skipped
5. **Folders** — read optional `folder.yml` for meta (name, seq) and overrides (headers, auth); recurse into children
6. **Requests** — read `.yml` files (skip `settings.yml` and `folder.yml`); parse with `lang.parseRequest(id, yaml)`
7. **Sort** — folders by `seq` then name, requests alphabetically; folders always before requests

### Request ID convention

Request IDs are their **relative path from collection root, minus the `.yml` extension**. A file at `auth/login.yml` gets ID `"auth/login"`. This ID is used for:

- Navigation (`selectedId` in tree)
- File I/O (`join(dir, ${id}.yml)`)
- Timeline storage (`join(.timeline, ${id}.yml)`)
- UI state persistence (per-request entry in `.noodle/ui-state.yml`)

### URL path parameters

Requests may declare URL path tokens as `:name` (for example,
`https://api.example.com/users/:userId`). The matching `pathParams` entries
are required values, are synchronized when the URL changes, and serialize as
`path_params` in request YAML. They do not have an enabled/disabled state:
every token in the URL is substituted before sending. OpenAPI `{name}` paths
are converted to this form by the importer.

### `folder.yml` format

```yaml
meta:
  name: My Folder # Display name (defaults to directory name)
  seq: 1 # Sort order (lower = first, undefined = last)
headers: # Merged additively: folder header only if request doesn't have same key
  X-API-Key: $API_KEY
auth:
  type: bearer # Used when request auth is "inherit"
  token: $TOKEN
```

Folder overrides are resolved in `requests/mergeFolderOverrides.ts` — walks ancestor folders bottom-up. A root-level `folder.yml` is skipped by the loader and does not apply to root requests.

### Hidden state files (`.noodle/`)

| File           | Format | Purpose |
| -------------- | ------ | ------- |
| `ui-state.yml` | YAML   | `lastRequest`, `expanded_folders`, and per-request `{ request, response }` tab preferences |

### `settings.yml`

Collection-level settings at the root, loaded by `filestore/loadSettings()`:

```yaml
collection_id: 123e4567-e89b-42d3-a456-426614174000 # Generated vault namespace
name: Payments API # Optional display name
description: Requests for the payments platform. # Optional notes
timeline_max_entries: 50 # Per-request history retention; 0 disables
environment: development # Last active environment name
cookies:
  enabled: true # Default; disable the jar for this collection with false
proxy:
  mode: custom # "inherit", "off", or "custom"
  url: http://proxy.example:8080
  bypass: [localhost, .internal.example]
  auth: true # Credentials live in the OS vault
tls:
  verify: true
  ca_bundle: ./certs/internal-roots.pem
  client_certificates:
    - host: api.internal.example
      cert_file: ./certs/client-chain.pem
      key_file: ./certs/client-key.pem
      secret_id: 123e4567-e89b-42d3-a456-426614174001
```

`name` and `description` drive collection display in the Settings workspace.
`timeline_max_entries` must be a non-negative safe integer and pruning removes
evicted large-body sidecars. Collection proxy mode is `inherit`, `off`, or
`custom`. The global `config.yml` proxy mode is `system`, `off`, or `custom`.
Custom URLs reject credentials and variables. `auth: true` records that
credentials are enabled; the username and optional password live in the OS
vault. `--noproxy` overrides every saved policy for a single TUI or automation
run. `cookies.enabled` defaults to `true`; disabling it prevents both sending
and capturing collection jar cookies. TLS supports verification, one custom CA
bundle, and exact-host/port PEM
client certificates. Encrypted-key passphrases live in the vault and profiles
retain only a generated `secret_id`; `--insecure` disables verification for one
run. `collection_id` is generated and persisted so collection-scoped vault
accounts survive directory moves. Settings load as `{}` when the file is
missing or empty. Invalid settings throw and terminate bootstrap.

### Cookie jar

`src/cookies/index.ts` owns one `tough-cookie` jar per generated
`collection_id`. Jars live outside collections at
`~/.config/noodle/cookies/<collection_id>.json`, use an OS-vault-backed
AES-GCM key when available, and fall back to a mode-`0600` plaintext file with
a persistent warning. Lock files plus an append-only mutation journal keep
concurrent handles from overwriting one another.

Opening malformed, undecryptable, or otherwise unreadable storage returns an
`unavailable` status. Requests continue without jar cookies and do not replace
the file. Retry reopens the jar; reset first renames existing storage to a
timestamped backup. `flushAll()` persists pending mutations before shutdown.

### User-relative file paths

Multipart file entries and binary `file_path` values may use a quoted `@/`
prefix, such as `'@/Documents/report.pdf'`, for the current user's home
directory. Keep that shorthand in request YAML: `expandUserPath()` resolves it
only at output boundaries, including file reads, HAR generation, and Postman
export; `collapseUserPath()` converts in-home absolute paths back for TUI
display and completion.

### Timeline (`.timeline/`)

Per-request response history stored as YAML arrays of `TimelineEntry` objects. Retention defaults to 50 entries per request and is configurable through `timeline_max_entries` (FIFO — `unshift` + truncate); `0` disables history. Files mirror the request ID structure: `.timeline/auth/login.yml` for request `auth/login`. Bodies over 10 KB are gzip-compressed into a sibling `.yml.bodies/` directory; the entry stores a `bodyRef` with its filename, encoding, and byte size. Eviction and timeline clearing remove associated sidecars. Request snapshots and response fields redact known environment, proxy, TLS, credential, cookie, sensitive-header, and captured-secret values before persistence. Public variables and arbitrary server payload fields remain intact, so timeline files and sidecars are still sensitive.

### File write conventions

- **`saveRequest()`**: `validatePathId()` → `mkdir` parent → write `.yml` file. Non-atomic (direct write).
- **`saveFolder()`**: `validatePathId()` → `mkdir` dir → write `folder.yml`. Non-atomic.
- **`saveEnvironment()`** (`env/save.ts`): Atomic replacement writes to `.tmp` then `rename()`; `{ mode: "create" }` links the staged file exclusively so collisions never overwrite the destination.
- **`saveSettings()`**: Atomic — writes to a temporary file then replaces `settings.yml`.
- **`deleteFolder()`**: `rm(path, { recursive: true, force: true })` — wipes entire folder including .yml files and subdirs.
- **Migration** (in `walk()`): If a normal collection `.yml` file lacks `timeout:` field, auto-serializes and writes the request back. Browse mode disables migration and tolerates invalid request YAML.

### `validatePathId()` rules

Save/delete paths must call `validatePathId()`. Current validation rejects:

- Missing/empty ID
- `"."` or starts with `"./"`
- Absolute paths (starts with `"/"`)
- Contains `".."` or `"\"`

### Adding new persistent state

Follow existing patterns:

- **Collection-level config**: Add to `settings.yml` via `saveSettings()` + `loadSettings()`
- **Settings workspace**: Route global and collection forms through `SettingsView.tsx`; queue collection writes with `settingsPersistence.ts` so rapid changes cannot race.
- **UI state**: Extend `.noodle/ui-state.yml` and its serialized writer in `src/ui/tabs/uiState.ts`; its write mutex preserves concurrent updates to selection, folders, and tab preferences
- **New hidden directory**: Add name to `SKIP_DIRS` in `load.ts` so `walk()` skips it
- **Global user config**: Use `~/.config/noodle/config.yml` via `useConfig` hook
- **Secrets**: Store values through `src/secrets/index.ts`; persist only declaration or ID metadata and wrap coupled settings/vault changes in `applySettingsSecretTransaction()`
- **Cookie jars**: Keep runtime jar state under the Noodle config directory and namespace it by `collection_id`; never put cookie values in collection YAML

## Code editor architecture

`CodeEditorRenderable` (`src/ui/editor/CodeEditor.ts`) extends OpenTUI's `TextareaRenderable` and orchestrates focused editor modules:

### Tree-sitter highlighting

- Parsers registered via `src/ui/editor/codeEditorParsers.ts`: JSON (`tree-sitter-json.wasm` + `highlights.scm`), YAML (`tree-sitter-yaml.wasm` + `highlights.scm`)
- `CodeEditorRenderable` schedules asynchronous highlighting with a 200ms debounce; `codeEditorHighlightRenderer.ts` applies Tree-sitter or fallback ranges
- Fallback local tokenizers when tree-sitter fails (JSON: `src/ui/editor/syntax.ts`, YAML: `src/ui/editor/yamlSyntax.ts`)
- Theme-synced syntax styles (`json.key`, `json.string`, `yaml.key`, etc.)
- Variable highlighting: `env.resolved` (primary color) / `env.missing` (error color) via `extraHighlights` callback
- Tree-sitter byte-to-display offset mapping via `src/ui/editor/codeEditorOffsets.ts`; variable highlights use `src/ui/variable-completion/highlightOffsets.ts`

### Code folding

- `toggleFold(line)` — fold/unfold by Ctrl+G at cursor line
- `foldAll()` / `unfoldAll()` — configurable global actions, unbound by default
- Folding and fold-display mapping in `codeEditorFoldManager.ts` and `codeEditorFolds.ts`; fold signs stay aligned with the original source line numbers while folded interior rows are omitted
- Auto-unfold on edit in folded region
- Preserves cursor position during fold/unfold operations
- Fold state persisted across content changes

### Validation

- `codeEditorValidation.ts` owns `validateContent` callbacks and inline JSON/YAML validation state
- `jsonValidation.ts` uses `jsonc-parser` to report source line/column errors after `$variable` substitution and identifies invalid substituted values
- Error notice displayed via `src/ui/editor/ValidationNotice.tsx` component

### Component registration

- Custom `<code-editor>` JSX element declared in `src/ui/jsx-types.d.ts`
- Registered at startup in `src/app/main.tsx` via `extend({ "code-editor": CodeEditorRenderable })`

### Inline JSON request body editor

- `RequestPane` renders JSON bodies outside its pane scrollbox so the editor owns vertical scrolling.
- `request-pane/RequestBodyTab.tsx` always renders JSON with `<code-editor>`; it uses the request body while browsing and `editValue` while editing.
- `RequestResponseView` passes `draft.setBody` as `onBodyChange`, so editor content updates the request draft directly.
- While editing JSON, Escape and Shift+Tab return to the body-type selector and retain the live draft; Ctrl+Z handles body undo.

### Read-only response body editor

- `ResponsePane` renders response bodies with a read-only `<code-editor>` and `CodeEditorScrollBarRenderable`.
- JSON folds can be toggled from the gutter or keyboard; `codeEditorGutter.ts` keeps fold signs and source line numbers synchronized.
- Read-only selections and copy operations expand folded display text back to the original source.

## Variable completion architecture

Cursor-aware `$variable` completion system across all text inputs:

### Core (src/ui/variable-completion/variableCompletion.ts)

- `getVariableToken(value, cursorOffset)` — parses `$`-prefixed word at cursor position
- `getVariableSuggestions(vars, prefix)` — filters env var names by typed prefix
- `replaceVariableToken(value, cursorOffset, name)` — replaces `$pre` → `$name`, returns new cursor position

### Hook (src/ui/variable-completion/useVariableCompletion.ts)

- `useVariableCompletion(variableNames)` — returns `{ completion, getCompletion, makeHandleKey }`
- `completion` state: `{ suggestions, selectedIndex, visible }` or `null`
- `getCompletion(value, cursorOffset)` — triggers completion, anchored at cursor position
- `makeHandleKey()` — returns key handler for up/down/tab/return/escape in completion context
- Max 10 suggestions visible (`MAX_COMPLETION_VISIBLE`)

### Integration (src/ui/variable-completion/variableCompletionInterceptor.tsx)

- `VariableCompletionInterceptor` component registers high-priority (200) key interceptor on keymap
- `registerVariableCompletion(handler)` — adds to Set, returns cleanup
- Multiple handlers supported — env editor, code editor, VarInput each register their own

### UI (src/ui/VarInput.tsx)

- 3 modes: `<input>` (single-line), `<textarea>` (multi-line), read-only `<VarText>`
- Completion popup rendered as portal (z-index 10000) anchored to cursor position
- Navigate suggestions with up/down, accept with tab/return, dismiss with escape

### Highlighting (src/ui/variable-completion/variableHighlight.ts, src/ui/variable-completion/envHighlight.ts)

- `highlightVariables()` — applies `env.resolved`/`env.missing` styles to Input/Textarea
- `splitEnvVars(text, env)` — segments text into plain + `$var` segments with resolved/missing flags

## Command palette architecture

### Building commands (src/ui/commands.ts)

- `buildCommandPaletteCommands(context)` — assembles command arrays using `context.getView()`:
- Main view: Request commands, Response commands, Environment commands, Workspace commands, System commands
  - Env editor: Environment commands (different set), Workspace, System
- Each `CommandItem`: `{ id, label, section, keybinding?, run: () => boolean }`
- Commands declare `section`; `CommandPaletteOverlay` builds non-navigable section headers

### Executing commands (src/ui/commandActions.ts)

- Reusable command helpers are exported for shared keymap and palette behavior:
  `saveRequest`, `editRequestOverlay`, `getEditRequestYamlFile`, `getEditFolderYamlFile`,
  `newRequest`, `cloneRequest`, `deleteRequest`, `deleteFolder`,
  `copyResponseBody`, `openResponseQuery`, `canGenerateClientCode`,
  `fetchOAuth2Token`, `copyOAuth2Token`, `clearCurrentOAuth2Token`,
  `cycleEnvironment`, `openEnvironmentEditor`,
  `saveEnvironment`, `newEnvironment`, `cloneEnvironment`, `deleteEnvironment`,
  `newFolder`, `toggleLayout`, `togglePaneExpand`, `undoAll`,
  `toggleHelp`, `openThemePicker`, `openAbout`, `openCollectionSwitcher`
- Keymap layers and `commands.ts` use these helpers; palette composition retains view-state actions such as send
- `run()` returns `true` (close palette) or `false` (stay open)

`Import Collection` and `Export Collection` are Workspace commands. Their
overlays live in `src/ui/overlays/ImportCollectionOverlay.tsx` and
`ExportCollectionOverlay.tsx`; orchestration stays in `AppInner.tsx`, while
`collectionImport.ts` and `collectionExport.ts` validate destinations and run
the application services.

### Picker (src/ui/overlays/PickerOverlay.tsx)

- Generic `<PickerOverlay<T>>` renders search input + filtered list
- `isNavigable` prop skips non-selectable items (section headers) during up/down/return
- Used by: `CommandPaletteOverlay`, `CollectionSwitcherOverlay`, `ThemePickerOverlay`
- Keyboard: up/down navigate, return select, escape close

## Theme architecture

### Theme data (src/ui/theme-data.ts)

- 34 themes defined in `THEMES[]` array; `noodle` is the default when no theme is saved
- `Theme` interface: `{ name, primary, secondary, accent, error, warning, success, info, text, textMuted, background, backgroundPanel, backgroundElement, border, borderActive, borderSubtle, borderDimmest }`

### Theme provider (src/ui/theme.tsx)

- `ThemeProvider` — React context, supports preview index (`previewIndex` prop)
- `useTheme()` — reads current theme from context
- `ThemePickerOverlay` — searchable theme picker with live preview, ● indicator for active theme, uses `PickerOverlay`
- Theme persisted to `~/.config/noodle/config.yml` via `useConfig` hook

### Syntax styling

- Syntax highlight style IDs (`json.key`, `yaml.string`, etc.) mapped to theme colors
- `styleIdForFg(color)` in `src/ui/editor/yamlSyntax.ts` — creates style entry
- Both CodeEditor and VarInput use theme-aware syntax styles

## Clipboard architecture

`copyToClipboard(text, renderer)` in `src/ui/clipboard.ts`:

1. Tries native clipboard commands: `pbcopy` (macOS), `xclip` (X11), `wl-copy` (Wayland), `clip.exe` (Windows)
2. Falls back to OSC 52 escape sequence via `renderer.copyToClipboardOSC52()`
3. Returns boolean success — used by `copyResponseBody` action to show toast on success/failure

## Module dependency flow

```
schema/          ← Zero-dependency types: Request, Folder, Auth, Response, Environment, TimelineEntry
  ↓
auth/            ← Shared defaults for auth variants
  ↓
lang/            ← YAML ↔ typed objects: parseRequest, serializeRequest, parseFolder, shared auth parser
  │   (also: tree-sitter WASM parsers for JSON/YAML in lang/parsers/)
  ↓
filestore/       ← Disk I/O: loadCollection, saveRequest, deleteRequest, timeline, settings
  ↓
env/             ← Dotenv files: loadEnvironment, listEnvironments, save, clone
  ↓
cookies/         ← Per-collection tough-cookie jar, encrypted persistence, locking, recovery
  ↓
requests/        ← HTTP layer: send, substitute, mergeFolderOverrides, static auth, OAuth signing and tokens
  ↓
hooks/           ← React state: useCollection, useRequestDraft, useResponse, useEditBrowse, useEnvironments,
  │                 useConfig, useEnvironmentEditor, useFolderDraft, etc.
  ↓
ui/              ← OpenTUI components + pure helpers + keymap layers
  │   ├── editor/CodeEditor.ts — renderable orchestration; highlight, fold, key, style, and validation modules
  │   ├── variable-completion/variableCompletion.ts — $var autocompletion engine
  │   ├── commands.ts / commandActions.ts — command palette infrastructure
  │   ├── theme.tsx / theme-data.ts: 34 themes with live preview
  │   ├── settings/SettingsView.tsx — global and collection Settings workspace
  │   ├── settings/ProxySettingsForm.tsx — proxy policy editor
  │   ├── clipboard.ts — multi-platform clipboard + OSC 52 fallback
  │   ├── editor/codeEditorParsers.ts — tree-sitter parser registration
  │   └── editor/yamlSyntax.ts — YAML syntax styling
  ↓
app/             ← CLI entry: parseArgs → createCliRenderer → createRoot → <App>
```

Each layer only depends on layers above it. UI orchestration hooks and editor overlays may use filestore operations directly when they own collection I/O; request sending stays routed through response and request hooks.

## Data flow: request lifecycle

```
.yml file on disk
  → filestore/load.ts walk() reads directory tree
  → lang/parse.ts: parseRequest(id, yamlText) — strict validation, rejects unknown keys
  → useCollection: Collection in state, loading flag
  → useTreeNavigation: visibleNodes() flattens tree, cursorIndex → selectedRequest
  → useRequestDraft: Draft Map<id, Request> holds unsaved edits
     ├── applyDraft(draftOp): copies current → applies mutation
     │   Body/auth type switching caches prior state internally
     └── isDirty: deep equality check against original
  → useEditBrowse: EditState FSM for field-level editing
     Modes: inactive → browsing (navigate) → editing (commit/cancel)
     commitEdit() dispatches to draftMutators
   → SAVE: lang/serialize.ts → filestore/save.ts (direct write)
  → SEND: requests/send.ts pipeline:
     1. mergeFolderOverrides(req, collection, path)
     2. substitute(req, env) — $var replacement
     3. Build URL with params
     4. Apply static auth headers, or resolve OAuth 2 secure token state before the request loop
     5. Resolve proxy and TLS policy from RequestExecutionOptions for each leg
     6. Merge matching jar cookies for this redirect leg unless `sendCookies: false`; explicit request cookies win by name
     7. Apply OAuth 2 tokens, AWS SigV4 signing, OAuth 1.0a signing, or the NTLM handshake path as required
     8. fetch() with proxy/TLS options and AbortSignal timeout
     9. Capture each response's Set-Cookie headers, including redirect and NTLM handshake responses
     10. Manually follow HTTP(S) redirects; block downgrades, strip cross-origin credentials, and reapply allowed auth per leg
  → shared send paths use one declarative response sequence
    (`executionResults.ts` owns steps 4-6):
     1. Resolve environment values and create or reuse RunScope
     2. Execute the substituted request
     3. Build status, response.time, case-insensitive header, and JSON-body views
     4. Evaluate captures in declaration order
     5. Commit successful captures to RunScope
     6. Evaluate assertions against the same views
     7. Produce structured results and, for manual TUI sends only, safe timeline history
  → useResponse: SendState FSM → idle → sending → done | error
  → ResponsePane: renders body (JSON highlighting), headers, network, timeline, and final-leg sent/received cookies
```

## Component tree

```
App (src/ui/App.tsx)
  ThemeProvider
    Toast
    AppInner (src/ui/AppInner.tsx)
      ├── Header               ← Version/update status plus clickable collection and environment context
      ├── Sidebar              ← Collection tree, cursor navigation
      ├── MainView             ← Dispatches folder vs request view
      │   ├── [folder mode]
      │   │   └── FolderPane           ← Tabs: meta/headers/auth/activity
      │   │       ├── FolderMetaTab
      │   │       └── FolderActivityTab
      │   └── [request mode]
      │       └── RequestResponseView
      │           ├── UrlBar
      │           ├── RequestPane      ← Tabs: headers/params/body/auth/settings
      │           │   ├── KeyValueSection / JsonBodyViewer / AuthEditor / FormEditor / Select / Checkbox
      │           │   └── [body tab] CodeEditor (JSON) or FormEditor or VarInput
      │           └── ResponsePane     ← Tabs: foldable body/headers/network/timeline
      ├── EnvironmentEditorView  ← 3-pane env editor (sidebar + header + vars)
      │   ├── EnvSidebar
      │   ├── EnvHeaderPane
      │   └── EnvEditorPane
      ├── CookieJarView         ← 2-pane cookie workspace (domain sidebar + cookie list)
      │   ├── CookieJarSidebar
      │   └── CookieJarPane
      ├── [overlays] (rendered in AppOverlays.tsx)
      │   ├── PickerOverlay (generic base) → used by command, collection, environment, theme, and request pickers
      │   ├── HelpOverlay, YamlEditorOverlay (CodeEditor for YAML)
      │   ├── NewRequestOverlay, CloneRequestOverlay, NewFolderOverlay
      │   ├── CommandPaletteOverlay, CollectionSwitcherOverlay, EnvironmentPickerOverlay, RequestFinderOverlay
      │   ├── NewEnvironmentOverlay
      │   ├── ImportCurlOverlay, CodeGeneratorOverlay
      │   ├── ConfirmOverlay (save, delete, undo-all, collection-switch)
      │   └── ValidationNotice
      └── StatusBar            ← Contextual pane/mode shortcuts and send action
```

**Focus model** (src/ui/focus.ts):

- Main cycle: `sidebar → urlbar → request → response` (4 panes, wraps)
- Folder cycle: `sidebar → folder` (2 panes, when selected item is a folder)
- Env editor cycle: `env-sidebar → env-header → env-vars` (3 panes)
- Cookie jar cycle: `cookie-sidebar → cookie-list` (2 panes)
- Active pane gets **cyan border** (`theme.primary`) via `borders.ts` FullBorder/LeftBar presets
- `toggleExpand()` switches between null, `"request"`, `"response"` — F2 expands/collapses focused pane
- `getContextualSegments()` in `StatusBar.tsx` derives shortcut hints from focus, edit mode, view, collection mode, active tab, and response-filter visibility

## CLI flow

`src/app/cli.ts` — citty main entry with subcommands:

```
createMain(main) — citty argparse
  │
  ├── "noodle" (default) → commands/default.ts
   │     ├── positional target path (overrides --collection)
   │     ├── --collection/-c (fallback: first registered collection, then current directory)
  │     ├── --env/-e
  │     └── run() → bootstrap(options) in main.tsx
  │
   ├── "import" → commands/import.ts
         ├── source (positional, required)
         ├── --format/-i (auto-detect if omitted)
         ├── --output/-o (default: ./collections)
         └── run() → lazy-load importers, runImport(options)
   │
   ├── "update" → commands/update.ts
   │     ├── Rejects Bun development runtime
   │     ├── Detects Homebrew install paths and runs `brew upgrade noodle`
   │     ├── Reads `https://noodlerest.dev/update.json`, validates stable version and SHA-256 asset entries
   │     ├── Caches validated manifest data for one hour, with a seven-day stale fallback
   │     ├── Downloads, SHA-256 verifies, and atomically replaces standalone binary
   │     └── Refreshes an existing managed `noodle-use` skill without failing a successful Noodle update
   │
   ├── "agent install" → commands/agent.ts → agentSkill.ts
   │     └── Writes the embedded managed skill and links detected agent skill directories
   │
   └── "workspace" | "collection" | "request" | "environment" | "secret" | "cookie"
         └── commands/automation.ts → services.ts → filestore/env/executor
              ├── non-interactive resource operations
              ├── optional --json result envelope via commandResult.ts
              └── collection/request run resolves targets, --env, proxy/TLS vault data, assertions, then settings.yml
```

### TUI path classification

`bootstrap()` classifies the selected directory before loading it:

- `collection`: `.environments`, `settings.yml`, or root request `.yml` exists. Loads normally and enables editing, saving, and sending.
- `browse`: request `.yml` exists somewhere below the directory, but no collection marker exists. Loads tolerantly and read-only for inspection.
- `empty`: directory has no request YAML or collection marker. Opens read-only until initialized.
- `invalid`: missing path or non-directory. Prints an error and exits nonzero.

Browse and empty modes allow global inspection actions such as help, theme, layout, reload, and command palette. Collection-only actions remain unavailable until initialization creates `settings.yml` and a development environment.

**Bootstrap** (`src/app/main.tsx`): Extracted `bootstrap()` function that:

- Lists environments, validates `--env` flag
- Loads settings, last request, keybind overrides
- Creates renderer, keymap, Ctrl+C handler
- Mounts root React component

**Import mode** (`src/app/import.ts`): Called via `import` subcommand. Lazy-loads importers on first call (reduces startup cost). Detects format, converts, writes output.

**Update mode** (`src/app/commands/update.ts`): Standalone release binaries read the Noodle update manifest and cache its validated version and checksums in `~/.config/noodle/update-cache.json`. A valid cached manifest avoids repeat checks for one hour and remains available for update fallback for seven days. Downloaded binaries must match the manifest SHA-256 before atomic replacement. Homebrew installs run `brew upgrade noodle`; Bun development runtimes cannot self-update. When a managed `noodle-use` installation already exists, `updateInstall.ts` refreshes it with the updated executable and reports a retry without rolling back a successful Noodle update if refresh fails.

**Agent skill mode** (`src/app/commands/agent.ts` + `src/agentSkill.ts`): `noodle agent install [--json] [--force]` writes the embedded `noodle-use` files to `~/.agents/skills/noodle-use`, marks that directory as Noodle-managed, and links detected Claude, Cursor, Codex, and OpenCode skill directories to it. Existing symlinks or marked managed directories may be replaced atomically. Unmanaged paths are rejected and reported together unless `--force` is supplied; forced replacements retain backups until every target succeeds and roll back completed targets on failure.

**Automation mode** (`src/app/commands/automation.ts` + `src/app/services.ts`): Provides resource commands for workspace discovery, collection creation/listing/inspection/audit/execution, minimal request creation/execution, environment variables, secure value set/list/delete, and cookie list/clear. `collection run` optionally selects request IDs and folder paths, validates them before sending, deduplicates overlap, and preserves collection order. Request and non-root folder tags compose into effective request tags; include and exclude filters finish before environment, proxy, TLS, cookie, or request setup. The same runner evaluates captures and assertions, records ordered fail-fast skips, and aggregates fixed failure categories. `RequestRunResult` carries the response or error plus optional `ResponseExecutionResults` capture/assertion groups and fixed-order `RunFailureCategory` values: `configuration`, `execution`, `transport`, `http`, `capture`, and `assertion`. Completed failures exit `1`, while pre-run configuration failures exit `2`; human output maps those categories to explicit failure labels. One-shot `--noproxy` and `--insecure` overrides use the same collection jar as the TUI. `commandResult.ts` centralizes the deterministic `{ status, data, errors }` JSON envelope and exit-code handling. Cover service behavior in `tests/integration/automation.test.ts` and command definitions in `tests/cli.test.ts`.

### Extending assertions and response expressions

Add an operator only when the contract requires it. Update the shared operator
type/list and load-time validation in `schema/index.ts` and `lang/parse.ts`, add
the evaluation branch in `assertions.ts`, then update parser/serializer,
authoring UI, user/dev skills, and focused round-trip and semantic tests. Do not
add CLI- or TUI-specific evaluation.

Add an expression through `response.ts` so captures and assertions receive the
same parsed expression and resolver behavior. Update expression completion in
the assertion/capture editors, document missing/type/error semantics, and cover
both consumers. Keep request execution and redaction in `executionResults.ts`,
`services.ts`, and `timelineEntry.ts` rather than inside a new expression.

**Config files** (read during startup):

- `~/.config/noodle/keybinds.yml` — user keybinding overrides
- `~/.config/noodle/config.yml` — theme, layout, undo confirmation, registered collections, and credential-free global proxy policy
- `~/.config/noodle/cookies/<collection_id>.json` stores the encrypted or explicitly warned plaintext cookie jar
- `<collection>/settings.yml`: collection ID/metadata, timeline retention, active environment, cookie toggle, credential-free proxy policy, and TLS metadata
- `<collection>/.noodle/ui-state.yml` — last selected item, expanded folders, and per-request tab state

## State management

| Hook                   | File                                | Holds                                                                                       |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `useCollection`        | `src/hooks/useCollection.ts`        | `{collection, loading, error}` — loaded from disk                                           |
| `useTreeNavigation`    | `src/hooks/useTreeNavigation.ts`    | `{selectedId, expanded, cursorIndex, visibleItems}`                                         |
| `useRequestDraft`      | `src/hooks/useRequestDraft.ts`      | `Map<id, Request>` (drafts), `Map<id, Request>` (originals), `isDirty`                      |
| `useFolderDraft`       | `src/hooks/useFolderDraft.ts`       | Folder draft state — name, seq, headers, auth overrides, dirty tracking                     |
| `useEditBrowse`        | `src/hooks/useEditBrowse.ts`        | `EditState` — `{mode, cursor: {field, row, subfield, addingRow}}`                           |
| `useFolderEditBrowse`  | `src/hooks/useFolderEditBrowse.ts`  | Edit/browse for folder fields (meta/headers/auth/activity)                                  |
| `useResponse`          | `src/hooks/useResponse.ts`          | `SendState` — `{status, response, error}`                                                   |
| `useCollectionCookieJar` | `src/hooks/useCollectionCookieJar.ts` | Jar handle, storage status, flush, retry, and reset                                        |
| `useCookieJarView`     | `src/hooks/useCookieJarView.ts`      | Domain grouping, cookie selection, expansion, filtering, and mutations                     |
| `useEnvironments`      | `src/hooks/useEnvironments.ts`      | Active environment name/index/data, indicator status, selection, cycling, reload            |
| `useEnvironmentEditor` | `src/hooks/useEnvironmentEditor.ts` | Full env CRUD state plus validated name/color creation                                      |
| `useConfig`            | `src/hooks/useConfig.ts`            | `{theme, layout, confirm_undo_all, collections}` persisted to `~/.config/noodle/config.yml` |
| `useTimeline`          | `src/ui/timeline/useTimeline.ts`    | `TimelineEntry[]` per-request response history                                              |
| `useUIState`           | `src/ui/tabs/useUIState.ts`         | Per-request tab index state                                                                 |

## Keymap layer architecture

`src/ui/keymap/` defines layered keybindings with `useBindings()` from `@opentui/keymap/react`:

| Layer         | Condition                                                          | What it handles                                                                                                                                   |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global        | No editing constraint                                              | Focus cycle, layout, help, YAML editor, expand, copy body, theme, command palette, collection/environment editor, undo all, jump mode            |
| URL Bar Focus | `focus=urlbar`, `overlay=none`, `view!=env-editor`                 | Tab between method select and URL text input                                                                                                      |
| Base          | `mode=base`, `overlay=none`, `view!=env-editor`, `focus!=folder`   | Send, save, env cycle/picker, new/clone/delete, edit overlay, folder new                                                                          |
| Request Focus | `focus=request`, `mode=base`, `overlay=none`, `view!=env-editor`   | Enter edit, tab prev/next                                                                                                                         |
| Browse        | `mode=browse`, `focus!=folder`, `overlay=none`, `view!=env-editor` | Arrow navigation, enter/escape, space toggle, delete, revert all, send, save, toggle form type                                                    |
| Edit          | `mode=edit`, `focus!=folder`, `overlay=none`, `view!=env-editor`   | Commit (Return), Cancel (Escape), Tab next field                                                                                                  |
| Folder Init   | `mode=base`, `focus=folder`, `overlay=none`, `view!=env-editor`    | Enter edit, tab prev/next, new/clone request, new folder                                                                                          |
| Folder Focus  | `focus=folder`, `overlay=none`, `view!=env-editor`                 | Folder save, folder delete                                                                                                                        |
| Folder Browse | `focus=folder`, `mode=browse`, `overlay=none`, `view!=env-editor`  | Arrow nav, enter/escape, toggle, revert field/all                                                                                                 |
| Folder Edit   | `focus=folder`, `mode=edit`, `overlay=none`, `view!=env-editor`    | Commit, cancel, tab                                                                                                                               |
| Env Editor    | `view=env-editor`, `overlay=none`                                  | Save/new/clone/delete environment                                                                                                                 |
| Env Browse    | `view=env-editor`, `focus=env-vars`, `mode=browse`, `overlay=none` | Arrow nav, enter/escape, toggle, revert                                                                                                           |
| Env Edit      | `view=env-editor`, `focus=env-vars`, `mode=edit`, `overlay=none`   | Commit, cancel, tab, save                                                                                                                         |
| Cookie Jar    | `view=cookie-jar`, `overlay=none`                                  | Close, domain/cookie navigation, filter, expand, add/edit/copy/delete, clear, retry                                                           |

State data syncs via `keymap.setData("app.focus", ...)`, `keymap.setData("app.mode", ...)`, `keymap.setData("app.overlay", ...)`, `keymap.setData("app.view", ...)`.

## Key files by concern

| Concern                     | Files                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types                       | `src/schema/index.ts`                                                                                                                                                                                                                                                                                                        |
| YAML parse/serialize        | `src/lang/parse.ts`, `src/lang/serialize.ts`, `src/lang/folder.ts`, `src/lang/auth.ts`                                                                                                                                                                                                                                      |
| Authentication              | `src/auth/defaults.ts`, `src/requests/auth.ts`, `src/requests/oauth1.ts`, `src/requests/oauth2.ts`, `src/requests/oauth2Browser.ts`, `src/ui/authRows.ts`, `src/ui/AuthEditor.tsx`                                                                                                                                           |
| Tree-sitter parsers         | `src/lang/parsers/json/`, `src/lang/parsers/yaml/`, `src/ui/editor/codeEditorParsers.ts`                                                                                                                                                                                                                                     |
| File I/O                    | `src/filestore/load.ts`, `src/filestore/save.ts`, `src/filestore/timeline.ts`                                                                                                                                                                                                                                                |
| Environments                | `src/env/load.ts`, `src/env/save.ts`                                                                                                                                                                                                                                                                                         |
| Secrets and redaction       | `src/secrets/index.ts`, `src/secrets/redact.ts`                                                                                                                                                                                                                                                                              |
| Declarative response engine | `src/response.ts`, `src/assertions.ts`, `src/runScope.ts`, `src/executionResults.ts`                                                                                                                                                                                                                                          |
| Cookie storage and UI       | `src/cookies/index.ts`, `src/hooks/useCollectionCookieJar.ts`, `src/hooks/useCookieJarView.ts`, `src/ui/cookie-jar/`, `src/ui/overlays/CookieFormOverlay.tsx`                                                                                                                  |
| HTTP execution              | `src/requests/send.ts`, `src/requests/substitute.ts`, `src/requests/mergeFolderOverrides.ts`, `src/requests/oauth1.ts`, `src/requests/oauth2.ts`, `src/requests/oauth2Browser.ts`                                                                                                                                              |
| TLS and proxy policy        | `src/tls.ts`, `src/proxy.ts`                                                                                                                                                                                                                                                                                                 |
| Hooks                       | `src/hooks/*.ts`                                                                                                                                                                                                                                                                                                             |
| Code editor                 | `src/ui/editor/CodeEditor.ts`, `CodeEditorCompletion.tsx`, `codeEditorParsers.ts`, `codeEditorFoldManager.ts`, `codeEditorFolds.ts`, `codeEditorHighlightRenderer.ts`, `codeEditorHighlighting.ts`, `codeEditorKeys.ts`, `codeEditorStyles.ts`, `codeEditorValidation.ts`, `YamlEditorOverlay.tsx`, `ValidationNotice.tsx` |
| Variable completion         | `src/ui/variable-completion/variableCompletion.ts`, `src/ui/variable-completion/useVariableCompletion.ts`, `src/ui/variable-completion/variableCompletionInterceptor.tsx`, `src/ui/variable-completion/variableHighlight.ts`, `src/ui/variable-completion/highlightOffsets.ts`, `src/ui/variable-completion/envHighlight.ts` |
| Command palette             | `src/ui/commands.ts`, `src/ui/commandActions.ts`, `src/ui/overlays/CommandPaletteOverlay.tsx`                                                                                                                                                                                                                                |
| Request finder              | `src/ui/requestFinder.ts`, `src/ui/overlays/RequestFinderOverlay.tsx`                                                                                                                                                                                                                                                        |
| cURL import (TUI)           | `src/converters/curl/parse.ts`, `src/ui/overlays/ImportCurlOverlay.tsx`, `src/ui/useOverlayIntercepts.ts`                                                                                                                                                                                                                    |
| Collection import/export (TUI) | `src/ui/collectionImport.ts`, `src/ui/collectionExport.ts`, `src/ui/overlays/ImportCollectionOverlay.tsx`, `src/ui/overlays/ExportCollectionOverlay.tsx` |
| Code generation             | `src/codegen/buildHar.ts`, `src/codegen/targets.ts`, `src/codegen/variableHash.ts`, `src/ui/overlays/CodeGeneratorOverlay.tsx`                                                                                                                                                                                               |
| JSONPath response filtering | `src/ui/responseQuery.ts`, `src/ui/ResponsePane.tsx`                                                                                                                                                                                                                                                                         |
| Jump mode                   | `src/ui/useJumpMode.ts`, `src/ui/JumpBadge.tsx`                                                                                                                                                                                                                                                                              |
| Themes                      | `src/ui/theme.tsx`, `src/ui/theme-data.ts`                                                                                                                                                                                                                                                                                   |
| Clipboard                   | `src/ui/clipboard.ts`                                                                                                                                                                                                                                                                                                        |
| CLI                         | `src/app/cli.ts` (entry), `src/app/main.tsx` (bootstrap), `src/app/commands/default.ts` (TUI cmd), `src/app/commands/import.ts` and `export.ts` (conversion commands), `src/app/commands/update.ts` (update cmd), `src/app/commands/agent.ts` and `src/agentSkill.ts` (agent skill install), `src/app/import.ts` and `export.ts` (conversion logic) |
| Importers and exporters     | `src/converters/index.ts`, `src/converters/openapi/`, `src/converters/postman/`, `src/converters/swagger/`, `src/converters/insomnia/`                                                                                                                                                                                          |
| UI entry                    | `src/ui/App.tsx`, `src/ui/AppInner.tsx`, `src/ui/AppOverlays.tsx`, `src/ui/MainView.tsx`                                                                                                                                                                                                                                     |
| Focus                       | `src/ui/focus.ts`                                                                                                                                                                                                                                                                                                            |
| Keybindings                 | `src/ui/keybind.ts`, `src/ui/keymap/`, `src/ui/useOverlayIntercepts.ts`                                                                                                                                                                                                                                                      |
| Borders                     | `src/ui/borders.ts`                                                                                                                                                                                                                                                                                                          |
| Pure helpers                | `src/ui/*.ts` (non-JSX files: `format.ts`, `formatRequest.ts`, `urlParams.ts`, `tree.ts`, `selection.ts`)                                                                                                                                                                                                                    |
