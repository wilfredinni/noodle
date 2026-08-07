# Changelog

All notable changes to Noodle are documented in this file.

## [Unreleased]

## [0.6.1] - 2026-08-06

![path_params](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/response_folding.png)

Noodle makes environment switching more direct with searchable selection, in-place context, and a dedicated creation flow. Response and request JSON handling gains foldable, scrollable rendering and source-accurate validation, alongside focused interaction and layout fixes.

### ✨ Features

- Add a searchable environment picker on `e`, move the full environment editor to `F3`, and show clickable collection and environment context in the header.
- Add a New Environment form for choosing a validated name and optional color from the environment editor.
- Render response bodies in the read-only code editor with JSON folding, original source line numbers, a themed scrollbar, and full-source copying across folded rows.
- Report request JSON validation failures at their source line and column, including errors inside substituted environment-variable values.
- Add themed scrollbars to overflowing response headers, network traces, timelines, and request tabs.

### 🐞 Fixes

- Keep response-body layout, scrolling, folding gutters, and short JSON width correct in stacked and constrained panes.
- Keep mouse selections extending beyond the editor viewport, including reverse drags, without shifting the cursor or losing folded source text.
- Prevent jump mode from opening while a JSONPath query is active, and return filtered response bodies to the top when the query changes.
- Truncate long collection paths safely in the switcher and keep the expand shortcut visible in the status bar.

### 🔧 Refactors

- Track the active environment by name with an explicit display status, and share code-editor gutter synchronization across request and response surfaces.

### 📚 Documentation

- Update AGENTS.md, in-app tips, and the site guides for environment selection and creation, header context, response folding, and current shortcuts.
- Update `noodle-dev` with the current response editor, JSON validation, environment overlay, and keymap architecture.
- Update `noodle-use` with the separate environment-picker and environment-editor keybinding IDs.

## [0.6.0] - 2026-08-04

Noodle now moves collections in both directions: import OpenAPI, Swagger, Postman, and Insomnia sources, then export portable OpenAPI or Postman output. The conversion path preserves more request detail while keeping generated filessafe to inspect and share.

### ✨ Features

- Import Swagger 2.0 specifications and Insomnia v4/v5 JSON exports with `noodle import`, including supported requests, folders, environments, parameters, bodies, and auth.
- Export a collection as an OpenAPI 3.0.3 document or a Postman Collection v2.1 bundle with `noodle export`.
- Include enabled nonempty environment `base_url` values as OpenAPI servers, and create redacted Postman environment files alongside each exported bundle.

### 🐞 Fixes

- Preserve repeated query parameters and filter protected headers when exporting OpenAPI; only write operation-level servers when they differ from document servers.
- Preserve folder-level `none` authentication in Postman exports.
- Infer path parameters from imported URLs, distinguish them from query parameters, and preserve raw JSON number literals during formatting and OpenAPI export.
- Keep code-editor highlighting aligned for emoji and other wide characters, and prevent duplicate body-editor interactions.

### 🔧 Refactors

- Share normalized OpenAPI parsing and YAML serialization across import and export formats.

### 📚 Documentation

- Document supported conversion formats and export output in the README, AGENTS.md, and site CLI and conversion guides.
- Update `noodle-dev` with the current converter and export architecture.
- Update `noodle-use` to use the supported import and export CLI workflows.

## [0.5.7] - 2026-08-02

Collections can now be formatted from the automation CLI, giving imported and existing request files canonical YAML and readable JSON bodies without losing large integer literals. Environment editing, URL path handling, and focused UI interactions are also more reliable in everyday use.

### ✨ Features

- Add `noodle collection format <path>` to canonicalize every request file and pretty-print valid JSON bodies; OpenAPI and Postman imports now apply the same formatting automatically.
- Make **Import cURL Request** available from the command palette while a folder is selected.

### 🐞 Fixes

