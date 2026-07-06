# Recipes

Each recipe follows: **Locate → Follow → Implement → Test → Verify**

---

## Add a new keybinding

**Locate:**
- `src/ui/keybind.ts:17-53` — Definitions object
- `src/ui/useAppKeymap.ts` — keymap layers

**Follow:** Copy pattern from existing bindings. Each has a `section` (global/browse/edit), `key` combo, optional `fixed: true` to prevent user override.

**Implement:**
1. Add entry to `Definitions` in `keybind.ts`
2. Add handler in the correct layer in `useAppKeymap.ts`
   - Always-On: runs regardless of mode/focus (line ~117)
   - Base: when `mode=base` and no overlay (line ~246)
   - Browse: when `mode=browse` (line ~382)
   - Edit: when `mode=edit` (line ~608)
3. Gate with guard conditions in the handler's condition array
4. Wire callback to the relevant hook method (draftMutator, send handler, etc.)

**Test:** Add test case in `tests/integration/keymap.test.ts`. Register layers, call `host.press(key)`, assert callback fired.

**Verify:** `bun test tests/integration/keymap.test.ts && bun run lint`

---

## Add a new pane/view

**Locate:**
- `src/ui/AppInner.tsx` — view routing, decides which panes render
- `src/ui/focus.ts:25-52` — `cycleFocus()` must include new pane
- Existing panes for pattern: `RequestPane.tsx`, `ResponsePane.tsx`, `FolderPane.tsx`, `EnvEditorPane.tsx`

**Follow:** Each pane gets a `FocusPane` wrapper (cyan border when focused), uses `Box`/`BorderBox` for layout, and responds to `focus` state for visual highlight.

**Implement:**
1. Create new component in `src/ui/YourPane.tsx`
2. Add focus type to `Focus` union in `focus.ts`
3. Add to visual order in `focus.ts` `getVisualOrder()` — defines Tab cycling
4. Update `cycleFocus()` to include the new focus type, respecting hidden-when-expanded logic
5. Add render branch in `AppInner.tsx` — gated on `view` and `selectedItem` type
6. If pane has tabs/Sections, pattern from `RequestPane.tsx`: use `TabSection` array, track `tabIndex` state, render conditionally
7. Wire up any new hooks or extend existing ones

**Test:** Create component test in `tests/` using `createTestKeymap`. Test focus cycling includes new pane.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new overlay

**Locate:**
- Existing overlays: `src/ui/PickerOverlay.tsx` (generic base), `src/ui/ThemePickerOverlay.tsx` (uses PickerOverlay), `src/ui/YamlEditorOverlay.tsx`, `src/ui/ConfirmOverlay.tsx`
- `src/ui/AppInner.tsx` — overlay rendering gated on `overlay` state
- `src/ui/useAppKeymap.ts` — overlay keymap layers (Close/Cancel)

**Follow:** For picker-style overlays (search + filter + list + selection), reuse `PickerOverlay<T>` with render props. Others use `Modal` from OpenTUI directly. State is managed via a `useState` in `AppInner.tsx` or a dedicated hook.

**Implement (picker-style):**
1. Define item type and use `PickerOverlay<T>` with `keyExtractor`, `filter`, `renderItem` props
2. Wire `onSelect`, `onClose`, `onHighlightChange` to parent state
3. Add render branch in `AppInner.tsx` gated on your state
4. Add keybinding — typically in Always-On Layer for global keys, or focus-specific layer

**Implement (modal):**
1. Create component in `src/ui/YourOverlay.tsx`
2. Add overlay type name to any overlay state tracking (e.g., `app.overlay` keymap data)
3. Add render branch in `AppInner.tsx` when your overlay is active
4. Add keybinding to open overlay — typically in Base layer, sets overlay state
5. Modal auto-grabs focus; Close/Cancel keys (Escape) dismiss
6. If overlay writes to collection (e.g., new request), call `filestore.saveRequest` then reload collection

**Test:** Component test verifying overlay renders, form submission works, cancel dismisses.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new auth type

**Locate:**
- `src/schema/index.ts` — `Auth` discriminated union
- `src/lang/parse.ts` — `parseAuth()` function
- `src/lang/serialize.ts` — `serializeAuth()` in request serialization
- `src/requests/send.ts` — `authHeader()` function
- `src/hooks/useRequestDraft.ts` — `DraftOp` type + `applyDraft` handler
- `src/ui/RequestPane.tsx` — Auth tab rendering (Select for type, fields for parameters)
- `src/ui/AuthEditor.tsx` — Auth field editor component

**Follow:** Existing auth types: `none`, `inherit`, `bearer`, `basic`, `api_key`. Each adds one variant to the `Auth` union.

