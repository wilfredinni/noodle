# Changelog

All notable changes to Noodle are documented in this file.

## [Unreleased]

## [0.8.1] - 2026-08-25

Noodle 0.8.1 adds declarative response capture, so one request can pass typed response values to later requests in the same automation run without modifying collection or environment files.

### ✨ Features

- Add strict `capture` mappings to request YAML using the existing status, timing, case-insensitive header, and JSON body response expressions.
- Add one transient RunScope per `request run` or ordered `collection run`. Successful captures override same-named environment values, the latest successful capture wins, and all values disappear when the command returns.
- Add typed capture results to structured run output, capture summaries without raw values in human output, explicit missing and resolution failures, and continued collection execution after capture failure.
- Commit successful captures before assertions, including captures from HTTP error responses, so later requests can still use them when the producing request fails an assertion or HTTP status check.

### 🐞 Fixes

- Fail unresolved variables before sending even when no environment is selected, and preserve existing RunScope values after a failed recapture.
- Keep capture declarations and runtime capture state out of timeline history without persisting RunScope values or capture results to configuration, while redacting capture result values that match known environment, proxy, or TLS secrets.
- Preserve legal variable names such as `__proto__` as own capture and RunScope properties instead of silently dropping them.

### 📚 Documentation

- Document capture syntax, execution order, result shape, failure behavior, typed substitution, precedence, lifetime, selected-request ordering, security policy, and the TUI boundary across the README, `AGENTS.md`, and documentation site.
- Update `noodle-dev` with the shared response resolver, RunScope execution path, persistence boundary, and focused test locations.
- Update `noodle-use` with capture authoring, chaining, structured results, ordering, failure, and secret-handling guidance.
- Correct the public roadmap now that assertions, collection runs, and declarative request chaining have shipped.

## [0.8.0] - 2026-08-24

![Noodle Theme](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/noodle-claude.png)

Noodle 0.8.0 adds declarative response assertions to automation runs, with checks for status, timing, headers, and JSON body values stored beside each request. Collection runs can also select request IDs and folders, while the Claude Code palette expands the built-in theme catalog to 34 choices.

### ✨ Features

- Add strict `assert` blocks to request YAML with typed equality, numeric, containment, existence, type, null, and safe regular-expression operators. `request run` and `collection run` evaluate the checks, include structured results in JSON output, summarize them in human output, and fail when any assertion fails.
- Add optional request IDs and folder paths to `collection run`. Folder targets end in `/`, include nested requests, reject unknown targets before sending, and deduplicate overlapping selections while preserving collection order.
- Add the `claude-code` theme with the Claude Code dark palette, accessible contrast for status colors, and automatic availability in the theme picker.

### 📚 Documentation

- Refresh the README and project imagery around Noodle's files-first TUI, CLI, automation, and coding-agent workflow.
- Document response assertions, selective collection targets, and the 34-theme catalog across `AGENTS.md` and the documentation site, and update the current public roadmap now that assertions ship in v0.8.0.
- Update `noodle-dev` with the response-expression and assertion execution path, selective collection-run behavior, focused tests, and the 34-theme catalog.
- Update `noodle-use` with assertion authoring, result and secret-handling guidance, selective collection targets, and the `claude-code` configuration value.

## [0.7.7] - 2026-08-19

![Noodle Theme](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/noodle-noodle.png)

Noodle 0.7.7 gives the terminal client a Noodle theme drawn from the website palette and makes it the default for configurations without a saved theme. Agent skill installation also gains an explicit `--force` recovery path with backup-backed rollback if any target fails.

### ✨ Features

- Add the Noodle theme alongside the existing 32 themes and use it by default when no theme is saved, while preserving existing theme selections.
- Add `noodle agent install --force` for deliberately replacing detected unmanaged skill copies. The installer reports every conflict before changing anything, retains backups until the full installation succeeds, and rolls completed replacements back when a later target fails.

### 🔧 Refactors

- Share OpenTUI keymap test setup and cleanup, and replace fixed-delay waits with controlled timers or operation-based synchronization across UI tests.

### 📚 Documentation

- Update the README, `AGENTS.md`, and documentation site for the Noodle theme, 33-theme catalog, default-theme behavior, and explicit unmanaged-skill recovery.
- Update `noodle-dev` with the current theme catalog and rollback-safe `--force` installation architecture.
- Update `noodle-use` with the Noodle default theme and complete theme-name reference.
- Update `noodle-release` to require a release blog post based on the evidence-backed changelog section.