- Preserve large JSON integer literals when formatting request or response JSON.
- Let right-clicking an environment select it and show its save, create, clone, and delete actions.
- Keep rapid or repeated environment selections from applying stale data, and commit active request, folder, and environment edits when users click into another interaction.
- Distinguish query-string values from `:name` URL path tokens, keep the Path tab rendering after tab switches, and prevent body edits while browsing or while another overlay is open.
- Keep sidebar mouse clicks from stealing scroll focus and focus environment context-menu actions on the targeted environment.

### 🔧 Refactors

- Narrow command-palette actions to request, collection, and environment workflows; response actions remain available in the response pane.

### 📚 Documentation

- Document collection formatting and import output in the README, AGENTS.md, and CLI and collection site guides.
- Update `noodle-dev` with collection-formatting behavior and precision requirements.
- Update `noodle-use` with the collection formatting command and automatic import formatting.
- Correct response-pane and environment-context-menu guidance in the site docs.

## [0.5.6] - 2026-08-02

![path_params](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/path.png)

Path parameters, live network traces, mouse-first controls, and faster focus
jumps make request work more direct, while stronger draft safety and improved
theme contrast keep the workflow dependable.

### ✨ Features

- Add first-class URL path parameters: use `:name` tokens, edit their required values in the Path tab, and serialize them as `path_params`. OpenAPI and Postman imports preserve supported path parameters.
- Add a Network response tab that streams request activity, redirects, responses, and failures while sending, and retains the trace in response history.
- Add mouse support throughout the TUI for pane focus, tabs, editable fields, overlays, scrolling, and sidebar context menus.
- Add a clickable Send control to the URL bar, with an in-place sending indicator.
- Let the New Request overlay create a request directly inside a selected folder.
- Extend jump mode to folder tabs and the environment editor, including direct targets for environment variables, name, and color.

### 🐞 Fixes

- Prevent new requests and renamed requests from overwriting an existing file.
- Normalize scheme-less request URLs before sending.
- Warn before reloading a collection with unsaved changes, and preserve dirty drafts through request moves, saves, reloads, and Undo All.
- Keep the URL bar, query and path parameters, and clicked key/value subfields synchronized while editing or switching requests.
- Prevent duplicate saves and keep Select and overlay interactions confined to the active edit context.
- Keep highlighted picker items visible when a picker opens.
- Stabilize timeline-detail body layout in narrow terminals.
- Improve subtle-border contrast in the Ayu, Monokai, Solarized, Material, Palenight, Vercel, and Zenburn themes.

### 🔧 Refactors

- Centralize URL normalization, path-token parsing and interpolation, and path-parameter synchronization across creation, editing, import, and sending.
- Consolidate network-event capture behind a focused module.
- Standardize UI interaction state and regression coverage across panes, overlays, selectors, and editors.
- Unify confirmation dialogs and Escape-close behavior through shared overlay state and keyboard interceptors.

### 📚 Documentation

- Document path-parameter YAML, network traces, and jump targets for users.
- Update `noodle-dev` with path-parameter implementation guidance and a regression-test-first bug-fix workflow.
- Update `noodle-use` with the `path_params` schema and constraints.
- Update `noodle-release` to require a concise release summary beneath every version heading.

## [0.5.5] - 2026-07-29

### ✨ Features

- Keep JSON request bodies in the full inline editor while browsing and editing, with line numbers, folding, variable completion, and validation.
- Make request and response tab strips scrollable and automatically reveal the active tab in narrow terminals.
- Rename the command-palette update action to **Update Noodle**.

### 🐞 Fixes

- Return Escape from the JSON body editor to its body-type selector without discarding the live draft.
- Make code-editor undo and redo, syntax-highlight fallbacks, and Unicode display offsets reliable.
- Harden update checks against stalled requests, transient failures, and stale cached metadata.

### 🔧 Refactors

- Split editor, keymap, update, draft, and overlay logic into focused modules with dedicated tests.

## [0.5.4] - 2026-07-27

### 🐞 Fixes

