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
  <a href="SECURITY.md">Security</a> ·
  <a href="https://github.com/sponsors/wilfredinni">Sponsor</a>
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
send has script, assertion, or capture outcomes.

Empty Assert and Capture tabs stay behind the request pane's `+` menu. Reveal
them when needed; tabs with declarations remain visible. Press `g` then `o` to
focus the menu, or use `g` then `v` or `c` to open either tab directly.

Assert and Capture rows use the same per-row checkboxes as Headers and Params.
Disabled declarations remain in the request but are skipped by manual sends,
the collection Runner, and CLI runs.

In jump mode, `v` opens Assert, `c` opens Capture, and `t` opens Settings.

Press F5 or choose Run Collection from the command palette to open a transient
collection runner for choosing requests, environment, tag filters, fail-fast
behavior, and an optional delay between requests before inspecting ordered
results. A folder's context palette opens the same runner scoped to that folder.

Noodle supports JSON and XML bodies, JSONPath filtering, redirects, proxies,
TLS, mTLS, and request authentication including OAuth 1.0a and OAuth 2.0.
OAuth 2 can discover missing endpoints from an OIDC issuer or an exact discovery
document URL. See [Authentication](https://noodlerest.dev/docs/guides/authentication/)
for setup and import/export behavior.

Choose `system` in the Ctrl+T theme picker to follow your terminal's palette.
Noodle refreshes colors when the terminal reports a theme change and falls back
to Noodle colors when detection is unavailable.

Focus the response Body tab and press `m`, or click the footer action, to switch
between Source and Visual. Visual turns JSON and XML into expandable rows and
compact tables; `/` searches labels and values. Source keeps JSONPath filtering.
Copy the response body with Ctrl+Alt+B.

Hide or show the sidebar with Ctrl+B. Tab skips it while hidden; `g` then `s`
reopens it and focuses the request tree.

## Environment-aware without leaking secrets

Switch between development, staging, and production variables. Secret
declarations stay in the file while values live in the operating system
credential vault or process environment.

Variable names use only letters, numbers, and `_`. Reference them as `$NAME`;
write `$$NAME` when the request must contain the literal text `$NAME`.
Environment values preserve every character after the first `=`, including
trailing spaces.

Secret values stay out of environment files, generated code, search results,
and exports. Structured run results and timeline history mask known secret
values, request credentials, cookies, and sensitive response headers such as
`Set-Cookie`. Response bodies and compressed timeline sidecars receive the same
known-secret redaction. Arbitrary server data can still be sensitive, so review
JSON run output and `.timeline/` files before publishing them.
Redaction applies when entries are saved. Marking a variable secret later does
not rewrite existing history.

## One collection, more than one way to work

Explore interactively in the TUI, run requests from the CLI, automate
collection checks, or give coding agents the supported Noodle skill.

```bash
noodle request run users/get --collection ./my-api --env staging
noodle collection audit ./my-api --json
noodle collection run ./my-api --json
noodle collection run ./my-api auth/ health users/get --json
noodle collection run ./my-api --tag smoke --tag api --exclude-tag destructive --json
noodle collection run ./my-api --delay 500 --json
noodle agent install
```

Commands support structured JSON output for scripts, CI, and agent workflows.
Requests and non-root folders can declare case-sensitive `tags`. Folder tags
apply to every descendant request, so `collection run --tag smoke` can execute a
dynamic suite without a second collection format. Repeat `--tag` to require
every Include tag and repeat `--exclude-tag` to remove requests matching any
Exclude tag. Exclusion wins, and `--fail-fast` records the remaining selected
request IDs as skipped. `--delay <milliseconds>` waits after each completed
request when another selected request remains.

Request YAML can also declare response assertions for status, timing, headers,
and JSON body paths. Edit them in the TUI Assert tab or as YAML. Manual
sends show results beside the response; `request run` and `collection run` also
evaluate them and exit nonzero when a check fails. Collection runs exit `0` on
success, `1` after any completed request failure, and `2` for a pre-run
configuration failure. JSON includes every executed result, fail-fast skips,
failure categories, and the aggregate run summary.

Response expressions distinguish missing values from explicit JSON `null`.
`response.time` is measured in milliseconds, header names are matched without
case sensitivity, and body paths retain JSON strings, finite numbers, booleans,
arrays, objects, and null. Equality is typed and recursive with no coercion:
array order matters, object key order does not, and string comparisons are
case-sensitive. `contains` checks a case-sensitive substring or a deeply equal
array member. `matches` is a case-sensitive JavaScript regular expression with
no flags; it is unanchored unless `^` or `$` is supplied and rejects unsafe or
unsupported regex syntax.

### Sandboxed pre-request scripts

A request can run one synchronous inline script after folder merging and
variable substitution, but before HTTP transport:

```yaml
scripts:
  pre: |-
    const timestamp = new Date().toISOString();
    request.headers.set("X-Timestamp", timestamp);
    request.headers.set(
      "X-Signature",
      crypto.hmacSha256(env.get("SIGNING_SECRET"), request.body.text() ?? "", "hex"),
    );
    request.body.setJson({ ...request.body.json(), sentAt: timestamp });
    run.set("temporary_id", crypto.randomBytes(12, "hex"));
```

`scripts` must be a mapping containing only the string-valued `pre` member. An
empty string is a valid no-op. Script source is emitted as a literal YAML block
before `capture` and `assert`, and `$` references inside the source are never
substituted.

The public API is intentionally small:

- `request.url` and `request.method` are readable and writable.
- `request.headers` provides `get`, `has`, `set`, and `delete`; names are
  case-insensitive.
- `request.params` provides `get`, `getAll`, `set`, `append`, and `delete` for
  enabled, case-sensitive query parameters. Disabled declarations are untouched.
- `request.body` provides `text`, `json`, `setText`, `setJson`, and `clear`.
- `request.auth` provides `clear`, `setBearer`, `setBasic`, and `setApiKey`.
- `env.get(name)` reads only the selected environment.
- `run.get`, `run.set`, and `run.unset` access the current transient RunScope.
- `crypto.sha256`, `crypto.hmacSha256`, and `crypto.randomBytes` support exact
  `hex` or `base64` output.
- `console.log`, `info`, `warn`, and `error` capture bounded result logs.

Request and RunScope changes commit only after the complete script succeeds.
Request changes affect only the prepared in-memory copy. RunScope changes are
committed before HTTP and can be used by later requests in the same collection
run, even if transport, HTTP status, capture, or assertion handling later
fails. A later successful capture can overwrite a script value. Manual sends
and `request run` use a fresh scope, so `temporary_id` above is temporary unless
a later request in the same collection run consumes it.

Scripts run in a fresh QuickJS runtime and context with a fixed 64 MiB WASM
memory, 32 MiB runtime memory, 512 KiB stack, 500 ms deadline, and 256 KiB UTF-8
source limit. One bridged JSON value is limited to 256 KiB and depth 32. Random
generation is limited to 4 KiB per call. Console capture keeps at most 100
entries and 64 KiB of combined text, with serialization depth 4.

The sandbox exposes no Bun, process, filesystem, shell, network, timer, worker,
or host module APIs. Imports, returned Promises, and queued async work are not
supported. Each invocation is disposed before the next request. Values crossing
the boundary must be bounded JSON with safe keys, finite numbers, and plain or
null-prototype objects.

Treat collections containing scripts as trusted code. A script can read
selected-environment secrets with `env.get`, place them in the prepared URL,
headers, or body, and disclose them through the HTTP request that follows.

The Results view shows script status, duration, log count, normalized error,
and expandable redacted logs. Human CLI output reports status, duration, log
count, and a redacted failure without printing log contents. `--json` includes
the full redacted `scripts` result group. Script source, status, and logs are
transient and are never stored in `.timeline`; successful manual timeline
snapshots reflect the prepared request mutations.

Captures can pass response values forward during a collection run or persist
them after an individual manual send or `request run`:

```yaml
capture:
  user_id:
    value: body.id
  access_token:
    value: body.access_token
    persist: secret
  optional_trace:
    value: headers.x-trace
    enabled: false
```

Every capture requires `value`, accepts optional `persist: secret` or
`persist: environment`, and accepts optional `enabled: false`. Omitted
`persist` means transient and omitted `enabled` means enabled.

Later requests use the same `$variable` syntax, such as
`url: $base_url/users/$user_id`. Transient captures override same-named
environment values and disappear when the run ends. On a manual TUI send or
CLI `request run`, persisted captures update the active or selected environment
after successful extraction, even if HTTP status or a later assertion fails.
Collection Runner and CLI `collection run` always keep captures transient.
Secret capture values and values captured from sensitive response headers are
fully redacted from capture results. Timeline history stores redacted assertion
results, never capture results or RunScope values.

Every send follows one execution contract:

1. Merge folder overrides.
2. Overlay the current RunScope on the selected environment for substitution.
3. Substitute the request once.
4. Run the request-level pre-script against a staged prepared copy.
5. Commit successful script request and RunScope mutations.
6. Send the prepared request through the HTTP transport.
7. Evaluate and commit captures.
8. Evaluate assertions.

Results are redacted using declared secrets, secret RunScope values,
credentials, sensitive headers, script-created secrets, and secrets discovered
by transport. For manual TUI sends only, Noodle also persists the existing safe
timeline record.

`request run` and manual sends use isolated scopes. `collection run` and the TUI
Runner share one scope across selected requests in collection order, after
target and tag filtering. Automation and Runner executions do not write
timeline history.

## Bring your existing work

Import OpenAPI 3.0, Swagger 2.0, Postman, or Insomnia collections. Export to
OpenAPI or Postman when another tool needs the same requests.

Postman imports accept `{{WORD}}` variables. Dynamic generators and dotted or
hyphenated placeholders are rejected before collection files are written.

```bash
noodle import ./specs/api.yaml --output ./collections
```

## Learn more

- [Quick start](https://noodlerest.dev/docs/getting-started/quick-start/)
- [Documentation](https://noodlerest.dev/docs/)
- [CLI reference](https://noodlerest.dev/docs/getting-started/cli/)
- [AI agent skills](https://noodlerest.dev/docs/guides/ai-agent-skills/)
- [Changelog](CHANGELOG.md)

## Sponsor

Noodle is free and open source. If it saves you time, you can
[sponsor its continued development](https://github.com/sponsors/wilfredinni).
Sponsorship helps fund maintenance, bug fixes, documentation, platform testing,
and thoughtful new features.

## Contributing

Noodle is built with Bun, TypeScript, React, and OpenTUI.

```bash
bun install
bun run dev -- --collection ./collections --env development
```

See [AGENTS.md](AGENTS.md) for the architecture, conventions, and test commands.

Apache-2.0 licensed.
