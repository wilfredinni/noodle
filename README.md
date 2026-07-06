# <img src="assets/logo.png" data-canonical-src="/logo.png" width="32" height="32" /> noodle

A delicious REST client that lives in your terminal.

Noodle is an HTTP client. As a TUI application, it can be used over SSH and enables efficient keyboard-centric workflows. Your requests are stored locally as simple YAML files, easy to read, easy to version control.

![noodle](assets/noodle-catppuccin.png)

<p align="center">
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/changelog/">Changelog</a> ·
  <a href="https://noodlerest.dev/roadmap/">Roadmap</a> ·
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/">Quick Start</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a>
</p>

Some notable features include:

- 📁 One YAML file per request, git-friendly, no lock-in
- 🗂️ Folder organization with inheritable headers and auth
- 🌐 Environments with `$var` substitution
- ✏️ Built-in environment editor
- ⌨️ Inline editing of every field directly in the terminal
- 🔐 Multiple auth types (bearer, basic, API key) and body types (JSON, form data, multipart, binary)
- 📜 Response history with timeline per request
- ↔️ Layout switcher (stacked / side-by-side)
- 🎨 Theme picker with 30+ built-in themes
- 🛠️ Customizable keybindings
- 📦 Import from OpenAPI 3.0 and Postman collections
- 📋 Copy response body to clipboard

## Installation (macOS & Linux)

### Curl

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

### Homebrew

```bash
brew tap wilfredinni/noodle
brew trust wilfredinni/noodle
brew install noodle
```

Installs to `~/.local/bin/noodle` (curl) or your Homebrew prefix. Make sure the install directory is in your PATH.

### npx skills (AI agents)

```bash
npx skills add wilfredinni/noodle --skill noodle-use -g
```

Teaches your AI coding agent to create, organize, audit, import, and convert noodle collections. Supports OpenCode, Claude Code, Cursor, Copilot, and 70+ other agents.

Example prompts:
- "Scaffold a noodle collection for the Stripe API with auth and a few endpoints"
- "Audit my collection for security issues and REST best practices"
- "Convert this Insomnia export to a noodle collection"
- "Change the expand layout keybinding to Alt+I"
- "Set Catppuccin as my theme"
- "How many requests are in the Stripe API collection?"
- "What's the average response time for the login request on my Stripe collection?"

## Roadmap

See the [public roadmap](https://app.notion.com/p/39128d9edba9809da834f351332baf57?v=39228d9edba98042ad07000cdbe5d751&source=copy_link) for upcoming features and improvements.

## Importing collections

Import requests from OpenAPI 3.0 specs or Postman collections:

```bash
bun run dev -- --source ./specs/api.yaml
```

By default the imported collection is written to the `--collection` directory. Use `--output` to set a custom destination:

```bash
bun run dev -- --source ./specs/api.yaml --output ./my-collection
```

## Development

```bash
bun install
bun run dev -- --collection ./collections --env development
bun test
bun run lint
bun run typecheck
bunx prettier --check ./src ./tests
```