- Gate jump-mode hints on the focused pane and selected request so badges only appear on active, visible panes.
- Force-remount the request/response split when toggling layout so the layout change takes effect immediately.
- Compute contrast-on-secondary color from relative luminance for consistent badge readability across all themes.

### 🔧 Refactors

- Render jump-mode letter-hint badges directly in owning components instead of a separate overlay, removing the dark backdrop and deduplicating hint sources.

## [0.5.3] - 2026-07-26

### ✨ Features

- Add automatic update checks backed by the Noodle update manifest, with an in-app notification when a newer standalone or Homebrew release is available.
- Add `noodle update` for manual self-updates. Standalone binaries verify the downloaded SHA-256 checksum; Homebrew installs delegate to `brew upgrade noodle`.
- Make header and status-bar shortcut hints contextual to the active pane, mode, and response tab.

### 🐞 Fixes

- Keep update checks and installs reliable across stale caches, transient manifest failures, Homebrew symlinks on Apple Silicon and Intel macOS, and development Bun runtimes.
- Prevent update, overlay, focus, and response-filter state from leaking or displaying stale UI after navigation.
- Improve theme contrast, narrow-layout rendering, response status display, and timeline-detail formatting.

### 🔧 Refactors

- Consolidate focus handling, contextual keybinding hints, and update-release discovery.

## [0.5.2] - 2026-07-25

![timeline](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/jumpmode.png)

### ✨ Features

- Jump mode: press `g` to show letter hints on focusable elements; press a letter to jump focus or `Esc` to dismiss. Badges render over a dark backdrop outside the pane layout.
- Request finder (Ctrl+F) now includes folders in search results alongside requests, with fuzzy matching on name and ID fields.
- Export timeline entries: copy request headers, copy response body, and export the full YAML entry from the timeline detail overlay.
- Footer branding: the status bar shows the Noodle version.
- Website and docs links in the About overlay.

### 🐞 Fixes

- Preserve disabled query parameters alongside enabled params with the same name, and keep them in sync with the URL bar.
- Enable two-way binding for URL query parameters so the URL bar and params tab stay consistent.
- Gate the variable-completion popup on input focus, preventing unintended triggers when the input is not focused.
- Handle narrow terminal widths in the footer status bar by truncating shortcut hints while keeping the branding visible.
- Show the send animation on all response tabs and truncate the status message at 13 characters to prevent overflow.
- Restrict request-finder fuzzy matching to name and ID fields only.
- Use a fixed height in the YAML editor overlay to prevent layout shifts.
- Improve overlay text layout and styling consistency across the TUI.
- Allow tab switching while browsing in jump mode, and align badges correctly in read-only modes.

### 🔧 Refactors

- Replace pane title text with badges and move app branding from the header to the footer status bar.
- Simplify the status bar keyboard hints to show only the most-used actions.
- Standardize auto-height overlay layouts and timeline detail tab rendering.
- Remove collection name display from the header bar.
- Refine key-value table row striping with primary-colored key columns and empty-row placeholders.

## [0.5.1] - 2026-07-22

### ✨ Features

- Preserve complete large request and response bodies in compressed timeline sidecars, so timeline detail views can load the full exchange instead of a truncated snapshot.
- Inspect, copy, or save a timeline request or response body from its detail view, including sidecar-backed bodies.

### 🐞 Fixes

- Keep generated YAML valid when long or multiline parameter, form, folder, and authentication values wrap.
- Report all invalid request and folder YAML files found while loading a collection with clear file and location context.
- Keep full timeline bodies available through retention and clearing, and identify snapshots that were truncated by older Noodle versions.
- Keep large response bodies, Unicode-safe JSON syntax highlighting, tail rendering, scrolling, and Home/End navigation reliable across the response, timeline, help, and environment views.
- Require an explicit action before rendering a response or timeline body larger than 5 MB, while retaining copy and export access.
- Restore New Request input focus, prevent modal and form focus leaks, and keep Help overlay scrolling within the overlay.
- Preserve Select, response-header, and timeline layouts at narrow widths; show response status in a readable colored badge; and keep long URLs and request names readable in request and timeline views.
- Handle CRLF line endings and constrained layout correctly in generated-code previews.
- Improve Synthwave84 unfocused-border contrast and overlay shortcut-key colors.

