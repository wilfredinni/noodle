# Architecture

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

`src/app/index.tsx` — single entry point:
```
parseArgs(argv) → ParsedArgs
  │
  ├── [if --source] runImport() → exit
  │
  └── [normal mode]
      ├── listEnvironments(collectionDir/.environments)
      ├── Validate --env flag
      ├── loadSettings() → settingsEnv from settings.yml
      ├── loadLastRequest() from .noodle/last-request
      ├── Read ~/.config/noodle/keybinds.yml, parseOverrides()
      ├── createCliRenderer({ exitOnCtrlC: false })
      ├── createNoodleKeymap(renderer)
      ├── Ctrl+C handler: copy selection → quit
      └── createRoot(renderer).render(<App ...props />)
```

**Args parsing** (`src/app/args.ts`): Manual loop over `argv`. Each flag supports `--flag value` and `--flag=value`. Unknown flags throw `Error("args: unknown flag ...")`. No positional args allowed.

**Import mode** (`src/app/import.ts`): Runs when `--source` present. Registers importers (`openapi`, `postman`), detects format, calls `convert()`, writes output to collection dir. Exits without starting UI.

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
| CLI | `src/app/index.tsx` (entry), `src/app/args.ts` (flags), `src/app/import.ts` (import mode) |
| UI entry | `src/ui/App.tsx`, `src/ui/AppInner.tsx` |
| Focus | `src/ui/focus.ts` |
| Keybindings | `src/ui/keybind.ts`, `src/ui/useAppKeymap.ts` |
| Borders | `src/ui/borders.ts` |
| Pure helpers | `src/ui/*.ts` (non-JSX files) |
