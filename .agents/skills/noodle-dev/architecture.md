# Architecture

## Collection directory layout

Example collection on disk:

```
my-collection/
├── settings.yml              ← { environment: "dev" }
├── folder.yml                ← (root level, optional) root folder meta, headers, auth
├── list-users.yml            ← Request file: id = "list-users"
├── get-user.yml              ← Request file: id = "get-user"
├── auth/
│   ├── folder.yml            ← { meta: { name: "Auth", seq: 1 }, headers: {...} }
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
headers:                 # Merged additively: folder header only if request doesn't have same key
  X-API-Key: $API_KEY
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

## Code editor architecture

`CodeEditorRenderable` (`src/ui/editor/CodeEditor.ts`) extends OpenTUI's `TextareaRenderable` with:

### Tree-sitter highlighting
- Parsers registered via `src/ui/editor/codeEditorParsers.ts`: JSON (`tree-sitter-json.wasm` + `highlights.scm`), YAML (`tree-sitter-yaml.wasm` + `highlights.scm`)
- Async highlight with 200ms debounce
- Fallback local tokenizers when tree-sitter fails (JSON: `src/ui/editor/syntax.ts`, YAML: `src/ui/editor/yamlSyntax.ts`)
- Theme-synced syntax styles (`json.key`, `json.string`, `yaml.key`, etc.)
- Variable highlighting: `env.resolved` (primary color) / `env.missing` (error color) via `extraHighlights` callback
- Byte-to-display offset mapping via `src/ui/variable-completion/highlightOffsets.ts` for emoji/wide characters

### Code folding
- `toggleFold(line)` — fold/unfold by Ctrl+G at cursor line
- `foldAll()` / `unfoldAll()` — F5/F6 global fold/unfold
- Fold sign indicators (▶/▼) in line gutter, hidden line numbers for folded content
- Auto-unfold on edit in folded region
- Preserves cursor position during fold/unfold operations
- Fold state persisted across content changes

### Validation
- `validateContent` callback — inline JSON/YAML validation
- Error notice displayed via `src/ui/editor/ValidationNotice.tsx` component

### Component registration
- Custom `<code-editor>` JSX element declared in `src/ui/jsx-types.d.ts`
- Registered at startup via component registration in `src/ui/editor/CodeEditor.ts`

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
- `buildCommandPaletteCommands(view, ...)` — assembles command arrays by view context:
  - Main view: Request commands, Response commands, Environment commands, Workspace commands, System commands
  - Env editor: Environment commands (different set), Workspace, System
- Each `CommandItem`: `{ id, label, shortcut, run: () => boolean, type: "command" }`
- Section headers: `{ label, type: "header" }` — skipped by navigation via `isNavigable`

### Executing commands (src/ui/commandActions.ts)
- All command logic centralized in exported functions:
  `sendRequest`, `saveRequest`, `editRequestOverlay`, `editRequestYaml`,
  `newRequest`, `cloneRequest`, `deleteRequest`, `deleteFolder`,
  `copyResponseBody`, `cycleEnvironment`, `openEnvironmentEditor`,
  `saveEnvironment`, `newEnvironment`, `cloneEnvironment`, `deleteEnvironment`,
  `newFolder`, `toggleLayout`, `togglePaneExpand`, `undoAll`,
  `toggleHelp`, `openThemePicker`, `openCollectionSwitcher`
- Both `useAppKeymap.ts` and `commands.ts` import from here — never duplicate logic
- `run()` returns `true` (close palette) or `false` (stay open)

### Picker (src/ui/overlays/PickerOverlay.tsx)
- Generic `<PickerOverlay<T>>` renders search input + filtered list
- `isNavigable` prop skips non-selectable items (section headers) during up/down/return
- Used by: `CommandPaletteOverlay`, `CollectionSwitcherOverlay`, `ThemePickerOverlay`
- Keyboard: up/down navigate, return select, escape close

## Theme architecture

### Theme data (src/ui/theme-data.ts)
- 32 themes defined in `THEMES[]` array
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
lang/            ← YAML ↔ typed objects: parseRequest, serializeRequest, parseFolder
  │   (also: tree-sitter WASM parsers for JSON/YAML in lang/parsers/)
  ↓
filestore/       ← Disk I/O: loadCollection, saveRequest, deleteRequest, timeline, settings
  ↓
env/             ← Dotenv files: loadEnvironment, listEnvironments, save, clone
  ↓
requests/        ← HTTP layer: send, substitute, mergeFolderOverrides, authHeader
  ↓
hooks/           ← React state: useCollection, useRequestDraft, useResponse, useEditBrowse, useEnvironments,
  │                 useConfig, useTimeline, useEnvironmentEditor, useFolderDraft, etc.
  ↓
ui/              ← OpenTUI components + pure helpers + keymap layers
  │   ├── editor/CodeEditor.ts — tree-sitter highlighting, folding, validation
  │   ├── variable-completion/variableCompletion.ts — $var autocompletion engine
  │   ├── commands.ts / commandActions.ts — command palette infrastructure
  │   ├── theme.tsx / theme-data.ts — 32 themes with live preview
  │   ├── clipboard.ts — multi-platform clipboard + OSC 52 fallback
  │   ├── editor/codeEditorParsers.ts — tree-sitter parser registration
  │   └── editor/yamlSyntax.ts — YAML syntax styling
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
      │           └── ResponsePane     ← Tabs: body/headers/timeline
      ├── EnvironmentEditorView  ← 3-pane env editor (sidebar + header + vars)
      │   ├── EnvSidebar
      │   ├── EnvHeaderPane
      │   └── EnvEditorPane
      ├── [overlays] (rendered in AppOverlays.tsx)
      │   ├── PickerOverlay (generic base) → used by CommandPalette, CollectionSwitcher, ThemePicker
      │   ├── HelpOverlay, YamlEditorOverlay (CodeEditor for YAML)
      │   ├── NewRequestOverlay, CloneRequestOverlay, NewFolderOverlay
      │   ├── CommandPaletteOverlay, CollectionSwitcherOverlay
      │   ├── ConfirmOverlay (save, delete, undo-all, collection-switch)
      │   └── ValidationNotice
      └── StatusBar
```

