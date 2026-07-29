# Recipes

Each recipe follows: **Locate → Follow → Implement → Test → Verify**

---

## Add a new keybinding

**Locate:**
- `src/ui/keybind.ts:17-53` — Definitions object
- `src/ui/keymap/` — split global, request, folder, and environment layers
- `src/ui/keymap/layers.ts` — layer assembly and dispatch tuple

**Follow:** Copy pattern from existing bindings. Each has a `section` (global/browse/edit), `key` combo, optional `fixed: true` to prevent user override.

**Implement:**
1. Add entry to `Definitions` in `keybind.ts`
2. Add command and binding in the owning `src/ui/keymap/*Layers.ts` file
   - Global actions: `globalLayers.ts`
   - Request actions and request browse/edit keys: `requestLayers.ts`
   - Folder actions and folder browse/edit keys: `folderLayers.ts`
   - Environment-editor actions: `environmentLayers.ts`
3. Gate with guard conditions in the handler's condition array
4. Wire callback to the relevant hook method (draftMutator, send handler, etc.)

**Test:** Add a layer test in `tests/unit/appKeymapLayers.test.ts`. Register layers, press the key, assert the owned callback fired.

**Verify:** `bun test tests/unit/appKeymapLayers.test.ts && bun run lint`

---

## Add a new pane/view

**Locate:**
- `src/ui/AppInner.tsx` — view routing, decides which panes render
- `src/ui/focus.ts:25-52` — `cycleFocus()` must include new pane
- Existing panes for pattern: `RequestPane.tsx`, `ResponsePane.tsx`, `FolderPane.tsx`, `EnvEditorPane.tsx`

**Follow:** Panes use lowercase OpenTUI JSX primitives and `Frame` with border presets. The owning view passes `focused`; use it to select `theme.primary` or `theme.borderSubtle`.

**Implement:**
1. Create new component in `src/ui/YourPane.tsx`
2. Add focus type to `Focus` union in `focus.ts`
3. Add to the appropriate focus order in `cycleFocus()` in `focus.ts`
4. Update `cycleFocus()` to include the new focus type, respecting hidden-when-expanded logic
5. Route main content through `MainView.tsx`; keep `AppInner.tsx` for state wiring
6. If pane has tabs, follow `Tabs.tsx` plus the owning pane's controlled tab state
7. Wire up any new hooks or extend existing ones

**Test:** Create a component test and extend focus/keymap tests for the new cycle position.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new overlay

**Locate:**
- Existing overlays: `src/ui/overlays/PickerOverlay.tsx` (generic base), `src/ui/theme.tsx` (ThemePickerOverlay), `src/ui/editor/YamlEditorOverlay.tsx`, `src/ui/overlays/ConfirmOverlay.tsx`
- `src/ui/useOverlayState.ts` — overlay state and `ActiveOverlay`
- `src/ui/AppOverlays.tsx` — overlay render slots
- `src/ui/useModalKeyboardShield.ts` — hard-blocking overlay keyboard isolation
- `src/ui/useOverlayIntercepts.ts` and `src/ui/intercepts/` — modal-specific keyboard handling

**Follow:** For picker-style overlays, reuse `PickerOverlay<T>`. Add other overlays to `useOverlayState` and `AppOverlays`; do not create a direct OpenTUI modal or local `AppInner` state path. Classify every overlay in `EDITABLE_OVERLAYS` or `HARD_BLOCKING_OVERLAYS` in `useModalKeyboardShield`; add a modal-specific interceptor only when its controls need custom key handling.

**Implement (picker-style):**
1. Define item type and use `PickerOverlay<T>` with `keyExtractor`, `filter`, `renderItem` props
2. Wire `onSelect`, `onClose`, `onHighlightChange` to parent state
3. Add an `ActiveOverlay` entry and render slot in `AppOverlays.tsx`
4. Sync overlay state through `useKeymapSync.ts` and add opening keys in the owning keymap layer

