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
- **Variable syntax:** `$VARNAME` (no braces), with names matching `^\w+$`. `src/variableReference.ts` is the shared scanner/replacer; `$$` emits a literal dollar and values resolve once. Applied in url/headers/params/body/formData/filePath/auth and assertion expected string values. Disabled fields remain source-identical. Automation overlays RunScope capture values through the same substitution path.
- **Authentication:** `src/auth/defaults.ts` owns reusable auth defaults, `src/lang/auth.ts` owns strict shared request and folder parsing/serialization, and `src/ui/authRows.ts` owns field metadata and mutation for both editors. OAuth 1.0a signing lives in `src/requests/oauth1.ts`; OAuth 2.0 token acquisition, refresh, vault storage, and loopback browser authorization live in `oauth2.ts` and `oauth2Browser.ts`. Keep generated OAuth state out of YAML, re-sign or reapply auth per redirect leg, and strip credentials on origin changes.
- **YAML files:** `.yml` extension (not `.yaml`). Requests stored one-per-file in collection dir.
- **Environments:** Dotenv-style `.env` files in `<collection>/.environments/`. Public, disabled, and secret keys use `^\w+$`; `_color` is reserved metadata. Preserve all value content after the first `=`, including trailing spaces. `# @secret NAME` plus a blank placeholder declares an OS-vault secret; `process.env.NAME` takes precedence over the stored value.
- **Draft pattern:** `useRequestDraft` holds `Map<id, Request>` of dirty edits. `DraftOp` and mutation logic live in `requestDraftReducer.ts`. Compare with `isDirty` via deep equality.
- **Focus model:** `"sidebar" → "urlbar" → "request" → "response"` (main). URL bar has method and URL sub-focuses. `"env-sidebar" → "env-header" → "env-vars"` (env editor). `"cookie-sidebar" → "cookie-list"` (cookie jar). `"runner-options" → "runner-requests"` (collection Runner). Skips hidden panes.
- **Resizable main layout:** `AppInner.tsx` owns the sidebar width and separate stacked and side-by-side split ratios. `MainView.tsx` handles mouse drag state, responsive minimums, and double-click reset; `RequestResponseView.tsx` renders the layout-specific handles. Keep sizing session-only unless persistence is explicitly requested, and stop resize events from changing pane focus.
- **Keymap layers:** `src/ui/keymap/*Layers.ts` defines bindings gated on `focus`, `mode`, `overlay`, and `view`; `layers.ts` assembles them. Use `useBindings()` from `@opentui/keymap/react`.
- **Edit/Browse FSM:** Three modes — `inactive → browsing → editing`. `useEditBrowse` hook manages cursor, commit, cancel.
- **JSON and XML request bodies:** `RequestBodyTab` renders both through the inline `CodeEditorRenderable`; JSON validates substituted content, while XML uses Tree-sitter highlighting and is sent unchanged after substitution with an `application/xml` default when no enabled Content-Type exists. `editingBody` controls focus and the editor updates the request draft through `onBodyChange`. Escape and Shift+Tab return to the body-type selector; Ctrl+Z undoes and Ctrl+Shift+Z redoes body edits.
- **JSON validation:** `jsonValidation.ts` validates the substituted payload but maps parse failures back to the request source, including the variable name and source line/column when a substituted value is invalid.
- **Response bodies:** `ResponsePane` uses a read-only `CodeEditorRenderable` with source-numbered folds and a themed scrollbar. Folded selections and body copying must return the original source, not the collapsed display text.
- **Environment UI:** `e` opens `EnvironmentPickerOverlay`; `F3` opens the full editor. `Ctrl+N` in the editor opens `NewEnvironmentOverlay`, and `useEnvironmentEditor.createEnv()` persists the validated name and optional color.
- **Collection formatting:** `collection format <path>` loads and rewrites every request with canonical YAML, pretty-printing valid JSON bodies through `formatJson`. Invalid JSON remains unchanged, and valid numeric literals must retain their original precision. Imports run this formatter after writing the collection.
- **Response assertions:** `src/response.ts` parses and resolves `status`, `response.time`, case-insensitive header, and JSON body expressions. `src/assertions.ts` evaluates typed operators. `src/executionResults.ts` orchestrates capture-before-assertion execution for manual TUI sends and automation. Disabled assertions remain validated and editable but produce no results. Structured and persisted results recursively redact known secrets from expected and actual values; live response views and arbitrary server data remain visible.
- **Response captures and RunScope:** Every request `capture` entry is an object with required `value`, optional `enabled`, and optional `persist`; scalar shorthand is invalid. `src/runScope.ts` stores typed successful values for one top-level call and exposes an environment overlay to `substitute()`. Captures commit before assertions, failed captures do not replace prior values, and disabled captures produce no mutation or result. Values captured from sensitive response headers become secret automatically. Manual sends and `request run` may persist plaintext or secret values through `persistResponseCaptures()`; collection runs and the TUI Runner ignore persistence. Capture declarations persist in request YAML but are excluded from timeline snapshots; capture results and RunScope values never enter timeline history.
- **Collection Runner:** `useCollectionRunner.ts` owns transient request/folder selection, environment, include/exclude tags, fail-fast and delay state, progress, and in-memory results. `CollectionRunnerView.tsx` renders the two-pane workspace and shared expandable `ResponseResults`; `runnerLayers.ts` owns navigation. F5 opens it by default. It composes `selectCollectionRunRequests()` and `collectionRun()` rather than owning alternate request declaration editors or execution semantics.
- **Selective collection runs:** `collection run <path> [<target>...]` accepts request IDs and folder paths ending in `/`. Resolve and validate all targets before sending, include nested folder requests, deduplicate overlaps, and retain collection order.
- **Collection suites:** Optional request and non-root folder `tags` form dynamic suites. Effective tags are the union across the ancestor chain. Collection targets resolve first, then repeated `--tag` values use AND matching and repeated `--exclude-tag` values use OR matching before environment, proxy, TLS, cookies, or execution. Preserve collection order, RunScope isolation, fixed failure-category ordering, fail-fast skips, and exit codes `0` success, `1` completed failure, `2` configuration failure.
- **File I/O:** Save/delete operations validate path IDs to prevent traversal. Environment replacement and settings saves are atomic via temporary files plus `rename()`; new, cloned, and renamed environments use atomic exclusive creation. Request and folder writes are direct writes.
- **Collection modes:** TUI opens collection roots in editable collection mode, request-containing uninitialized directories in read-only browse mode, and empty directories in read-only empty mode. Initialize through the command palette before editing or sending. Invalid request or folder YAML opens `CollectionErrorView`, which reuses `YamlFileEditor` for per-file repair drafts, validation, save, and delete actions.
- **Updates:** `src/app/commands/update.ts` reads the versioned `https://noodlerest.dev/update.json` manifest, caches validated checksums, and verifies the matching binary before replacement. `useUpdateFlow` checks and installs updates when the TUI starts, while `Header` and `AboutOverlay` render progress. After a successful standalone or Homebrew update, `updateInstall.ts` refreshes an existing managed `noodle-use` skill with the new executable; refresh failure is non-fatal and must surface `noodle agent install` as the retry. Keep manifest schema, release workflow publishing, installation docs, and update tests synchronized when changing this flow.
- **Agent skill installation:** `src/agentSkill.ts` embeds the repository's `noodle-use` files, installs the managed copy under `~/.agents/skills/noodle-use`, and links detected Claude, Cursor, Codex, and OpenCode skill directories. `src/app/commands/agent.ts` exposes `noodle agent install [--json] [--force]`; the command palette calls the same installer through `commandActions.ts`. Preserve unmanaged targets by default and report every conflict before modifying anything. Force replacement must retain backups until all targets succeed and roll completed replacements back without overwriting a target that changed during the operation.
- **Timeline storage and security:** Timeline request snapshots redact declared environment, proxy, and TLS secrets; substituted and literal credentials; jar-sent `Cookie` headers; known captured secrets; and assertion metadata before persistence. Server response fields, including `Set-Cookie`, are stored intact. Bodies larger than 10 KB move to gzip sidecars under `.timeline/<request-id>.yml.bodies/`; YAML entries retain a `bodyRef`. Treat entries and sidecars as sensitive because public variables and server responses are not redacted.
- **Settings secrets:** `src/secrets/index.ts` wraps `Bun.secrets` for environment secrets, proxy credentials, and encrypted mTLS key passphrases. Collection-scoped accounts use the generated `collection_id`; persist configuration and secret mutations transactionally so one cannot succeed without the other.
- **Cookie jars:** `src/cookies/index.ts` wraps `tough-cookie` with one concurrency-safe jar per `collection_id` under `~/.config/noodle/cookies/`. Prefer OS-vault-backed encryption, report the mode-`0600` plaintext fallback, never replace unreadable state automatically, and back it up before an explicit reset. `sendCookies: false` suppresses sending jar cookies for one request but does not suppress response capture.
- **Network security:** Custom proxy URLs reject credentials and variables; authentication metadata is `auth: true` and credentials come from the OS vault. `src/tls.ts` validates collection TLS, resolves CA/client-certificate files, and matches profiles by exact host and effective port. Redirects reject HTTPS-to-HTTP downgrades and strip credential-bearing headers when the origin changes.
- **OAuth security:** OAuth 1.0a PLAINTEXT is limited to HTTPS or loopback HTTP, body placement requires URL-encoded form data, and body hashes reject multipart. OAuth 2.0 endpoints require HTTPS except on loopback, browser grants use an HTTP loopback callback, tokens prefer OS-vault storage with session-only memory fallback, and non-interactive sends never open a browser. Generated code is unavailable for OAuth requests because signatures and tokens depend on request-specific secure state.
- **Imports and exports:** Module singletons (`filestore`, `lang`, `env`, `executor`). `runImport()` lazily registers the OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia importers; `runExport()` writes OpenAPI 3.0.3 or Postman Collection v2.1 output. XML bodies preserve literal examples and explicit MIME types across supported formats. Types come from `schema/index.ts`.
- **TUI collection transfer:** The command palette owns **Import Collection** and **Export Collection**. `ImportCollectionOverlay` can create a new collection or write into the current one, which must have no unsaved changes; `ExportCollectionOverlay` previews an OpenAPI or Postman target and picks the next available Postman directory. Both use `@/` path completion through `userPath.ts`.
- **Command actions:** Shared command logic lives in `commandActions.ts`. Keymap layers and `commands.ts` import from it. If you add a new action, add it there and call from both paths. Do not duplicate logic.
- **External editors:** `externalEditor.ts` detects supported editor executables and macOS applications. Global Behavior stores the selected `external_editor`; command actions open only the collection or application settings directories.
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