**Focus model** (src/ui/focus.ts):
- Main cycle: `sidebar → urlbar → request → response` (4 panes, wraps)
- Folder cycle: `sidebar → folder` (2 panes, when selected item is a folder)
- Env editor cycle: `env-sidebar → env-header → env-vars` (3 panes)
- Active pane gets **cyan border** (`theme.primary`) via `borders.ts` FullBorder/LeftBar presets
- `toggleExpand()` switches between null, `"request"`, `"response"` — F2 expands/collapses focused pane
- `hintForFocus()` returns mode-specific status bar hints per focus + mode

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
  ├── "import" → commands/import.ts
        ├── source (positional, required)
        ├── --format/-i (auto-detect if omitted)
        ├── --output/-o (default: ./collections)
        └── run() → lazy-load importers, runImport(options)
  │
  └── "workspace" | "collection" | "request" | "environment"
        └── commands/automation.ts → services.ts → filestore/env/executor
              ├── non-interactive resource operations
              ├── optional --json result envelope via commandResult.ts
              └── collection/request run resolves --env, then settings.yml
```

**Bootstrap** (`src/app/main.tsx`): Extracted `bootstrap()` function that:
- Lists environments, validates `--env` flag
- Loads settings, last request, keybind overrides
- Creates renderer, keymap, Ctrl+C handler
- Mounts root React component

**Import mode** (`src/app/import.ts`): Called via `import` subcommand. Lazy-loads importers on first call (reduces startup cost). Detects format, converts, writes output.

**Automation mode** (`src/app/commands/automation.ts` + `src/app/services.ts`): Provides resource commands for workspace discovery, collection creation/listing/inspection/audit/execution, minimal request creation/execution, and setting existing environment variables. `commandResult.ts` centralizes JSON envelopes and exit-code handling. Cover service behavior in `tests/automation.test.ts` and command definitions in `tests/cli.test.ts`.

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
| `useFolderDraft` | `src/hooks/useFolderDraft.ts` | Folder draft state — name, seq, headers, auth overrides, dirty tracking |
| `useEditBrowse` | `src/hooks/useEditBrowse.ts` | `EditState` — `{mode, cursor: {field, row, subfield, addingRow}}` |
| `useFolderEditBrowse` | `src/hooks/useFolderEditBrowse.ts` | Edit/browse for folder fields (meta/headers/auth/activity) |
| `useResponse` | `src/hooks/useResponse.ts` | `SendState` — `{status, response, error}` |
| `useEnvironments` | `src/hooks/useEnvironments.ts` | `{activeIndex, activeEnv, names}` |
| `useEnvironmentEditor` | `src/hooks/useEnvironmentEditor.ts` | Full env CRUD state for editor pane |
| `useConfig` | `src/hooks/useConfig.ts` | `{theme, layout, confirm_undo_all, collections}` persisted to `~/.config/noodle/config.yml` |
| `useTimeline` | `src/ui/timeline/useTimeline.ts` | `TimelineEntry[]` per-request response history |
| `useUIState` | `src/ui/tabs/useUIState.ts` | Per-request tab index state |

## Keymap layer architecture

`src/ui/useAppKeymap.ts` defines layered keybindings with `useBindings()`:

| Layer | Condition | What it handles |
|-------|-----------|-----------------|
| Always-On | No editing constraint | Focus cycle, layout toggle, help, yaml editor, expand/collapse, copy body, theme, command palette, collection switcher, undo all |
| Base | `mode=base`, `overlay=none`, `view!=env-editor`, `focus!=folder` | Send, save, env cycle, new/clone/delete, edit overlay, folder new, env editor open |
| Request Focus | `focus=request`, `mode=base`, `overlay=none`, `view!=env-editor` | Enter edit, tab prev/next |
| Browse | `mode=browse`, `focus!=folder`, `overlay=none`, `view!=env-editor` | Arrow navigation, enter/escape, space toggle, delete, revert all, send, save, toggle form type |
| Edit | `mode=edit`, `focus!=folder`, `overlay=none`, `view!=env-editor` | Commit (Return), Cancel (Escape), Tab next field |
| Folder Init | `mode=base`, `focus=folder`, `overlay=none`, `view!=env-editor` | Enter edit, tab prev/next, new/clone request, new folder |
| Folder Focus | `focus=folder`, `overlay=none`, `view!=env-editor` | Folder save, folder delete |
| Folder Browse | `focus=folder`, `mode=browse`, `overlay=none`, `view!=env-editor` | Arrow nav, enter/escape, toggle, revert field/all |
| Folder Edit | `focus=folder`, `mode=edit`, `overlay=none`, `view!=env-editor` | Commit, cancel, tab |
| Env Editor | `view=env-editor`, `overlay=none` | Save/new/clone/delete environment |
| Env Browse | `view=env-editor`, `focus=env-vars`, `mode=browse`, `overlay=none` | Arrow nav, enter/escape, toggle, revert |
| Env Edit | `view=env-editor`, `focus=env-vars`, `mode=edit`, `overlay=none` | Commit, cancel, tab, save |

State data syncs via `keymap.setData("app.focus", ...)`, `keymap.setData("app.mode", ...)`, `keymap.setData("app.overlay", ...)`, `keymap.setData("app.view", ...)`.

## Key files by concern

| Concern | Files |
|---------|-------|
| Types | `src/schema/index.ts` |
| YAML parse/serialize | `src/lang/parse.ts`, `src/lang/serialize.ts`, `src/lang/folder.ts` |
| Tree-sitter parsers | `src/lang/parsers/json/`, `src/lang/parsers/yaml/`, `src/ui/editor/codeEditorParsers.ts` |
| File I/O | `src/filestore/load.ts`, `src/filestore/save.ts`, `src/filestore/timeline.ts` |
| Environments | `src/env/load.ts`, `src/env/save.ts` |
| HTTP execution | `src/requests/send.ts`, `src/requests/substitute.ts`, `src/requests/mergeFolderOverrides.ts` |
| Hooks | `src/hooks/*.ts` |
| Code editor | `src/ui/editor/CodeEditor.ts`, `src/ui/editor/CodeEditorCompletion.tsx`, `src/ui/editor/codeEditorParsers.ts`, `src/ui/editor/YamlEditorOverlay.tsx`, `src/ui/editor/ValidationNotice.tsx` |
| Variable completion | `src/ui/variable-completion/variableCompletion.ts`, `src/ui/variable-completion/useVariableCompletion.ts`, `src/ui/variable-completion/variableCompletionInterceptor.tsx`, `src/ui/variable-completion/variableHighlight.ts`, `src/ui/variable-completion/highlightOffsets.ts`, `src/ui/variable-completion/envHighlight.ts` |
| Command palette | `src/ui/commands.ts`, `src/ui/commandActions.ts`, `src/ui/CommandPaletteOverlay.tsx` |
| Themes | `src/ui/theme.tsx`, `src/ui/theme-data.ts` |
| Clipboard | `src/ui/clipboard.ts` |
| CLI | `src/app/cli.ts` (entry), `src/app/main.tsx` (bootstrap), `src/app/commands/default.ts` (TUI cmd), `src/app/commands/import.ts` (import cmd), `src/app/commands/update.ts` (update cmd), `src/app/import.ts` (importer logic) |
| Importers | `src/converters/index.ts`, `src/converters/openapi/`, `src/converters/postman/` |
| UI entry | `src/ui/App.tsx`, `src/ui/AppInner.tsx`, `src/ui/AppOverlays.tsx`, `src/ui/MainView.tsx` |
| Focus | `src/ui/focus.ts` |
| Keybindings | `src/ui/keybind.ts`, `src/ui/useAppKeymap.ts`, `src/ui/useOverlayIntercepts.ts` |
| Borders | `src/ui/borders.ts` |
| Pure helpers | `src/ui/*.ts` (non-JSX files: `format.ts`, `formatRequest.ts`, `urlParams.ts`, `tree.ts`, `selection.ts`) |
