# Architecture

## Collection directory layout

Example collection on disk:

```
my-collection/
├── settings.yml              ← { environment: "dev" }
├── folder.yml                ← (root level, optional) root folder meta + overrides
├── list-users.yml            ← Request file: id = "list-users"
├── get-user.yml              ← Request file: id = "get-user"
├── auth/
│   ├── folder.yml            ← { meta: { name: "Auth", seq: 1 }, overrides: { headers: [...] } }
│   ├── login.yml             ← Request: id = "auth/login"
│   └── refresh.yml           ← Request: id = "auth/refresh"
├── .environments/
│   ├── development.env       ← KEY=value (dotenv format)
│   └── production.env
├── .noodle/
│   ├── last-request          ← Plain text: last selected request ID
│   ├── expanded-folders      ← YAML list of expanded folder paths
│   └── ui-state/
│       └── auth/login.yml    ← Per-request state: { tabIndex: 2 }
├── .timeline/                ← Per-request response history (max 50 entries each)
│   ├── list-users.yml
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
- UI state persistence (`join(.noodle/ui-state, ${id}.yml)`)

### `folder.yml` format

```yaml
meta:
  name: My Folder        # Display name (defaults to directory name)
  seq: 1                 # Sort order (lower = first, undefined = last)
overrides:
  headers:               # Merged additively: folder header only if request doesn't have same key
    - name: X-API-Key
      value: $API_KEY
      enabled: true
  auth:
    type: bearer          # Used when request auth is "inherit"
    token: $TOKEN
```

Folder overrides are resolved in `requests/mergeFolderOverrides.ts` — walks ancestor folders bottom-up.

### Hidden state files (`.noodle/`)

| File | Format | Purpose |
|------|--------|---------|
| `last-request` | Plain text | Last selected request ID, restored on startup |
| `expanded-folders` | YAML list | Array of folder paths that are expanded in sidebar |
| `ui-state/<requestId>.yml` | YAML | Per-request UI state (tabIndex, scroll positions, etc.) |

### `settings.yml`

Collection-level settings at the root, loaded by `filestore/loadSettings()`:
```yaml
environment: development   # Last active environment name
```

Falls back to empty object `{}` when file is missing or invalid.

### Timeline (`.timeline/`)

Per-request response history stored as YAML arrays of `TimelineEntry` objects. Max 50 entries per request (FIFO — `unshift` + truncate). Files mirror the request ID structure: `.timeline/auth/login.yml` for request `auth/login`.

### File write conventions

- **`saveRequest()`**: `validatePathId()` → `mkdir` parent → write `.yml` file. Non-atomic (direct write).
- **`saveFolder()`**: `validatePathId()` → `mkdir` dir → write `folder.yml`. Non-atomic.
- **`saveEnvironment()`** (`env/save.ts`): Atomic — writes to `.tmp` then `rename()`.
- **`deleteFolder()`**: `rm(path, { recursive: true, force: true })` — wipes entire folder including .yml files and subdirs.
- **Migration** (in `walk()`): If `.yml` file lacks `timeout:` field, auto-serializes and writes the request back. Non-critical (caught errors are ignored).

### `validatePathId()` rules

All save/delete operations call `validatePathId()`. Rejects:
- Missing/empty ID
- `"."` or starts with `"./"`
- Absolute paths (starts with `"/"`)
- Contains `".."` or `"\"`

### Adding new persistent state

Follow existing patterns:
- **Collection-level config**: Add to `settings.yml` via `saveSettings()` + `loadSettings()`
- **Per-request state**: Add to `.noodle/ui-state/<id>.yml` following the per-request YAML pattern
- **New hidden directory**: Add name to `SKIP_DIRS` in `load.ts` so `walk()` skips it
- **Global user config**: Use `~/.config/noodle/config.yml` via `useConfig` hook

## Module dependency flow

```
schema/          ← Zero-dependency types: Request, Folder, Auth, Response, Environment
  ↓
lang/            ← YAML ↔ typed objects: parseRequest, serializeRequest, parseFolder
  ↓
filestore/       ← Disk I/O: loadCollection, saveRequest, deleteRequest, timeline, settings
  ↓
env/             ← Dotenv files: loadEnvironment, listEnvironments, save, clone
  ↓
requests/        ← HTTP layer: send, substitute, mergeFolderOverrides, authHeader
  ↓
hooks/           ← React state: useCollection, useRequestDraft, useResponse, useEditBrowse, useEnvironments
  ↓
ui/              ← OpenTUI components + pure helpers + keymap layers
  ↓
app/             ← CLI entry: parseArgs → createCliRenderer → createRoot → <App>
```

Each layer only depends on layers above it. UI components never touch `filestore` or `requests` directly — they go through hooks.

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
  → SAVE: lang/serialize.ts → filestore/save.ts (atomic .tmp + rename)
  → SEND: requests/send.ts pipeline:
     1. mergeFolderOverrides(req, collection, path)
     2. substitute(req, env) — $var replacement
     3. Build URL with params
     4. Set auth headers via authHeader()
     5. fetch() with AbortSignal.timeout
     6. Manual redirect handling
  → useResponse: SendState FSM → idle → sending → done | error
  → ResponsePane: renders body (JSON highlighting), headers, timeline
```

## Component tree

```
App (src/ui/App.tsx)
  ThemeProvider
    Toast
    AppInner (src/ui/AppInner.tsx)
      ├── Sidebar              ← Collection tree, cursor navigation
      ├── FolderPane           ← Tabs: meta/headers/auth/activity
      ├── [request view]
      │   ├── UrlBar
      │   ├── RequestPane      ← Tabs: headers/params/body/auth/settings
      │   │   └── KeyValueSection / JsonBodyViewer / AuthEditor / FormEditor / Select / Checkbox
      │   └── ResponsePane     ← Tabs: body/headers/timeline
      ├── [overlays]
      │   ├── HelpOverlay, ThemePickerOverlay, YamlEditorOverlay
      │   ├── NewRequestOverlay, CloneRequestOverlay, NewFolderOverlay
      │   └── ConfirmOverlay
      └── StatusBar
