# Changelog

All notable changes to Noodle are documented in this file.

## [Unreleased]

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

[Unreleased]: https://github.com/wilfredinni/noodle/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/wilfredinni/noodle/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/wilfredinni/noodle/compare/v0.4.8...v0.5.0
[0.4.8]: https://github.com/wilfredinni/noodle/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/wilfredinni/noodle/compare/v0.4.6...v0.4.7
