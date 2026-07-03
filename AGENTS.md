# AGENTS.md — noodle

Terminal REST client. Inspect, send, and iterate on HTTP requests from YAML files on disk. Built with OpenTUI (React binding) on Bun.

## Quick commands

```bash
bun install
bun run dev -- --collection ./collections --env development
bun test                              # all tests (~1180 across 73 suites)
bun test tests/lang.test.ts           # single file
bun run lint                          # eslint
bun run typecheck                     # tsc --noEmit
bunx prettier --check ./src ./tests   # format check (prettier 3, --check only src+tests)
```

## CLI flags

```
--collection <dir>    collection directory (default: ./collections)
--env <name>          initial environment (loads .environments/<name>.env)
--source <file>       import OpenAPI 3.0 spec (JSON or YAML)
--import <format>     import format (with --source; currently only "openapi")
--output <dir>        output dir for imported requests (default: collection dir)
-h, --help
```

## Stack

- **Runtime:** Bun (not Node). `bun run`, `bun test`.
- **UI:** [OpenTUI](https://github.com/anomius/opentui) React binding (`@opentui/react`, `@opentui/core`). `jsxImportSource: "@opentui/react"` — this is NOT standard React DOM. JSX renders to a terminal TUI. Use `useKeyboard`, `createCliRenderer`, `createRoot` from OpenTUI.
- **Language:** TypeScript 6, strict mode, `"type": "module"`.
- **Lint:** ESLint 10 with `@eslint/js` + `typescript-eslint` recommended rules. `no-unused-vars` ignores `_`-prefixed args.
- **Format:** Prettier 3 — `semi: false`, `singleQuote: false`. No trailing commas.
- **Tests:** `bun:test` (not vitest/jest). `describe`, `it`, `expect`.
- **Package manager:** Bun. `bun.lock` (not `yarn.lock`/`package-lock.json`).

## Architecture

```
src/
├── schema/        # Types: Method, Auth, Request, Collection, Response, Environment
├── lang/          # YAML request language: parse + serialize
├── filestore/     # loadCollection(dir) / saveRequest(dir, req) — disk I/O
├── env/           # loadEnvironment, listEnvironments — env file I/O + validation
├── requests/      # executor.send + substitute ({{var}} replacement)
├── hooks/         # React hooks: useCollection, useRequestDraft, useEnvironments, etc.
├── converters/
│   └── openapi/   # OpenAPI 3.0 → Collection importer (CLI only)
├── app/           # CLI args parsing, entry point (src/app/index.tsx)
└── ui/            # React components + hooks + pure helpers
    ├── App.tsx    # Root component: focus, keyboard, state wiring
    ├── AppInner.tsx
    ├── Sidebar.tsx
    ├── RequestPane.tsx    # Full request detail + inline editing
    ├── ResponsePane.tsx   # Response rendering (idle/sending/done/error)
    ├── HelpOverlay.tsx    # F1 keybinding cheatsheet overlay
    └── ...                # Hooks + pure helpers
collections/       # Sample request .yml files + .environments/
tests/             # bun:test suites
tests/unit/        # Unit tests for pure helpers
tests/integration/ # Integration tests
```

## Entry point

`src/app/index.tsx` — parses CLI args, loads collection + environments, reads user keybind overrides from `~/.config/noodle/keybinds.yml`, mounts the root React component with `createCliRenderer` + `createRoot`.

## Key conventions

- **Prettier check excludes** `.agents/` — only `./src ./tests` must be clean.
- **Do NOT commit** `docs/`, `CONTINUE.md`, `.superpowers/`, `.timeline/` (all gitignored).
- **Commit style:** `feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `style:`, `docs:`.
- **Requests are `.yml` files**, one per request. Extension is `.yml` not `.yaml`.
- **Environments are `.env` files** under `<collection>/.environments/`. Format is `KEY=value` (dotenv-style, not YAML). Lines starting with `#` disable a var. `_color=<name>` sets sidebar badge color.
- **`{{var}}` template syntax** for variable substitution in url/headers/params/body/auth.
- **Error re-throws** must pass `{ cause: e }` as second arg to `new Error(...)`. This is a convention (not an ESLint rule) but is followed project-wide.
- **UI features require loading the `opentui` skill**. The skill lives at `.agents/skills/opentui/SKILL.md`.

## Keybindings (defaults; customizable via `~/.config/noodle/keybinds.yml`)

All except `fixed` keys can be overridden in YAML:
```yaml
request_send: ctrl+enter
env_cycle: ctrl+shift+p
```

### Global (always active, gated on `!helpVisible`)
| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle focus (sidebar → request → response) |
| `Ctrl+Return` | Send request |
| `Ctrl+S` | Save request to disk |
| `Ctrl+N` | New request |
| `Ctrl+K` | Clone request |
| `Ctrl+W` | Delete request |
| `Ctrl+P` | Cycle environment |
| `Ctrl+L` | Toggle layout (stacked / side-by-side) |
| `F2` | Expand/collapse focused pane |
| `F1` | Toggle help overlay |
| `Ctrl+T` | Open theme picker |
| `Ctrl+E` | Edit request in overlay |
| `Ctrl+Alt+E` | Edit request YAML in overlay |
| `Ctrl+B` | Copy response body |
| `Ctrl+Alt+N` | New folder |
| `e` | Open environment editor |
| `Ctrl+C` | Quit (copies selection first if text is selected) |

### Browse mode (request pane focused, not editing)
| Key | Action |
|-----|--------|
| `↑/↓/←/→` | Navigate fields |
| `Return` | Enter edit mode |
| `Escape` | Exit browse mode |
| `Space` | Toggle header/param enabled/disabled |
| `Ctrl+T` | Toggle form entry text/file (browse context) |
| `Ctrl+D` | Revert current field |
| `Ctrl+R` | Revert all fields |

### Edit mode (editing a field value)
| Key | Action |
|-----|--------|
| `Return` | Commit edit |
| `Escape` | Cancel edit |
| `Tab` | Move to next field |

### Env editor mode
| Key | Action |
|-----|--------|
| `Ctrl+S` | Save environment |
| `Ctrl+N` | Create new environment |
| `Ctrl+K` | Clone selected environment |
| `Ctrl+W` | Delete selected environment |

## Focus model

3 panes (sidebar, request, response) cycle with Tab/Shift+Tab. Active pane gets cyan border + `▸` prefix. Global keys work regardless of focus. Context-dependent bindings (`Ctrl+S`, `Ctrl+N`, `Ctrl+K`, `Ctrl+W`, `Ctrl+T`) dispatch to the appropriate action based on which pane is focused.

## Testing

- `bun test` runs all tests. No external services needed.
- Pure helpers in `tests/unit/`, integration tests in `tests/integration/`.
- Tests use real filesystem I/O for filestore, lang, and env modules (write to temp dirs with `mkdtemp`).