**Implement (modal):**
1. Create component in `src/ui/YourOverlay.tsx`
2. Add overlay type and state to `useOverlayState.ts`
3. Add a render branch in `AppOverlays.tsx`
4. Sync it with `app.overlay`; add opening/close keys in the owning layer or interceptor
5. Add the overlay to `EDITABLE_OVERLAYS` or `HARD_BLOCKING_OVERLAYS`; editable overlays install no shield, while hard-blocking overlays prevent and stop background keys
6. If overlay writes to collection (e.g., new request), call `filestore.saveRequest` then reload collection

**Test:** Component test verifying overlay renders, form submission works, cancel dismisses, and a lower-priority background key handler does not receive an overlay shortcut or an unused printable key.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new auth type

**Locate:**
- `src/schema/index.ts` — `Auth` discriminated union
- `src/lang/parse.ts` — `parseAuth()` function
- `src/lang/serialize.ts` — `serializeAuth()` in request serialization
- `src/requests/send.ts` — `authHeader()` function
- `src/hooks/requestDraftReducer.ts` — `DraftOp` type + reducer
- `src/ui/AuthEditor.tsx` — Auth field editor component

**Follow:** Existing auth types: `none`, `inherit`, `bearer`, `basic`, `api_key`. Each adds one variant to the `Auth` union.

**Implement:**
1. Add type to `Auth` union in `schema/index.ts` — define fields specific to that auth type
2. Add parse case in `lang/parse.ts` `parseAuth()` — read fields from YAML
3. Add serialize case in `lang/serialize.ts` — omit empty auth type
4. Add header construction in `requests/send.ts` `authHeader()` — return `Record<string, string>`
5. Add `DraftOp` variant (e.g., `{ kind: "setAuthYourType"; field: string; value: string }`)
6. Handle in `requestDraftReducer.ts` — switch on `op.kind`, cache prior auth state when switching
7. Add UI in `AuthEditor.tsx` — render fields for the new auth type when selected
8. Add to auth type Select options in `AuthEditor.tsx`

**Test:** Unit tests for parse/serialize round-trip, authHeader output, draft application. Integration test for auth editor UI.

**Verify:** `bun test tests/lang.test.ts tests/requests.test.ts && bun run lint && bun run typecheck`

---

## Add a new body type

**Locate:**
- `src/schema/index.ts` — `BodyType` union
- `src/lang/parse.ts` — `parseBody()` / body parsing
- `src/lang/serialize.ts` — body serialization
- `src/requests/send.ts` — `bodyForSend()` function + `buildFormData()`
- `src/hooks/requestDraftReducer.ts` — body switching caches prior body state

**Follow:** Existing body types: `none`, `json`, `urlencoded`, `multipart`, `binary`. Pattern is consistent — add type, parser, serializer, sender, UI.

**Implement:**
1. Add type to `BodyType` union in `schema/index.ts`
2. Add parse branch in `lang/parse.ts` — handle new body format
3. Add serialize branch in `lang/serialize.ts`
4. Add send branch in `requests/send.ts` `bodyForSend()` — return `BodyInit | undefined`
5. Update body-type-switching cache logic in `requestDraftReducer.ts`
6. Add UI in `request-pane/RequestBodyTab.tsx` — body type Select + fields specific to type
7. If new body type has form fields, reuse `KeyValueSection` / `FormEditor` components

**Test:** Parse round-trip, bodyForSend output, draft switching preserves/restores prior body. Unit + lang tests.

**Verify:** `bun test tests/lang.test.ts tests/requests.test.ts && bun run lint && bun run typecheck`

---

## Add a new settings tab to RequestPane

**Locate:**
- `src/ui/RequestPane.tsx` — `BASE_TAB_DEFS` and active-tab rendering
- `src/ui/request-pane/RequestSettingsTab.tsx` — settings-tab content
- `src/hooks/requestDraftReducer.ts` — any new draft operations needed

**Follow:** Existing tabs: headers, params, body, auth, settings. `useEditBrowse` owns the controlled active tab; `RequestPane` maps tab IDs to content.