## [0.7.6] - 2026-08-18

Noodle 0.7.6 adds a built-in, network-free installer for the `noodle-use` agent skill and keeps managed installations synchronized when Noodle updates. It also makes runtime shortcut changes take effect immediately and stabilizes toast feedback.

### ✨ Features

- Add `noodle agent install` and the **Install Noodle skill** command-palette action, with an embedded, network-free `noodle-use` installer for Claude, Cursor, Codex, and OpenCode.
- Keep existing managed skill installations synchronized after standalone binary, Noodle-managed Homebrew, TUI, and curl-installer updates without failing a successful Noodle update when skill refresh needs a manual retry.

### 🐞 Fixes

- Apply saved shortcut changes immediately across keymap layers, show shortcut save and reset results as toast notifications, and prevent stale toast cleanup from disabling newer notifications.

### 📚 Documentation

- Document managed skill installation, automatic synchronization, JSON output, and the `npx skills` fallback across the README, `AGENTS.md`, in-app tips, and documentation site.
- Update `noodle-dev` with agent-skill installation and update-synchronization architecture.

## [0.7.5] - 2026-08-16

Noodle 0.7.5 adds first-class XML request bodies across editing, execution, history, and conversion workflows. It also makes invalid collection YAML repairable in the TUI, adds direct Settings and external-editor commands, and improves update visibility and empty-state interactions.

### ✨ Features

- Add an XML body type with Tree-sitter highlighting, variable completion, `application/xml` defaults, request history rendering, HAR and client-code support, and unchanged payload delivery after environment substitution.
- Import XML bodies from cURL, OpenAPI, Swagger, Postman, and Insomnia, and preserve XML examples and explicit MIME types in OpenAPI and Postman exports.
- Open collections with invalid request or folder YAML in a repair workspace with per-file drafts, inline validation, save and delete actions, and reload after successful repair.
- Automatically check for and install available updates when the TUI starts, show live update status in the header and About overlay, and make About links clickable.
- Detect supported desktop editors, select a preferred editor in Settings, and open the active collection or Noodle settings directory from the command palette.
- Add command-palette entries that open individual application and collection Settings categories directly, and add inline descriptions throughout OAuth 1.0a and OAuth 2.0 editors.
- Add reusable, keyboard and mouse accessible empty states for uninitialized or empty collections, environments, and cookie jars.

### 🐞 Fixes

- Keep request inspection visible in read-only browse mode and synchronize environment-editor names when environments change outside the editor.
- Handle MIME types with parameters consistently across imports and exports, preserve XML body intent for non-XML OpenAPI media types, and highlight XML request bodies in timeline details.
- Keep the command-palette first action visibly highlighted when keyboard navigation selects it.

### 🔧 Refactors

- Share action buttons, empty-state rendering, and the YAML file editor across overlays and invalid-collection repair, while making Tree-sitter highlighting awaitable and cancellation-safe.
- Remove fixed-delay UI test waits and make the OpenTUI test renderer fail on unexpected React diagnostics.

### 📚 Documentation

- Update the README, `AGENTS.md`, in-app tips, and documentation site for XML bodies, invalid-YAML repair, automatic update status, direct Settings navigation, and external-editor workflows.
- Update `noodle-dev` with XML editing and conversion, invalid-collection repair, external-editor, and TUI update-flow architecture.
- Update `noodle-use` with XML body schemas, examples, import and export coverage, and headless Linux secret-storage guidance.
- Update `noodle-release` with strict version normalization, evidence-backed public-surface review, per-skill audit decisions, release summaries, and complete release validation.

## [0.7.4] - 2026-08-14

Noodle 0.7.4 adds first-class OAuth 1.0a signing and OAuth 2.0 token workflows to request and folder authentication. It covers interactive browser authorization, secure token storage, converters, timeline safety, and request-specific execution without placing generated OAuth state in collection files.

### ✨ Features

