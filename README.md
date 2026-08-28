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

The request Assert and Capture tabs edit response checks and extracted values as
structured rows, while request tags live in Settings. Manual sends use a fresh
scope each time. Results stays available and gains a value indicator when the
send has assertion or capture outcomes.

Assert and Capture rows use the same per-row checkboxes as Headers and Params.
Disabled declarations remain in the request but are skipped by manual sends,
the collection Runner, and CLI runs.

In jump mode, `v` opens Assert, `c` opens Capture, and `t` opens Settings.

Run Collection from the command palette opens a transient collection runner for
choosing requests, environment, tag filters, and fail-fast behavior before
inspecting ordered results. A folder's context palette opens the same runner
scoped to that folder.

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
noodle collection run ./my-api auth/ health users/get --json
noodle collection run ./my-api --tag smoke --exclude-tag destructive --json
noodle agent install
```

Commands support structured JSON output for scripts, CI, and agent workflows.
Requests and non-root folders can declare case-sensitive `tags`. Folder tags
apply to every descendant request, so `collection run --tag smoke` can execute a
dynamic suite without a second collection format. Include and exclude filters
compose, with exclusion winning, and `--fail-fast` records the remaining
selected request IDs as skipped.

Request YAML can also declare response assertions for status, timing, headers,
and JSON body paths. Edit them in the TUI Assert tab or as YAML. Manual
sends show results beside the response; `request run` and `collection run` also
evaluate them and exit nonzero when a check fails. Collection runs exit `0` on
success, `1` after any completed request failure, and `2` for a pre-run
configuration failure. JSON includes every executed result, fail-fast skips,
failure categories, and the aggregate run summary.

Collection runs can pass response values forward without writing them to an
environment file:

```yaml
capture:
  user_id: body.id
  request_id: headers.x-request-id
  optional_trace: { value: headers.x-trace, enabled: false }
```

Enabled captures keep the string shorthand. Assertions accept the same optional
`enabled: false` field on each list item; omitted `enabled` means enabled.

Later requests use the same `$variable` syntax, such as
`url: $base_url/users/$user_id`. Captures exist only for that run, override
same-named environment values, and disappear when the command ends. A manual
TUI send uses a fresh scope, so its captures are inspectable in Results but do
not affect a later manual send. The collection Runner shares captured values
only across requests in its current run. Timeline history stores redacted
assertion results, never capture results or RunScope values.

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
