---
name: noodle-dev
description: Use when developing features for the noodle terminal REST client — adding panes, keybindings, hooks, overlays, auth types, body types, I/O operations, environment features, importers, CLI flags, or any feature work in this codebase
---

# noodle-dev

Terminal REST client. OpenTUI (React binding) on Bun. YAML files on disk.

**REQUIRED BACKGROUND:** Read AGENTS.md for CLI commands, stack, and conventions.

## Quick routing

| Task                                                                            | Read                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Understand module boundaries, data flow, state, CLI, collection layout          | [architecture.md](architecture.md)                                 |
| Add a keybinding, pane, overlay, auth type, body type, hook, importer, CLI flag | [recipes.md](recipes.md)                                           |
| Write tests for new feature                                                     | [testing.md](testing.md)                                           |
| Fix a bug or investigate a regression                                           | [testing.md](testing.md) → [Bug-fix workflow](#bug-fix-workflow)   |
| Add/modify persistent state (new files, config, timeline)                       | [architecture.md](architecture.md) → "Collection directory layout" |
| Build terminal UI components                                                    | **REQUIRED SUB-SKILL:** Use `opentui` skill                        |

## Bug-fix workflow

For bug reports, keep investigation, regression-test creation, implementation,
and review as separate stages. Never declare a bug fixed based only on code
inspection.

1. Reproduce the reported behavior before changing production code.
2. When practical, add the smallest focused failing regression test that proves
   the defect.
3. If the user requests investigation or approval first, stop after reporting
   the reproduction, likely root cause, and proposed minimal fix; do not
   implement until approved. Otherwise, continue with the authorized fix.
4. Make the smallest localized change that passes the regression test. Do not
   refactor unrelated code or change behavior outside the reported bug.
5. Never delete, skip, weaken, or broadly rewrite tests merely to make them
   pass.
6. Run the focused test first, then the full test suite after the patch.
7. Review the final diff for regressions and unintended behavior changes. Report
   the root cause, changed files, tests changed or added, commands run,
   user-visible behavior changes, and remaining risks.

If an automated regression test is not practical, explain why and provide a
reproducible manual acceptance procedure. If the issue cannot be reproduced,
do not make speculative production changes; report what was attempted instead.

Ask for explicit approval before a compatibility-sensitive change that has not
already been authorized: public CLI or API behavior, collection or YAML formats,
configuration, keybindings, persistence, or backwards compatibility.

## Key conventions

- **Error re-throws:** Pass `{ cause: e }` as the second argument to `new Error(...)`. Use the surrounding module's error-message style; a `module.function:` prefix is not universal.
- **Variable syntax:** `$VARNAME` (no braces). Regex `/\$(\w+)/g`. Applied in url/headers/params/body/formData/filePath/auth.
- **Authentication:** `src/auth/defaults.ts` owns reusable auth defaults, `src/lang/auth.ts` owns strict shared request and folder parsing/serialization, and `src/ui/authRows.ts` owns field metadata and mutation for both editors. OAuth 1.0a signing lives in `src/requests/oauth1.ts`; OAuth 2.0 token acquisition, refresh, vault storage, and loopback browser authorization live in `oauth2.ts` and `oauth2Browser.ts`. Keep generated OAuth state out of YAML, re-sign or reapply auth per redirect leg, and strip credentials on origin changes.
- **YAML files:** `.yml` extension (not `.yaml`). Requests stored one-per-file in collection dir.
- **Environments:** Dotenv-style `.env` files in `<collection>/.environments/`. `_color=<name>` sets the sidebar badge. `# @secret NAME` plus a blank placeholder declares an OS-vault secret; `process.env.NAME` takes precedence over the stored value.
- **Draft pattern:** `useRequestDraft` holds `Map<id, Request>` of dirty edits. `DraftOp` and mutation logic live in `requestDraftReducer.ts`. Compare with `isDirty` via deep equality.
- **Focus model:** `"sidebar" → "urlbar" → "request" → "response"` (main). URL bar has method and URL sub-focuses. `"env-sidebar" → "env-header" → "env-vars"` (env editor). `"cookie-sidebar" → "cookie-list"` (cookie jar). Skips hidden panes.
- **Keymap layers:** `src/ui/keymap/*Layers.ts` defines bindings gated on `focus`, `mode`, `overlay`, and `view`; `layers.ts` assembles them. Use `useBindings()` from `@opentui/keymap/react`.
- **Edit/Browse FSM:** Three modes — `inactive → browsing → editing`. `useEditBrowse` hook manages cursor, commit, cancel.
- **JSON request bodies:** `RequestBodyTab` always renders JSON through the inline `CodeEditorRenderable`; `editingBody` controls focus and the editor updates the request draft through `onBodyChange`. Escape and Shift+Tab return to the body-type selector; Ctrl+Z undoes and Ctrl+Shift+Z redoes body edits.
- **JSON validation:** `jsonValidation.ts` validates the substituted payload but maps parse failures back to the request source, including the variable name and source line/column when a substituted value is invalid.
- **Response bodies:** `ResponsePane` uses a read-only `CodeEditorRenderable` with source-numbered folds and a themed scrollbar. Folded selections and body copying must return the original source, not the collapsed display text.
- **Environment UI:** `e` opens `EnvironmentPickerOverlay`; `F3` opens the full editor. `Ctrl+N` in the editor opens `NewEnvironmentOverlay`, and `useEnvironmentEditor.createEnv()` persists the validated name and optional color.
- **Collection formatting:** `collection format <path>` loads and rewrites every request with canonical YAML, pretty-printing valid JSON bodies through `formatJson`. Invalid JSON remains unchanged, and valid numeric literals must retain their original precision. Imports run this formatter after writing the collection.
- **File I/O:** Save/delete operations validate path IDs to prevent traversal. Environment and settings saves are atomic via temporary files plus `rename()`; request and folder writes are direct writes.
- **Collection modes:** TUI opens collection roots in editable collection mode, request-containing uninitialized directories in read-only browse mode, and empty directories in read-only empty mode. Initialize through the command palette before editing or sending.
- **Updates:** `src/app/commands/update.ts` reads the versioned `https://noodlerest.dev/update.json` manifest, caches validated checksums, and verifies the matching binary before replacement. Keep manifest schema, release workflow publishing, installation docs, and update tests synchronized when changing this flow.
- **Timeline storage and security:** Timeline entries persist ordinary substituted request data, but declared environment secrets, proxy/TLS settings secrets, sensitive headers, and literal auth credentials are redacted before persistence. Server response status text, headers, and bodies remain intact. Bodies larger than 10 KB move to gzip sidecars under `.timeline/<request-id>.yml.bodies/`; YAML entries retain a `bodyRef`. Treat entries and sidecars as sensitive because public variables and server payloads are not redacted.
- **Settings secrets:** `src/secrets/index.ts` wraps `Bun.secrets` for environment secrets, proxy credentials, and encrypted mTLS key passphrases. Collection-scoped accounts use the generated `collection_id`; persist configuration and secret mutations transactionally so one cannot succeed without the other.
- **Cookie jars:** `src/cookies/index.ts` wraps `tough-cookie` with one concurrency-safe jar per `collection_id` under `~/.config/noodle/cookies/`. Prefer OS-vault-backed encryption, report the mode-`0600` plaintext fallback, never replace unreadable state automatically, and back it up before an explicit reset. `sendCookies: false` suppresses sending jar cookies for one request but does not suppress response capture.
- **Network security:** Custom proxy URLs reject credentials and variables; authentication metadata is `auth: true` and credentials come from the OS vault. `src/tls.ts` validates collection TLS, resolves CA/client-certificate files, and matches profiles by exact host and effective port. Redirects reject HTTPS-to-HTTP downgrades and strip credential-bearing headers when the origin changes.
- **OAuth security:** OAuth 1.0a PLAINTEXT is limited to HTTPS or loopback HTTP, body placement requires URL-encoded form data, and body hashes reject multipart. OAuth 2.0 endpoints require HTTPS except on loopback, browser grants use an HTTP loopback callback, tokens prefer OS-vault storage with session-only memory fallback, and non-interactive sends never open a browser. Generated code is unavailable for OAuth requests because signatures and tokens depend on request-specific secure state.
- **Imports and exports:** Module singletons (`filestore`, `lang`, `env`, `executor`). `runImport()` lazily registers the OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia importers; `runExport()` writes OpenAPI 3.0.3 or Postman Collection v2.1 output. Types come from `schema/index.ts`.
- **TUI collection transfer:** The command palette owns **Import Collection** and **Export Collection**. `ImportCollectionOverlay` can create a new collection or write into the current one, which must have no unsaved changes; `ExportCollectionOverlay` previews an OpenAPI or Postman target and picks the next available Postman directory. Both use `@/` path completion through `userPath.ts`.
- **Command actions:** Shared command logic lives in `commandActions.ts`. Keymap layers and `commands.ts` import from it. If you add a new action, add it there and call from both paths. Do not duplicate logic.
- **CommandItem.run returns boolean:** Palette commands return `true` (close palette) or `false` (stay open). Unavailable commands (save when not dirty, copy body when no response) return `false`.
- **Commands are contextual by view:** Build them in view-specific arrays (`requestCommands`, `mainEnvCommands`, `editorEnvCommands`, `workspaceCommands`, `systemCommands`, etc.) in `buildCommandPaletteCommands`. Use arrays for view-level availability; state-dependent `run()` guards return `false` when unavailable.
- **PickerOverlay isNavigable:** Command palette sections are generated by `CommandPaletteOverlay`. For other picker items with non-selectable rows, pass `isNavigable` so navigation skips them.
- **Modal keyboard isolation:** `useModalKeyboardShield` installs a hard-blocking interceptor only for explicitly non-editable overlays. Editable and unknown overlays leave events available to the focused input; unknown names warn and remain input-safe. Modal-owned controls that must receive keys first (for example, an open `Select` menu) use a priority above the shield.
- **getView reads React state, not keymap:** In `AppInner.tsx`, `getView: () => keymap.getData("app.view")` is stale during render. Use `getView: () => view` where `view` is the React state variable.

## Common pitfalls

- Forgetting `{ cause: e }` on re-throws — breaks error chains
- Using `{{var}}` instead of `$var` — noodle uses `$` prefix, not mustache
- Skipping `validatePathId()` in new file operations — security risk
- Adding keybindings without `fixed: true` for navigation keys (Tab, Enter, Escape, arrows) — users could break navigation
- Not registering a new keymap layer in `layers.ts` — binding won't fire
- Forgetting to update `focus.ts` `cycleFocus()` when adding new panes — tab cycling breaks
- Adding command logic inline instead of in `commandActions.ts` — will drift from keymap layer and vice versa
- Using `run: () => void` instead of `run: () => boolean` — palette won't close correctly
- Adding vanilla `run()` with early `return` instead of `return false` — palette closes on unavailable commands
- Handling modal keys only with `useKeyboard` — events can leak to obscured panes; consume them through a keymap interceptor instead
- Treating `sendCookies: false` as a capture toggle; it disables jar cookies on the outgoing request only