**Implement:**
1. Add a definition to `BASE_TAB_DEFS` and update `FieldKind`/field order where needed
2. Implement content with existing UI primitives in the appropriate request-pane component
3. If new tab needs draft mutations, add `DraftOp` variants to `requestDraftReducer.ts`
4. Keep left/right navigation in `requestLayers.ts`; Tabs auto-reveals the active ID

**Test:** Component test rendering new tab, field edits produce correct draft ops.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new hook

**Locate:**
- `src/hooks/` — all existing hooks
- `src/ui/AppInner.tsx` — where hooks are instantiated, wired to components
- `src/schema/index.ts` — types the hook might need

**Follow:** Hooks follow React convention. They export named functions. State hooks return `{state, actions}` or `[state, dispatch]`. Most hooks take `collectionDir` and other config as arguments.

**Implement:**
1. Create `src/hooks/useYourFeature.ts`
2. If managing file I/O: import from `filestore/` or `env/` modules
3. If managing request state: use `useState`/`useReducer`, return both state and mutators
4. Wire into `AppInner.tsx` — instantiate hook, pass result as props to components
5. If hook needs to respond to keybindings, export callbacks for its owning `src/ui/keymap/*Layers.ts` module

**Test:** Hook test using `renderHook` or test by mounting parent component.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add an environment feature

**Locate:**
- `src/env/load.ts` — `loadEnvironment(dir, name)` returns `Environment`
- `src/env/save.ts` — `saveEnvironment(dir, env)`, atomic write
- `src/hooks/useEnvironments.ts` — cycling, loading, active env
- `src/hooks/useEnvironmentEditor.ts` — full CRUD for env editor view

**Follow:** Dotenv format: `KEY=value`. Lines starting with `#` are disabled vars. `_color=<name>` is special.

**Implement:**
1. For new load feature: add function in `src/env/` that reads/parses `.env` files
2. For new env field type: update `Environment` type in `schema/index.ts`
3. Wire into `useEnvironments` or `useEnvironmentEditor` as needed
4. If user-facing: add UI in env editor panes (`EnvHeaderPane.tsx`, `EnvEditorPane.tsx`)

**Test:** Use `mkdtemp` for temp env dirs. Write `.env` files, load, assert fields. Clean up with `rm` in `afterEach`.

**Verify:** `bun test tests/env*.test.ts && bun run lint && bun run typecheck`

---

## Add a new importer

**Locate:**
- `src/converters/index.ts` — `registerImporter()`, `detectFormat()`, `getImporter()`
- `src/converters/openapi/` — example importer
- `src/converters/postman/` — second example importer
- `src/app/import.ts` — where importers are registered + CLI import flow

**Follow:** Importers implement `{ type, detect, import }`. `runImport()` lazily registers built-in importers; detect format from source content before import.

**Implement:**
1. Create `src/converters/yourformat/` directory
2. Export an importer object with `type`, `detect`, and `import` methods
3. Register it with `registerImporter({ type, detect, import })` in the lazy registration path in `src/app/import.ts`
4. Use existing `saveRequest` from filestore to write converted requests to disk

**Test:** Provide sample source file, call converter, assert `Collection` has expected structure. Use temp dirs for output.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new CLI flag

**Locate:**
- `src/app/commands/default.ts` — citty `defineCommand` for TUI mode (args + run handler)
- `src/app/commands/import.ts` — citty `defineCommand` for import subcommand
- `src/app/commands/automation.ts` — citty resource-command definitions
- `src/app/services.ts` — automation behavior; keep filesystem, environment, and executor work here
- `src/app/commandResult.ts` — shared JSON-envelope and exit-code handling
- `src/app/cli.ts` — main entry, defines subcommands
- `src/app/main.tsx` — `bootstrap()` function, wires flags into app

**Follow:** Flags are typed citty args. Each arg is a property in `args:` object with `type`, `alias`, `default`, `description`. Positional args use `type: "positional"` + `required: true`.