- Add OAuth 1.0a request signing with HMAC-SHA1/256/512, RSA-SHA1/256/512, and PLAINTEXT methods; header, query, and URL-encoded body placement; optional body hashes; RSA keys from text or collection and home-relative files; and safe redirect behavior.
- Add OAuth 2.0 authorization code, client credentials, implicit, and password grants with S256 or plain PKCE, refresh handling, client secret or signed client assertion authentication, configurable token placement, and phase-specific additional parameters.
- Store OAuth 2 token responses in the OS credential vault, with a session-only in-memory fallback and visible warning when the vault is unavailable. Keep generated state, PKCE verifiers, authorization codes, and cached tokens out of request YAML.
- Add command-palette actions to fetch or authorize, copy, and clear the selected request's OAuth 2 token. TUI sends can open the system browser for authorization code and implicit flows, while non-interactive runs reuse or refresh stored credentials without opening a browser.
- Import OAuth 2.0 flows from OpenAPI and import OAuth 1.0a and OAuth 2.0 configuration from Postman and Insomnia. Export OAuth 2.0 schemes to OpenAPI and both OAuth configurations to Postman without cached tokens or generated signing state.
- Add OAuth authentication events to the live network trace, mask OAuth credentials and generated authorization material in timeline snapshots, and exclude OAuth requests from generated client code because their signatures or tokens depend on request-specific secure state.

### 🐞 Fixes

- Re-sign OAuth 1.0a requests on same-origin redirects, strip OAuth credentials on origin changes, reject PLAINTEXT signing over non-loopback HTTP, and avoid forwarding a signed URL-encoded body across a 307 redirect.
- Prevent duplicate concurrent OAuth 2 token acquisition, keep abortable requests from sharing acquisition work, rotate refresh tokens safely, and strip header or query tokens before cross-origin redirects.

### 🔧 Refactors

- Centralize authentication defaults, strict YAML parsing and serialization, editor rows, substitution, and effective request or folder auth handling across all supported auth types.

### 📚 Documentation

- Update the README and `AGENTS.md` with OAuth 1.0a and OAuth 2.0 authoring, secure token behavior, command-palette actions, converter coverage, and code-generation restrictions.
- Update `noodle-dev` with the shared authentication architecture, OAuth execution paths, extension recipe, and focused test guidance.
- Update `noodle-use` with OAuth schemas, secure authoring guidance, browser and automation constraints, and import or export coverage.
- Document OAuth configuration, TUI token workflows, converters, environment substitution, network events, and agent guidance on the documentation site.

## [0.7.3] - 2026-08-14

![Noodle aws sig](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/cookie-tab.png)

Noodle 0.7.3 adds a persistent cookie jar to each collection, including automatic cookie handling across redirects, collection and request controls, a dedicated TUI workspace, and automation commands. Cookie storage prefers OS-vault-backed encryption, exposes clear health warnings, and preserves unreadable state before an explicit reset.

### ✨ Features

- Add a per-collection cookie jar that captures `Set-Cookie` headers, sends matching cookies on later requests and redirect hops, and lets user-authored `Cookie` values override jar values with the same name.
- Add a **Cookies** workspace for filtering, inspecting, expanding, adding, editing, copying, and deleting cookies by domain, plus storage retry and reset controls. Add configurable cookie shortcuts, a Cookies response tab for sent and received cookies, and a collection Settings toggle.
- Add `sendCookies: false` for suppressing jar cookies on one request while still capturing its response cookies, and honor the collection and request controls in TUI and automation runs.
- Add `noodle cookie list` and `noodle cookie clear` for inspecting jar contents and storage health or clearing the jar. Unreadable storage is skipped during runs and backed up before an explicit clear resets it.
- Store jars under the Noodle config directory with an OS-vault-backed encryption key. When the vault is unavailable, use a mode-`0600` plaintext file and report a persistent warning.

### 🐞 Fixes

- Capture response cookies from every NTLM handshake response and continue capturing them when sending jar cookies is disabled for the request.
- Keep concurrent jar handles synchronized before sends and writes, flush pending cookie changes during shutdown, and surface persistence failures instead of silently replacing unreadable state.
- Keep cookie forms, filtering, selection, expansion, and modal keyboard handling aligned with the active cookie and current view.

### 📚 Documentation

- Update the README, `AGENTS.md`, and in-app tips with cookie storage, recovery, request controls, response inspection, and current TUI shortcuts.
- Update `noodle-dev` with the cookie persistence, request lifecycle, UI, keymap, automation, and test architecture.
- Update `noodle-use` with cookie settings, request schema, keybindings, automation commands, storage diagnostics, and recovery guidance.
- Document cookie jar behavior, controls, storage security, CLI commands, and agent workflows on the documentation site.

## [0.7.2] - 2026-08-12

![Noodle aws sig](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/aws-auth.png)

