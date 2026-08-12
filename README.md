# <img src="assets/logo.png" data-canonical-src="/logo.png" width="32" height="32" /> noodle

## Your API client should live with your code.

Noodle is a fast, keyboard-first HTTP client for the terminal. Requests stay as
readable YAML files in your repository—easy to review, share, automate, and
keep long after the tool is gone.

No cloud account. No workspace sync. No proprietary format.

![Noodle terminal interface](assets/noodle.png)

<p align="center">
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/"><strong>Get started</strong></a> ·
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a> ·
  <a href="https://github.com/wilfredinni/noodle/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://app.notion.com/p/39128d9edba9809da834f351332baf57?v=39228d9edba98042ad07000cdbe5d751&source=copy_link">Roadmap</a>
</p>

## API work without the workspace gravity

Most API clients want to become the place your work lives. Noodle takes the
opposite approach: your repository is the source of truth.

- **Requests you can read.** One small `.yml` file per request. Diff it, review
  it, copy it, or edit it with any text editor.
- **A workflow that travels.** Open the same collection in the TUI, run it from
  the CLI, or hand it to an agent—without translating it first.
- **Your data stays yours.** Noodle works from local files and stores declared
  secrets in your operating system's credential vault.
- **No clean-slate migration.** Bring in OpenAPI, Swagger, Postman, or Insomnia
  collections and export to OpenAPI or Postman when you need to leave.

## From first request to repeatable workflow

Install Noodle:

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

Create a collection and make your first request:

```bash
noodle collection create my-api
noodle request create users/get \
  --url https://api.example.com/users/42 \
  --collection ./my-api
noodle --collection ./my-api
```

What you edit in the terminal is simply a file:

```yaml
name: Get User
method: GET
url: $base_url/users/:userId
path_params:
  - name: userId
    value: $user_id
headers:
  Accept: application/json
```

Commit it beside the code it exercises. Teammates get the request, its folder
structure, and its shared configuration through the same workflow they already
use for everything else.

Prefer Homebrew?

```bash
brew tap wilfredinni/noodle
brew trust wilfredinni/noodle
brew install noodle
```

[See every installation option →](https://noodlerest.dev/docs/getting-started/installation/)

## Made for the whole API loop

### Explore without leaving the terminal

Edit URLs, parameters, headers, authentication, and bodies inline. Jump between
panes from the keyboard, switch environments in a keystroke, search large
collections, and choose from more than 30 themes.

![Variable completion in Noodle](assets/autocomplete.png)

### See what actually happened

Inspect formatted bodies and headers, filter JSON with JSONPath, follow the
network trace across redirects and proxies, and revisit previous responses in
the per-request timeline.

![Response timeline in Noodle](assets/timeline.png)

### Share configuration, not secrets

Use environment variables for development, staging, and production. Mark
sensitive values as secrets and Noodle keeps them out of environment files,
request history, generated code, search results, and exports.

![Secret management in Noodle](assets/secrets.png)

### Automate the work you already explored

Every collection can be inspected, audited, formatted, and run without opening
the TUI. Commands support structured JSON output, so the same requests work in
scripts, CI, and agent workflows.

```bash
noodle request run users/get --collection ./my-api --env staging
noodle collection audit ./my-api --json
noodle collection run ./my-api --json
```

[Explore the CLI →](https://noodlerest.dev/docs/getting-started/cli/)

## Bring your existing work

Import an OpenAPI 3.0 or Swagger 2.0 specification, a Postman collection, or an
Insomnia export:

```bash
noodle import ./specs/api.yaml --output ./collections
```

You can also export a collection to OpenAPI or Postman, so adopting Noodle is a
choice—not a trap.

[Learn about imports and exports →](https://noodlerest.dev/docs/)

## Built for people—and agents—who work in repositories

Because Noodle collections are plain files with a non-interactive CLI, coding
agents can create, organize, audit, and run them without screen scraping or a
hosted integration.

Install the `noodle-use` skill:

```bash
npx skills add wilfredinni/noodle --skill noodle-use -g
```

Then ask your agent to:

- “Scaffold a Noodle collection for this API.”
- “Audit these requests for security issues and REST best practices.”
- “Convert this Insomnia export into a Noodle collection.”

[Use Noodle with AI agents →](https://noodlerest.dev/docs/guides/ai-agent-skills/)

## Dive deeper

- [Quick start](https://noodlerest.dev/docs/getting-started/quick-start/)
- [Documentation](https://noodlerest.dev/docs/)
- [CLI reference](https://noodlerest.dev/docs/getting-started/cli/)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)

## Contributing

Noodle is built with Bun, TypeScript, React, and OpenTUI. To run it locally:

```bash
bun install
bun run dev -- --collection ./collections --env development
```

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and test commands.

Apache-2.0 licensed.