**Implement:**
1. Add type to `Auth` union in `schema/index.ts` — define fields specific to that auth type
2. Add parse case in `lang/parse.ts` `parseAuth()` — read fields from YAML
3. Add serialize case in `lang/serialize.ts` — omit empty auth type
4. Add header construction in `requests/send.ts` `authHeader()` — return `Record<string, string>`
5. Add `DraftOp` variant (e.g., `{ type: "setAuthYourType"; field: string; value: string }`)
6. Handle in `applyDraft()` — switch on `op.type`, cache prior auth state when switching
7. Add UI in `AuthEditor.tsx` — render fields for the new auth type when selected
8. Add to auth type Select options in `RequestPane.tsx` auth tab

**Test:** Unit tests for parse/serialize round-trip, authHeader output, draft application. Integration test for auth editor UI.

**Verify:** `bun test tests/lang.test.ts tests/requests.test.ts && bun run lint && bun run typecheck`

---

## Add a new body type

**Locate:**
- `src/schema/index.ts` — `BodyType` union
- `src/lang/parse.ts` — `parseBody()` / body parsing
- `src/lang/serialize.ts` — body serialization
- `src/requests/send.ts` — `bodyForSend()` function + `buildFormData()`
- `src/hooks/useRequestDraft.ts` — body switching caches prior body state

**Follow:** Existing body types: `none`, `json`, `urlencoded`, `multipart`, `binary`, `raw`. Pattern is consistent — add type, parser, serializer, sender, UI.

**Implement:**
1. Add type to `BodyType` union in `schema/index.ts`
2. Add parse branch in `lang/parse.ts` — handle new body format
3. Add serialize branch in `lang/serialize.ts`
4. Add send branch in `requests/send.ts` `bodyForSend()` — return `BodyInit | undefined`
5. Update `applyDraft()` body-type-switching cache logic in `useRequestDraft.ts` (line ~264)
6. Add UI in `RequestPane.tsx` body tab — body type Select + fields specific to type
7. If new body type has form fields, reuse `KeyValueSection` / `FormEditor` components

**Test:** Parse round-trip, bodyForSend output, draft switching preserves/restores prior body. Unit + lang tests.

**Verify:** `bun test tests/lang.test.ts tests/requests.test.ts && bun run lint && bun run typecheck`

---

## Add a new settings tab to RequestPane

**Locate:**
- `src/ui/RequestPane.tsx` — `sections` array defining tabs (line ~50), `tabIndex` state
- `src/ui/RequestPaneSections.tsx` (or inline) — each tab's render function
- `src/hooks/useRequestDraft.ts` — any new draft operations needed

**Follow:** Existing tabs: headers, params, body, auth, settings. Each is a `Section` in the `sections` array with a `name` and `render()` function.

**Implement:**
1. Add new `Section` to `sections` array with name and render function
2. Implement render function using existing UI primitives (`KeyValueSection`, `Select`, `Checkbox`, `Box`, `Text`)
3. If new tab needs draft mutations, add `DraftOp` variants to `useRequestDraft.ts`
4. Wire tab keyboard navigation — Tab key switches between tabs when in browse mode (handled by existing left/right arrow bindings in `useAppKeymap.ts` request-focus layer)

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
5. If hook needs to respond to keybindings, export callbacks that `useAppKeymap.ts` can bind to

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

**Follow:** Importers implement a `convert(source) → Collection` interface. Plugin registry pattern — register by format name, detect format from source content.

**Implement:**
1. Create `src/converters/yourformat/` directory
2. Export function that takes source content and returns `Collection`
3. Register in `src/app/import.ts`: `import { registerImporter } from "../converters/index.js"` + call `registerImporter("formatName", { detect, convert })`
4. Use existing `saveRequest` from filestore to write converted requests to disk

**Test:** Provide sample source file, call converter, assert `Collection` has expected structure. Use temp dirs for output.

**Verify:** `bun test && bun run lint && bun run typecheck`

---

## Add a new CLI flag

**Locate:**
- `src/app/commands/default.ts` — citty `defineCommand` for TUI mode (args + run handler)
- `src/app/commands/import.ts` — citty `defineCommand` for import subcommand
- `src/app/cli.ts` — main entry, defines subcommands
- `src/app/main.tsx` — `bootstrap()` function, wires flags into app

**Follow:** Flags are typed citty args. Each arg is a property in `args:` object with `type`, `alias`, `default`, `description`. Positional args use `type: "positional"` + `required: true`.

**Implement:**
1. Add arg to the appropriate `defineCommand()` command definition
2. For startup flags: pass to `bootstrap()` in command's `run()` handler
3. Wire into app via `BootstrapOptions` in `src/app/main.tsx`
4. If flag affects subcommand behavior: use in command's `run()` handler directly

**Test:** Add test in `tests/cli.test.ts`. Test command definition types and integration via `Bun.spawnSync`.

**Verify:** `bun test tests/cli.test.ts && bun run lint && bun run typecheck`