Noodle 0.7.2 adds NTLMv2 and AWS Signature Version 4 request authentication, with clear controls for their required credentials and secure environment-variable workflows. It also preserves those configurations in supported imports and exports while keeping connection-bound and signed requests safe across redirects.

### ✨ Features

- Add connection-bound server NTLMv2 authentication for requests and folder overrides, with optional domain and workstation fields, secure password-variable support, and raw socket handling for the server challenge exchange.
- Add AWS SigV4 authentication for requests and folder overrides, including access key, secret key, region, service, optional session token, and signing for text, JSON, URL-encoded, and binary request bodies. Multipart bodies are rejected because their generated bytes cannot be signed reliably in advance.
- Import NTLM authentication from OpenAPI, Postman, and Insomnia sources; round-trip NTLM through OpenAPI and Postman, and AWS SigV4 through Postman. OpenAPI exports represent both as HTTP security schemes.
- Add required markers and inline descriptions to authentication controls, and show NTLM and SigV4 authentication safely in request summaries and response history.

### 🐞 Fixes

- Keep literal authentication secrets redacted in timeline snapshots, while resolving and redacting non-secret variable references consistently for all authentication types.
- Keep NTLM and SigV4 credentials out of cross-origin redirects, clear stale AWS signing headers, and handle identity and `x-gzip` content encoding in NTLM connections.
- Preserve the live value while editing authentication fields and scroll the active request or folder field into view in long panes.

### 📚 Documentation

- Refresh the README around Noodle's repository-first workflow, concise installation paths, import/export, automation, and agent use.
- Update `AGENTS.md` with the NTLMv2 and AWS SigV4 auth model and client-code-generation limitation.
- Update `noodle-dev` with the authentication implementation and test workflow for static headers, handshakes, and request signing.
- Update `noodle-use` with NTLMv2 and AWS SigV4 authoring, import/export, secret-handling, and code-generation guidance.
- Document NTLMv2 and AWS SigV4 setup, format constraints, conversion coverage, and agent guidance on the documentation site.

## [0.7.1] - 2026-08-11

![Noodle secrets](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/secrets.png)

Noodle 0.7.1 adds TLS and mutual-TLS controls plus OS-backed secret storage for environment values, proxy authentication, and encrypted client-key passphrases. It also hardens settings validation and redirects, while making secret-aware request history and automation practical from both the TUI and CLI.

### ⚠️ Breaking Changes

- Custom proxy URLs can no longer contain credentials or `$VARNAME` placeholders. Remove user information from `proxy.url`, then re-enter the proxy username and optional password in **Settings**; Noodle stores them in the OS credential vault and persists only `auth: true` beside the credential-free URL.
- Invalid `settings.yml` files no longer silently fall back to defaults. Unknown keys, malformed YAML, wrong field types, and invalid proxy or TLS blocks now stop collection opening, auditing, and automation until corrected.
- Redirect handling is intentionally stricter: Noodle rejects HTTPS-to-HTTP downgrades and strips authorization, proxy authorization, cookies, `Host`, and header API-key credentials before following a cross-origin redirect.

### ✨ Features

- Add collection TLS settings for certificate verification, custom PEM CA bundles, and exact-host PEM client certificates, plus request-level verification overrides and `--insecure` for one TUI or automation invocation.
- Add secure environment declarations with `# @secret NAME` plus a blank placeholder; resolve them from the OS credential vault or a same-named process variable, mask them in the environment editor, and redact them from persisted request snapshots, request search, code generation, and exports.
- Add `noodle secret set`, `list`, and `delete` automation commands, including masked terminal input, `--stdin`, JSON envelopes, and secret-source status.
- Store proxy credentials and encrypted mTLS private-key passphrases in the OS credential vault while keeping only non-secret metadata in global or collection configuration.

### 🐞 Fixes

- Keep server response status text, headers, and bodies intact instead of redacting values that happen to match a request secret, while continuing to redact known secrets from request snapshots, network messages, and errors.
- Make environment-secret toggling, reveal, cloning, rollback, reserved `_color` handling, and customizable secret keybindings reliable.
- Require a username when proxy authentication is enabled, preserve literal dollar signs in credentials, and keep failed settings-secret transactions from leaving configuration and credential storage out of sync.
- Make collection settings writes atomic, preserve concurrent Settings edits, reject malformed settings consistently, and keep click-to-commit behavior reliable across request and settings fields.

### 🔧 Refactors

