# AGENTS.md — noodle

Terminal REST client. Inspect, send, and iterate on HTTP requests from YAML files on disk. Built with OpenTUI (React binding) on Bun.

## Quick commands

```bash
bun install
bun run dev -- --collection ./collections --env development
bun test                              # all tests (356 in 17 files)
bun test tests/lang.test.ts           # single file
bun run lint                          # eslint
bun run typecheck                     # tsc --noEmit
bunx prettier --check ./src ./tests   # format check (prettier 3, --check only src+tests)
```

## Stack

- **Runtime:** Bun (not Node). `bun run`, `bun test`.
- **UI:** [OpenTUI](https://github.com/anomius/opentui) React binding (`@opentui/react`, `@opentui/core`). `jsxImportSource: "@opentui/react"` — this is NOT standard React DOM. JSX renders to a terminal TUI. Use `useKeyboard`, `createCliRenderer`, `createRoot` from OpenTUI packages.
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
├── converters/
│   └── openapi/   # OpenAPI 3.0 → Collection importer (CLI only)
├── app/           # CLI args parsing, entry point (src/app/index.tsx)
└── ui/            # React components + hooks + pure helpers
    ├── App.tsx    # Root component: focus, keyboard, state wiring
    ├── Sidebar.tsx
    ├── RequestPane.tsx    # Full request detail + inline editing
    ├── ResponsePane.tsx   # Response rendering (idle/sending/done/error)
    ├── HelpOverlay.tsx    # ? keybinding cheatsheet overlay
    └── ...                # Hooks + pure helpers
collections/       # Sample .yml request files
environments/      # Sample .yml env files
tests/             # bun:test suites (17 files)
tests/unit/        # Unit tests for pure helpers
```

## Key conventions

- **Prettier check excludes** `.agents/` and reference skill files — only `./src ./tests` must be clean.
- **Do NOT commit** `docs/` (gitignored), `CONTINUE.md` (gitignored), `.agents/` (reference skills).
- **Commit style:** `feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `style:`, `docs:`.
- **Requests are `.yml` files**, one per request. Envs are `.yml` too. Extension is `.yml` not `.yaml` (`.yaml` deferred).
- **`{{var}}` template syntax** for variable substitution in url/headers/params/body/auth.
- **Error re-throws** must pass `{ cause: e }` as second arg to `new Error(...)` — `preserve-caught-error` enforcement.
- **UI features require loading the `opentui` skill**. The skill lives at `.agents/skills/opentui/SKILL.md`.
- **Keybindings:** `s` send, `w` save, `[`/`]` cycle env, `Tab`/`Shift+Tab` cycle focus, `?` help overlay, `Ctrl+C` quit, `e` edit-browse, `↑↓` navigate.
- **Focus:** 3 panes (sidebar, request, response) cycle with Tab. Active pane gets cyan border + `▸` prefix. Global keys work regardless of focus (gated on `!helpVisible`).

## Testing

- `bun test` runs all 356 tests in 17 files (~581 expect calls). No external services needed.
- Pure helpers are in `tests/unit/`. Integration-style tests in `tests/`.
- Tests use real filesystem I/O for filestore, lang, and env modules (write to temp dirs with `mkdtemp`).