**Implement:**
1. Add arg to the appropriate `defineCommand()` command definition
2. For startup flags: pass to `bootstrap()` in command's `run()` handler
3. Wire into app via `BootstrapOptions` in `src/app/main.tsx`
4. If a flag affects resource-command behavior: use it in the automation command handler and pass the work to `services.ts`
5. Preserve `--json`'s one-envelope stdout contract; represent operational failures with a nonzero exit code

**Test:** Add test in `tests/cli.test.ts`. Test command definition types and integration via `Bun.spawnSync`.

**Verify:** `bun test tests/cli.test.ts && bun run lint && bun run typecheck`

---

## Add a command palette command

**Locate:**
- `src/ui/commandActions.ts` — all command action implementations (shared across keymap + palette)
- `src/ui/commands.ts` — `buildCommandPaletteCommands(context)` assembles command arrays using `context.getView()`
- `src/ui/overlays/CommandPaletteOverlay.tsx` — PickerOverlay for command palette

**Follow:** Actions live in `commandActions.ts`. Keymap layers and `commands.ts` import from there. Never duplicate logic. Each `CommandItem` has `label`, `shortcut`, `run()` returning `boolean` (`true` to close palette, `false` to stay open). Unavailable commands (e.g., save when nothing dirty) return `false`.

**Implement:**
1. Add action function to `commandActions.ts` — export a named function
2. Add `CommandItem` to the correct view-specific array in `buildCommandPaletteCommands()`:
   - `requestCommands` — request actions (send, save, edit, new, clone, delete)
   - `responseCommands` — response actions (copy body)
   - `mainEnvCommands` — env actions in main view (cycle, open editor)
   - `editorEnvCommands` — env actions in env editor (save, new, clone, delete)
   - `workspaceCommands` — layout/expand/folder commands
   - `systemCommands` — help, theme, collection switcher, undo all
3. Use contextual arrays for view-level availability. Keep state-dependent availability guards inside `run()` and return `false` when unavailable.
4. Commands declare `section`; `CommandPaletteOverlay` creates non-navigable section headers.

**Test:** Add command to `tests/unit/commands.test.ts` — call `buildCommandPaletteCommands(minimalContext())`, verify command present. Add action test for the new function.

**Verify:** `bun test tests/unit/commands.test.ts && bun run lint && bun run typecheck`

---

## Add a jump mode target

**Locate:**
- `src/ui/useJumpMode.ts` -- `getAvailableTargets()`, `JumpTarget` union, `REQUEST_TAB_HINTS` / `RESPONSE_TAB_HINTS` letter-field maps
- `src/ui/AppInner.tsx` -- `useJumpMode()` hook processes target selection, dispatches focus + tab changes
**Follow:** Each `JumpTarget` kind (`sidebar`, `method`, `url`, `request-tab`, `response-tab`) follows a consistent pattern -- a letter maps to a kind, and `AppInner` translates that into `setFocus` / `setTab` calls. Badges use `REQUEST_TAB_HINTS` and `RESPONSE_TAB_HINTS` to map tabs to their assigned letters. Jump badges render in their owning components (Sidebar, UrlBar, RequestPane Tabs, ResponsePane Tabs), not in a separate overlay.

**Implement:**
1. Pick an unused letter for the new target
2. If targeting a new focusable area: add a `JumpTarget` variant -- but first verify the area doesn't map cleanly to an existing kind
3. Add a branch in `getAvailableTargets()` -- register the letter-target mapping, gated on the appropriate conditions (`hasRequest`, `expanded`, `folderView`)
4. Handle the new target kind in `AppInner.tsx` inside the jump mode selection handler -- call `setFocus`, `setTab`, etc.
5. If the target maps to a request or response tab, add the tab-letter entry in `REQUEST_TAB_HINTS` or `RESPONSE_TAB_HINTS` so badges render on the correct tab
6. Render a `JumpBadge` in the owning component, gated on `jumpMode`. Use `JUMP_BADGE_TOP_LEFT` or `JUMP_BADGE_TOP_INDENT` for consistent positioning.

**Test:** Add test in `tests/unit/ResponsePaneStatus.test.tsx` -- verify `getAvailableTargets()` returns the new target under correct conditions. Add integration dispatch test.