- Give collections a generated `collection_id` so credential-vault entries remain stable when a collection moves, and route proxy and TLS secrets through shared transactional storage helpers.
- Centralize TLS policy resolution, redirect credential stripping, and request execution options across TUI and automation sends.

### 📚 Documentation

- Document TLS/mTLS, secure environment values, proxy credential migration, strict settings validation, redirect hardening, and the new CLI flags and secret commands across the README, SECURITY.md, AGENTS.md, in-app tips, and the documentation site.
- Update `noodle-dev` with the credential-vault, TLS, settings-persistence, environment-secret, and timeline-redaction architecture.
- Update `noodle-use` with secure environment workflows, secret automation commands, proxy/TLS schemas, and current timeline security guidance.

## [0.7.0] - 2026-08-09

Noodle adds a unified Settings workspace for global preferences and collection configuration, including flexible proxy routing and controllable response-history retention. The release also makes collection metadata more visible and strengthens key handling, settings navigation, and concurrent timeline persistence.

### ✨ Features

- Add the Settings workspace, available with `F4` or **Open Settings** in the command palette, for global appearance, registered collections, keyboard shortcuts, and proxy preferences.
- Add system, direct, and custom proxy policies with collection-level overrides, environment-variable proxy credentials, bypass rules, and `--noproxy` for TUI, `collection run`, and `request run` invocations.
- Add collection names, descriptions, and configurable `timeline_max_entries` retention in `settings.yml`; response history keeps 50 entries per request by default and accepts `0` to disable recording.

### 🐞 Fixes

- Prevent global shortcuts from firing while text inputs, dialog fields, and other active edit contexts have focus.
- Serialize concurrent response-history saves and pruning so timeline files and large-body sidecars remain consistent.
- Restore the appropriate focus when leaving Settings and keep collection lists, proxy fields, and keyboard hints aligned with the active settings scope.

### 🔧 Refactors

- Centralize keybinding definitions and their contextual hints across the keymap, settings editor, command palette, and help surfaces.
- Move collection settings persistence behind a serialized save queue and share collection-path classification across startup and workspace management.

### 📚 Documentation

- Document Settings, proxy precedence, collection metadata, timeline retention, and current shortcuts in the README, AGENTS.md, in-app tips, and site references.
- Update `noodle-dev` with Settings persistence and proxy configuration architecture.
- Update `noodle-use` with the `settings.yml` proxy schema and global proxy configuration.

## [0.6.2] - 2026-08-07

![Export collection overlay](https://raw.githubusercontent.com/wilfredinni/noodle/main/assets/import-overlay.png)

Noodle now brings collection import and export into the terminal UI, so a collection can move between supported formats without leaving the workspace. Home-relative upload paths and editor state are more dependable, with safer exports and more stable completion, focus, and import behavior.

### ✨ Features

- Add **Import Collection** to the command palette, with format detection for OpenAPI, Swagger, Postman, and Insomnia and a choice to create a new collection or import into the current one.
- Add **Export Collection** to the command palette, with OpenAPI and Postman choices, target previews, and automatic suffixes for occupied Postman output directories.
- Add quoted `@/` home-directory shorthand and TUI completion for multipart file entries and binary upload paths; expand it only when reading files or producing output artifacts.
- Preserve request and response JSON fold state when switching between stacked and side-by-side layouts.

### 🐞 Fixes

- Remove a partially written collection when an import fails, and prevent imports into the current collection while unsaved changes exist.
- Keep completion popups mouse-accessible and maintain focused overlay input and filesystem-error feedback during collection transfer.
- Preserve `@/` file paths through HAR generation and expand them in Postman bundles so exported file requests remain runnable.

### 🔧 Refactors

- Centralize home-relative path expansion and collapse for upload, export, and TUI path-completion boundaries.

### 📚 Documentation

- Document TUI collection import/export and `@/` file-path behavior in the README, AGENTS.md, in-app tips, and site guides.
- Update `noodle-dev` with collection-transfer architecture and home-relative path boundaries.
- Update `noodle-use` with portable upload-path and export-disclosure guidance.

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

[Unreleased]: https://github.com/wilfredinni/noodle/compare/v0.7.5...HEAD
[0.7.5]: https://github.com/wilfredinni/noodle/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/wilfredinni/noodle/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/wilfredinni/noodle/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/wilfredinni/noodle/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/wilfredinni/noodle/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/wilfredinni/noodle/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/wilfredinni/noodle/compare/v0.6.1...v0.6.2
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
