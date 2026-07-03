---
name: noodle-dev
description: Use when developing features for the noodle terminal REST client — adding panes, keybindings, hooks, overlays, auth types, body types, I/O operations, environment features, importers, CLI flags, or any feature work in this codebase
---

# noodle-dev

Terminal REST client. OpenTUI (React binding) on Bun. YAML files on disk.

**REQUIRED BACKGROUND:** Read AGENTS.md for CLI commands, stack, and conventions.

## Quick routing

| Task | Read |
|------|------|
| Understand module boundaries, data flow, state, CLI, collection layout | [architecture.md](architecture.md) |
| Add a keybinding, pane, overlay, auth type, body type, hook, importer, CLI flag | [recipes.md](recipes.md) |
| Write tests for new feature | [testing.md](testing.md) |
| Add/modify persistent state (new files, config, timeline) | [architecture.md](architecture.md) → "Collection directory layout" |
| Build terminal UI components | **REQUIRED SUB-SKILL:** Use `opentui` skill |

## Key conventions

- **Error re-throws:** Always `new Error("module.function:", { cause: e })`. Prefix with `module.function:`.
- **Variable syntax:** `$VARNAME` (no braces). Regex `/\$(\w+)/g`. Applied in url/headers/params/body/formData/filePath/auth.
- **YAML files:** `.yml` extension (not `.yaml`). Requests stored one-per-file in collection dir.
- **Environments:** Dotenv-style `.env` files in `<collection>/.environments/`. `_color=<name>` sets sidebar badge.
- **Draft pattern:** `useRequestDraft` holds `Map<id, Request>` of dirty edits. `DraftOp` discriminated union for mutations. Compare with `isDirty` via deep equality.
- **Focus model:** `"sidebar" → "urlbar" → "request" → "response"` (main). `"env-sidebar" → "env-header" → "env-vars"` (env editor). Skips hidden panes.
- **Keymap layers:** `useAppKeymap.ts` defines layered bindings gated on `focus`, `mode`, `overlay`, `view` state. `useBindings()` from `@opentui/keymap`.
- **Edit/Browse FSM:** Three modes — `inactive → browsing → editing`. `useEditBrowse` hook manages cursor, commit, cancel.
- **File I/O:** All writes use `validatePathId()` preventing traversal. Atomic writes via `.tmp` + `rename()`.
- **Imports:** Module singletons (`filestore`, `lang`, `env`, `executor`). Types from `schema/index.ts`.

## Common pitfalls

- Forgetting `{ cause: e }` on re-throws — breaks error chains
- Using `{{var}}` instead of `$var` — noodle uses `$` prefix, not mustache
- Skipping `validatePathId()` in new file operations — security risk
- Adding keybindings without `fixed: true` for navigation keys (Tab, Enter, Escape, arrows) — users could break navigation
- Not registering new keymap layer in `useAppKeymap.ts` — binding won't fire
- Forgetting to update `focus.ts` `cycleFocus()` when adding new panes — tab cycling breaks