```

**Focus model** (src/ui/focus.ts):
- Main cycle: `sidebar → urlbar → request → response` (wraps)
- Folder cycle: `sidebar ↔ folder` (2 elements, skips urlbar/request/response)
- Env editor cycle: `env-sidebar → env-header → env-vars`
- Active pane gets **cyan border** (`theme.primary`) via `borders.ts` FullBorder/LeftBar presets

## CLI flow

`src/app/cli.ts` — citty main entry with subcommands:
```
createMain(main) — citty argparse
  │
  ├── "noodle" (default) → commands/default.ts
  │     ├── --collection/-c (default: ./collections)
  │     ├── --env/-e
  │     └── run() → bootstrap(options) in main.tsx
  │
  └── "import" → commands/import.ts
        ├── source (positional, required)
        ├── --format/-i (auto-detect if omitted)
        ├── --output/-o (default: ./collections)
        └── run() → lazy-load importers, runImport(options)
```

**Bootstrap** (`src/app/main.tsx`): Extracted `bootstrap()` function that:
- Lists environments, validates `--env` flag
- Loads settings, last request, keybind overrides
- Creates renderer, keymap, Ctrl+C handler
- Mounts root React component

**Import mode** (`src/app/import.ts`): Called via `import` subcommand. Lazy-loads importers on first call (reduces startup cost). Detects format, converts, writes output.

**Config files** (read during startup):
- `~/.config/noodle/keybinds.yml` — user keybinding overrides
- `~/.config/noodle/config.yml` — theme index + layout preference (read by `useConfig` hook)
- `<collection>/settings.yml` — last active environment name
- `<collection>/.noodle/last-request` — last selected request ID
- `<collection>/.noodle/expanded-folders` — which folders are expanded
- `<collection>/.noodle/ui-state/<reqId>` — per-request tab state

## State management

| Hook | File | Holds |
|------|------|-------|
| `useCollection` | `src/hooks/useCollection.ts` | `{collection, loading, error}` — loaded from disk |
| `useTreeNavigation` | `src/hooks/useTreeNavigation.ts` | `{selectedId, expanded, cursorIndex, visibleItems}` |
| `useRequestDraft` | `src/hooks/useRequestDraft.ts` | `Map<id, Request>` (drafts), `Map<id, Request>` (originals), `isDirty` |
| `useEditBrowse` | `src/hooks/useEditBrowse.ts` | `EditState` — `{mode, cursor: {field, row, subfield, addingRow}}` |
| `useResponse` | `src/hooks/useResponse.ts` | `SendState` — `{status, response, error}` |
| `useEnvironments` | `src/hooks/useEnvironments.ts` | `{activeIndex, activeEnv, names}` |
| `useEnvironmentEditor` | `src/hooks/useEnvironmentEditor.ts` | Full env CRUD state for editor pane |
| `useConfig` | `src/hooks/useConfig.ts` | `{theme, layout}` persisted to `~/.config/noodle/config.yml` |
| `useTimeline` | `src/hooks/useTimeline.ts` | `TimelineEntry[]` per-request response history |

## Keymap layer architecture

`src/ui/useAppKeymap.ts` defines layered keybindings with `useBindings()`:

| Layer | Condition | What it handles |
|-------|-----------|-----------------|
| Always-On | No editing constraint | focus cycle, layout toggle, help, yaml editor, expand/collapse |
| Base | `mode=base`, `overlay=none` | send, save, env cycle, theme, new/clone/delete, env editor open |
| Request Focus | `focus=request`, `mode=base` | Enter to edit, Tab for tab switching |
| Browse | `mode=browse` | Arrow navigation, Enter/Escape, Space toggle, delete, revert |
| Edit | `mode=edit` | Commit (Return), Cancel (Escape), Tab next field |
| Folder Browse/Edit | `focus=folder` + mode | Per-folder equivalents of browse/edit |
| Env Editor | `view=env-editor` | save/new/clone/delete environment |

State data syncs via `keymap.setData("app.focus", ...)`, `keymap.setData("app.mode", ...)`, `keymap.setData("app.overlay", ...)`, `keymap.setData("app.view", ...)`.

## Key files by concern

| Concern | Files |
|---------|-------|
| Types | `src/schema/index.ts` |
| YAML parse/serialize | `src/lang/parse.ts`, `src/lang/serialize.ts`, `src/lang/folder.ts` |
| File I/O | `src/filestore/load.ts`, `src/filestore/save.ts`, `src/filestore/timeline.ts` |
| Environments | `src/env/load.ts`, `src/env/save.ts` |
| HTTP execution | `src/requests/send.ts`, `src/requests/substitute.ts`, `src/requests/mergeFolderOverrides.ts` |
| Hooks | `src/hooks/*.ts` |
| CLI | `src/app/cli.ts` (entry), `src/app/main.tsx` (bootstrap), `src/app/commands/default.ts` (TUI cmd), `src/app/commands/import.ts` (import cmd), `src/app/import.ts` (importer logic) |
| UI entry | `src/ui/App.tsx`, `src/ui/AppInner.tsx` |
| Focus | `src/ui/focus.ts` |
| Keybindings | `src/ui/keybind.ts`, `src/ui/useAppKeymap.ts` |
| Borders | `src/ui/borders.ts` |
| Pure helpers | `src/ui/*.ts` (non-JSX files) |
