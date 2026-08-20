<h1 align="center">Noodle</h1>

<p align="center"><strong>API workflows, <em>untangled.</em></strong></p>

<p align="center">Open-source terminal REST client</p>

<p align="center">
  Write, send, inspect, and automate HTTP requests from readable files without
  leaving your terminal. Keep every collection versioned beside the code it
  exercises, ready for the TUI, CLI, scripts, and coding agents.
</p>

<p align="center"><strong>Fast by default.</strong> Made to review. Ready to automate.</p>

<p align="center">
  <a href="https://noodlerest.dev/docs/getting-started/quick-start/"><strong>Get started</strong></a> ·
  <a href="https://noodlerest.dev/">Website</a> ·
  <a href="https://noodlerest.dev/docs/">Docs</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="SECURITY.md">Security</a>
</p>

![Noodle terminal interface](assets/noodle.png)

## Install

```bash
curl -LsSf https://noodlerest.dev/install.sh | sh
```

[See every installation option](https://noodlerest.dev/docs/getting-started/installation/)

## Files first

Every request is a readable YAML file. Edit it in Noodle or your editor, review
it in Git, and keep it beside the code it exercises.

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

Create a collection and open it in the TUI:

```bash
noodle collection create my-api
noodle request create users/get \
  --url https://api.example.com/users/42 \
  --collection ./my-api
noodle --collection ./my-api
```

## The whole exchange, without leaving the terminal

Compose URLs, parameters, headers, authentication, and bodies from a
keyboard-first workspace. Send the request, then inspect the body, headers,
cookies, status, timing, and network timeline in the same place.

Noodle supports JSON and XML bodies, JSONPath filtering, redirects, proxies,
TLS, mTLS, and request authentication including OAuth 1.0a and OAuth 2.0.

## Environment-aware without leaking secrets

Switch between development, staging, and production variables. Secret
declarations stay in the file while values live in the operating system
credential vault or process environment.

Sensitive values are kept out of environment files, request history, generated
code, search results, and exports.

## One collection, more than one way to work

Explore interactively in the TUI, run requests from the CLI, automate
collection checks, or give coding agents the supported Noodle skill.

```bash
noodle request run users/get --collection ./my-api --env staging
noodle collection audit ./my-api --json
noodle collection run ./my-api --json
noodle agent install
```

Commands support structured JSON output for scripts, CI, and agent workflows.

## Bring your existing work

Import OpenAPI 3.0, Swagger 2.0, Postman, or Insomnia collections. Export to
OpenAPI or Postman when another tool needs the same requests.

```bash
noodle import ./specs/api.yaml --output ./collections
```

## Learn more

- [Quick start](https://noodlerest.dev/docs/getting-started/quick-start/)
- [Documentation](https://noodlerest.dev/docs/)
- [CLI reference](https://noodlerest.dev/docs/getting-started/cli/)
- [AI agent skills](https://noodlerest.dev/docs/guides/ai-agent-skills/)
- [Changelog](CHANGELOG.md)

## Contributing

Noodle is built with Bun, TypeScript, React, and OpenTUI.

```bash
bun install
bun run dev -- --collection ./collections --env development
```

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and test commands.

Apache-2.0 licensed.
