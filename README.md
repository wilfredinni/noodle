<h1 align="center">Noodle</h1>

<p align="center"><strong>The repository is the workspace</strong></p>

<p align="center">Open-source terminal REST client</p>

<p align="center">
  Write, send, inspect, and automate HTTP requests from readable files without
  leaving your terminal. Keep every collection versioned beside the code it
  exercises, ready for the TUI, CLI, scripts, and coding agents.
</p>

<p align="center">
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/"><strong>Get started</strong></a> ·
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="https://github.com/sponsors/wilfredinni">Sponsor</a>
</p>

![Noodle terminal interface](assets/noodle.png)

## Install

Install from [Homebrew core](https://formulae.brew.sh/formula/noodle):

```bash
brew install noodle
```

Or use the standalone installer:

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

Prebuilt binaries support macOS and Linux (glibc) on arm64 and x86_64, plus Windows x64
in beta.
See [installation options](https://noodlerest.dev/docs/getting-started/installation/)
for Homebrew and source builds.

Run `noodle agent install` after a brew upgrade to refresh an installed skill. If you used `wilfredinni/noodle`,
follow the [tap migration instructions](https://noodlerest.dev/docs/getting-started/installation/#migrate-from-the-old-tap).

### Windows x64 (beta)

Windows x64 binaries are included from v0.9.7. Install from PowerShell:

```powershell
irm https://noodlerest.dev/install.ps1 | iex
```

The installer verifies the release checksum, installs to
`%LOCALAPPDATA%\Programs\Noodle\noodle.exe`, and updates your user PATH.

Windows executables are unsigned; browser downloads may trigger Windows trust
prompts. Ordinary-account and interactive terminal testing remains pending.
The [v0.10.1 Defender report](https://github.com/noodle-rest/noodle/issues/279)
remains unresolved; it is not a confirmed false positive or evidence about every
later build. See the [Windows support statement](SECURITY.md#windows-support).
For prerelease testing, manually dispatched CI runs provide a Windows beta ZIP
containing `noodle.exe`, checksums, and build information.

### GitHub Actions

After checking out your collection, install Noodle and run it in a separate step:

```yaml
- uses: noodle-rest/setup-noodle@v1
  with:
    version: v0.10.4
- run: noodle collection run ./api --reporter junit --output results.xml
```

`@v1` selects the setup action. The required `version` selects the exact Noodle
CLI release. The action verifies the binary's SHA-256 checksum before adding it
to the runner's PATH. See [setup-noodle](https://github.com/noodle-rest/setup-noodle)
and the [CI workflow with report upload](https://noodlerest.dev/docs/guides/automation/#run-in-github-actions-ci).

## Quick start

Follow the [quick start guide](https://noodlerest.dev/docs/getting-started/quick-start/)
to create a collection, send your first request, and inspect the response.

## Features

- 📁 **[File-based collections](https://noodlerest.dev/docs/guides/collections/):**
  Keep requests in YAML, organize them into folders, and version them with Git.
- ✏️ **[Request editor](https://noodlerest.dev/docs/guides/using-the-request-pane/):**
  Edit URLs, parameters, headers, JSON, XML, forms, and file uploads in the terminal.
- 🔍 **[Response inspection](https://noodlerest.dev/docs/guides/using-the-response-pane/):**
  Explore JSON and XML in Source or Visual views, filter JSON with JSONPath,
  and inspect headers and network traces.
- 📥 **[Images and downloads](https://noodlerest.dev/docs/guides/using-the-response-pane/#images-and-binary-responses):**
  Preview supported images, save response files, and open them in their default app.
- 🗝️ **[Environments and secrets](https://noodlerest.dev/docs/guides/using-environments/):**
  Switch between environments, reuse variables, and store secrets in the OS vault.
- 🔐 **[Authentication](https://noodlerest.dev/docs/guides/authentication/):**
  Use bearer tokens, basic auth, API keys, OAuth 1.0a, OAuth 2.0, NTLMv2, and AWS SigV4.
- 🛡️ **[Proxies and TLS](https://noodlerest.dev/docs/guides/settings/):**
  Configure proxy policies, custom certificate authorities, and mutual TLS.
- 🧪 **[Response assertions](https://noodlerest.dev/docs/guides/automation/#put-success-criteria-beside-the-request):**
  Check status, timing, headers, and JSON values in the TUI or CI.
- ✅ **[Scripted tests](https://noodlerest.dev/docs/guides/scripted-tests/):**
  Check responses with synchronous or async tests, JSON Schema draft-07,
  property, length, type, and partial-object matchers.
- 🎯 **[Response captures](https://noodlerest.dev/docs/guides/automation/#pass-response-values-forward):**
  Pass response values to later requests or save them to an environment or secret.
- 📜 **[Scripting](https://noodlerest.dev/docs/guides/pre-request-scripting/):**
  Prepare requests and process responses with sandboxed JavaScript.
  Share inline scripts or external JavaScript files across collections and folders.
  Pre scripts, post scripts, and tests each run collection → folders → request,
  so request-specific successful writes override inherited values.
  Author Pre Script, Post Script, and Tests in the TUI with completion, diagnostics,
  folding, and formatting; browse logs in Console.
- 🎲 **[Body templates](https://noodlerest.dev/docs/guides/using-the-request-pane/#random-and-time-body-values):**
  Generate test data and timestamps with `$random` and `$time` placeholders.
- ⚡ **[Collection runner and automation](https://noodlerest.dev/docs/guides/automation/):**
  Run requests or folders with tag filters, fail-fast behavior, delays, CSV/JSON
  iteration data, and JSON results. Save collection reports with
  `--json --output results.json` or `--reporter junit --output results.xml`.
  See the [automation contract and CI example](.agents/skills/noodle-use/workflows/automation.md#collection-report-files).
  Optional saved setup and teardown requests
  surround each run or data row; configure them in Collection Settings > General.
  Empty selections send nothing, and cancellation skips teardown.
  Interrupt CLI collection runs with Ctrl+C to
  retain completed results and inspect what was cancelled or never started.
  In the TUI, inspect completed Results and Console while later requests run;
  press `s` or click Stop to cancel, and use F5 to return after browsing elsewhere.
  Try the [local data-run example](dev/collection/scripting-data).
- 🕘 **[Response history](https://noodlerest.dev/docs/reference/timeline/) and
  [cookies](https://noodlerest.dev/docs/guides/settings/#general):**
  Revisit past responses and manage a cookie jar for each collection.
- 🎨 **[Themes](https://noodlerest.dev/docs/reference/theming/) and
  [keybindings](https://noodlerest.dev/docs/reference/keybindings/):**
  Follow your terminal palette or choose a theme, and customize your shortcuts.
- 🔄 **[Import](https://noodlerest.dev/docs/import/import/) and
  [export](https://noodlerest.dev/docs/import/export/):**
  Bring OpenAPI, Swagger, Postman, and Insomnia collections into Noodle;
  preserve compatible Postman and Insomnia scripts without translating foreign APIs.
  Imports that retain scripts or tests require a new collection.
  Export to OpenAPI or Postman.
- 🤖 **[AI agent skills](https://noodlerest.dev/docs/guides/ai-agent-skills/):**
  Install the Noodle skill with `noodle agent install` so coding agents can
  create, maintain, and run collections.

## Documentation

- [All guides and references](https://noodlerest.dev/docs/)
- [CLI commands](https://noodlerest.dev/docs/getting-started/cli/)
- [Collection format](https://noodlerest.dev/docs/reference/collection-format/)
- [Script scopes and inheritance](https://noodlerest.dev/docs/guides/pre-request-scripting/#inherited-scripts-and-tests)
- [External JavaScript files](https://noodlerest.dev/docs/guides/pre-request-scripting/#external-javascript-files)
- [Script cookbook](https://noodlerest.dev/docs/guides/script-cookbook/)
- [Changelog](CHANGELOG.md)

## Contributing

Noodle is built with Bun, TypeScript, React, and OpenTUI.

```bash
bun install
bun run dev
```

This starts the local HTTP, HTTPS, authentication, and proxy services and opens
the development collection in `dev/collection/`. Run `bun run dev:server` for
services alone, or `bun run dev:check` to validate the local scenarios. See the
[development guide](dev/README.md) for suites and fixture credentials.

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and test commands.

## Sponsor

Noodle is free and open source. If it saves you time, you can
[sponsor its continued development](https://github.com/sponsors/wilfredinni).
Sponsorship supports maintenance, bug fixes, documentation, and platform testing.

## License

[Apache-2.0](LICENSE).