### 🔧 Refactors

- Virtualize JSON response rendering and consolidate response-header presentation.

### 📚 Documentation

- Document compressed timeline body sidecars and their storage implications for users and agents.

## [0.5.0] - 2026-07-19

![timeline](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/findrequest.png)

### ✨ Features

- Find requests from anywhere in the TUI with a fuzzy search that also matches resolved environment-variable URLs.
- Import a cURL command into a new request from the command palette, including headers, authentication, query parameters, bodies, forms, uploads, redirects, and timeouts supported by the importer.
- Generate client code for the selected request from the command palette, choosing a language and supported library, with optional environment-variable interpolation.
- Filter JSON response bodies with JSONPath from the response pane or command palette.

### 🐞 Fixes

- Preserve explicit redirect limits and correctly import inline binary data, query parameters, Authorization headers, JSON bodies containing equals signs, and repeated Cookie headers from cURL commands.
- Display a clear error when a response body is not valid JSON and prevent opening JSONPath filtering when it cannot run.
- Include inline URL query parameters and correctly represent form-data bodies in generated code.
- Keep response metadata visible at the bottom of the response pane and position selection menus correctly in overlays.
- Prevent keyboard events from modal overlays leaking into underlying panes, including Generate Code and Timeline Detail, while preserving editable fields and Select menus.
- Keep large generated-code and YAML editor content scrollable inside fixed overlays while preserving consistent top and bottom spacing.
- Keep the URL bar method selector wide enough to show complete method names and its dropdown indicator after opening.

### 🔧 Refactors

- Generate snippets through HAR with `httpsnippet`, replacing the previous code-generation converter.
- Separate JSON response parsing from JSONPath evaluation.

### 📚 Documentation

- Add contributor guidelines, security reporting guidance, and GitHub issue, discussion, and pull-request templates.
- Document modal keyboard-isolation conventions and regression-test patterns for future overlay work.

## [0.4.8] - 2026-07-17

### Features

- Fall back to the current directory when no existing registered collection is available at startup.

### Fixes

- Explain clearly when a workspace audit has no registered collections.

### Refactors

- Generate tagged release notes from `CHANGELOG.md` and validate them during release checks.

### Documentation

- Document the current-directory startup fallback in the README and CLI reference.

## [0.4.7] - 2026-07-17

### Features

- Automatically run `brew upgrade noodle` when updating a Homebrew installation.
- Cache update checks for one hour and support GitHub tokens for release discovery.
- Verify downloaded update binaries with SHA256 checksums and compare versions semantically.

### Fixes

- Stage downloaded binaries in the target directory before replacing the installed executable.
- Harden installer cleanup and Homebrew detection for user-local Linuxbrew installations.
- Publish release checksum assets with the platform binaries.

### Refactors

- Add reusable CI and release workflows, release preparation tooling, and release validation.
- Add pre-commit and pre-push quality checks.
- Expand installation and update coverage, including filesystem isolation for editor tests.

[Unreleased]: https://github.com/wilfredinni/noodle/compare/v0.6.1...HEAD
[0.6.1]: https://github.com/wilfredinni/noodle/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/wilfredinni/noodle/compare/v0.5.7...v0.6.0
[0.5.7]: https://github.com/wilfredinni/noodle/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/wilfredinni/noodle/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/wilfredinni/noodle/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/wilfredinni/noodle/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/wilfredinni/noodle/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/wilfredinni/noodle/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/wilfredinni/noodle/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/wilfredinni/noodle/compare/v0.4.8...v0.5.0
[0.4.8]: https://github.com/wilfredinni/noodle/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/wilfredinni/noodle/compare/v0.4.6...v0.4.7
