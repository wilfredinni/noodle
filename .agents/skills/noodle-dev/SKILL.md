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
- **Focus model:** `"sidebar" → "urlbar" → "request" → "response"` (main). URL bar has method and URL sub-focuses. `"env-sidebar" → "env-header" → "env-vars"` (env editor). Skips hidden panes.
- **Keymap layers:** `useAppKeymap.ts` defines layered bindings gated on `focus`, `mode`, `overlay`, `view` state. `useBindings()` from `@opentui/keymap`.
- **Edit/Browse FSM:** Three modes — `inactive → browsing → editing`. `useEditBrowse` hook manages cursor, commit, cancel.
- **File I/O:** Save/delete operations validate path IDs to prevent traversal. Environment saves are atomic via `.tmp` + `rename()`; request, folder, and settings writes are direct writes.
- **Collection modes:** TUI opens collection roots in editable collection mode, request-containing uninitialized directories in read-only browse mode, and empty directories in read-only empty mode. Initialize through the command palette before editing or sending.
- **Timeline storage and security:** Timeline entries persist substituted request data on disk. Bodies larger than 10 KB are moved to gzip sidecars under `.timeline/<request-id>.yml.bodies/`; YAML entries retain a `bodyRef`. Detail views mask configured bearer, basic, and header API-key auth, but neither entries nor sidecars are secret-redacted storage.
- **Imports:** Module singletons (`filestore`, `lang`, `env`, `executor`). Types from `schema/index.ts`.
- **Command actions:** Shared command logic lives in `commandActions.ts`. Both `useAppKeymap.ts` and `commands.ts` import from it. If you add a new action, add it to `commandActions.ts` and call from both places. Do not duplicate logic.
- **CommandItem.run returns boolean:** Palette commands return `true` (close palette) or `false` (stay open). Unavailable commands (save when not dirty, copy body when no response) return `false`.
- **Commands are contextual by view:** Build them in view-specific arrays (`requestCommands`, `mainEnvCommands`, `editorEnvCommands`, `workspaceCommands`, `systemCommands`, etc.) in `buildCommandPaletteCommands`. The function appends the right arrays based on `view === "main"` vs `view === "env-editor"`. Don't add guards inside `run()` — use the array structure.
- **PickerOverlay isNavigable:** If items include non-selectable entries (like section headers), pass `isNavigable={(item) => item.type === "command"}`. PickerOverlay skips non-navigable items during up/down/return.
- **Modal keyboard isolation:** `useModalKeyboardShield` installs a hard-blocking interceptor only for explicitly non-editable overlays. Editable and unknown overlays leave events available to the focused input; unknown names warn and remain input-safe. Modal-owned controls that must receive keys first (for example, an open `Select` menu) use a priority above the shield.
- **getView reads React state, not keymap:** In `AppInner.tsx`, `getView: () => keymap.getData("app.view")` is stale during render. Use `getView: () => view` where `view` is the React state variable.

## Common pitfalls

- Forgetting `{ cause: e }` on re-throws — breaks error chains
- Using `{{var}}` instead of `$var` — noodle uses `$` prefix, not mustache
- Skipping `validatePathId()` in new file operations — security risk
- Adding keybindings without `fixed: true` for navigation keys (Tab, Enter, Escape, arrows) — users could break navigation
- Not registering new keymap layer in `useAppKeymap.ts` — binding won't fire
- Forgetting to update `focus.ts` `cycleFocus()` when adding new panes — tab cycling breaks
- Adding command logic inline instead of in `commandActions.ts` — will drift from keymap layer and vice versa
- Using `run: () => void` instead of `run: () => boolean` — palette won't close correctly
- Adding vanilla `run()` with early `return` instead of `return false` — palette closes on unavailable commands
- Handling modal keys only with `useKeyboard` — events can leak to obscured panes; consume them through a keymap interceptor instead