**Verify:** Run the owning jump-mode and keymap unit tests, then `bun run lint && bun run typecheck`

---

## Add a new theme

**Locate:**
- `src/ui/theme-data.ts` — `Theme` interface, `THEMES` array (32 themes)
- `src/ui/theme.tsx` — `ThemeProvider`, `useTheme()`, `ThemePickerOverlay`
- `src/ui/editor/yamlSyntax.ts` — `createYamlSyntaxStyle(theme, name)` creates per-theme syntax styles

**Follow:** Each theme is a `Theme` object with 16 color fields. Syntax styles reference theme colors — no per-theme style config needed.

**Implement:**
1. Add a new `Theme` object to `THEMES` array in `theme-data.ts`
2. Theme is auto-available in ThemePickerOverlay (no registration needed)
3. Syntax highlighting uses theme colors via `styleIdForFg()` and `createYamlSyntaxStyle()` — re-creates styles when theme changes

**Test:** Theme data is pure data — no tests typically needed. If adding special rendering, add component test.

**Verify:** `bun run lint && bun run typecheck`

---

## Add variable completion to a new input

**Locate:**
- `src/ui/variable-completion/variableCompletion.ts` — `getVariableToken`, `getVariableSuggestions`, `replaceVariableToken`
- `src/ui/variable-completion/useVariableCompletion.ts` — hook returning `{ completion, getCompletion, makeHandleKey }`
- `src/ui/variable-completion/variableCompletionInterceptor.tsx` — registers high-priority (200) key interceptor on keymap
- `src/ui/VarInput.tsx` — fully integrated variable-aware input component (reuse this if possible)

**Follow:** `VarInput` already handles completion for Input and Textarea. If your new component needs completions but can't use VarInput directly, register a new handler.

**Implement (new standalone input):**
1. Import `useVariableCompletion()` and call it with `variableNames` (env var keys or custom list)
2. On each keystroke, call `getCompletion(value, cursorOffset)` to update completion state
3. For keyboard handling, call `makeHandleKey()` which returns a handler for up/down/tab/return/escape
4. Use `VariableCompletionInterceptor` component near the input to register the handler
5. Render a popup for this input's completion state and anchor it to its cursor. Reserve `<CodeEditorCompletion>` for `CodeEditorRenderable` instances.

**Implement (with VarInput):**
1. Use `<VarInput>` component directly — it handles completion, highlighting, and popup rendering internally
2. Pass `variableNames` prop to control available completions (defaults to active env vars)

**Test:** Add to `tests/unit/UrlBar.test.tsx` or `tests/unit/variableCompletion.test.ts`. Test completion popup appears on `$`, navigates with up/down, closes on escape.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add tree-sitter highlighting for a new language

**Locate:**
- `src/lang/parsers/json/` — example: `tree-sitter-json.wasm` + `highlights.scm`
- `src/lang/parsers/yaml/` — second example
- `src/ui/editor/codeEditorParsers.ts` — parser registration
- `src/types/assets.d.ts` — `*.wasm` and `*.scm` type declarations (file paths)
- `src/ui/editor/CodeEditor.ts` — `CodeEditorRenderable` class that consumes registered parsers

**Follow:** Each language needs a tree-sitter `.wasm` parser + `highlights.scm` query file. Register in `src/ui/editor/codeEditorParsers.ts`.

**Implement:**
1. Create `src/lang/parsers/<lang>/` directory
2. Add `tree-sitter-<lang>.wasm` and `highlights.scm`
3. Register in `src/ui/editor/codeEditorParsers.ts` — add entry to the parsers map
4. Add syntax style IDs for the new language in the CodeEditor theme sync logic (e.g., `highlight/token.ts`)
5. Add a local tokenizer fallback in `src/ui/editor/syntax.ts` or a new file for when tree-sitter fails

**Test:** Add test for highlight tokens, parser registration, and highlight application.

**Verify:** `bun test && bun run lint && bun run typecheck`
