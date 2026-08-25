# Automation workflow

Use Noodle's non-interactive CLI for supported collection operations. Never start the TUI from an agent.

## Choose the operation

| Need | Command |
| --- | --- |
| Find registered collections | `noodle workspace list --json` |
| Validate registered collection paths | `noodle workspace audit --json` |
| Remove invalid registered paths | `noodle workspace audit --fix --json` |
| Create a starter collection | `noodle collection create <name> --output <parent> --json` |
| Initialize an existing directory | `noodle collection init <dir> --json` |
| Print the request and folder tree | `noodle collection list <dir> --json` |
| Inspect files and environments | `noodle collection inspect <dir> --json` |
| Canonicalize request YAML and valid JSON bodies | `noodle collection format <dir> --json` |
| Validate file formats | `noodle collection audit <dir> --json` |
| Canonicalize valid files | `noodle collection audit <dir> --fix --json` |
| Create a minimal request | `noodle request create <id> --url <url> --method <method> --collection <dir> --json` |
| Update an existing environment variable | `noodle environment set <key> <value> --env <name> --collection <dir> --json` |
| Store or replace a declared secret | `noodle secret set <key> --env <name> --collection <dir> --stdin --json` |
| Inspect declared secret names and sources | `noodle secret list --env <name> --collection <dir> --json` |
| Delete a local vault value without removing its declaration | `noodle secret delete <key> --env <name> --collection <dir> --json` |
| Inspect collection cookies and storage health | `noodle cookie list --collection <dir> --json` |
| Clear cookies or recover unreadable cookie storage | `noodle cookie clear --collection <dir> --json` |
| Run one, selected, or all requests | `noodle request run <id> ... --json` or `noodle collection run <dir> [<target>...] ... --json` |

## Rules

- Read `status`, `data`, and `errors` from the one JSON envelope. A nonzero exit status means invalid input or a failed run.
- `workspace audit` checks registered paths for existence, directory access, and collection-root markers. `--fix` removes invalid paths from global config; authorize this mutation before running it.
- `collection init` only accepts an existing, non-collection directory. It creates missing `settings.yml` and `.environments/development.env` bootstrap files, then registers the absolute path. Existing markers are preserved.
- `collection format` rewrites every request file with canonical YAML and pretty-prints valid JSON bodies. It leaves invalid JSON body text unchanged. Obtain user authorization before running it because it modifies collection files.
- Request IDs are relative paths without `.yml`, such as `users/list`. Do not use traversal, empty segments, or hidden segments.
- `collection run <dir> [<target>...]` accepts bare request IDs and folder paths ending in `/`. Folders include nested requests. Overlapping targets run once in collection order; omit targets to run the whole collection.
- Every target is validated before the first request is sent. An HTTP status of
  400 or higher, a failed response capture, or a failed response assertion makes the command exit nonzero.
  A status assertion cannot turn an HTTP error response into a successful run.
- Requests with a `capture` mapping return a `captures` result containing `evaluated` and per-variable results. Human output shows captured and failed counts plus variable and expression names, never values. JSON success results include `variable`, `expression`, `success`, `type`, and typed `value`. Failure results include `failureReason` (`missing` or `resolution_error`) and `message`. `evaluated: false` with an empty `results` array means the request failed before a response was available.
- A collection run shares one RunScope in collection order. Environment values load first, successful captures override them, and the latest successful capture wins. Failed captures do not remove an earlier value. String captures substitute verbatim; other JSON values use `JSON.stringify()`. Captures are available only to later requests and disappear when the command returns.
- Successful captures commit before assertions and remain available after an HTTP or assertion failure. A capture failure marks the request and aggregate command failed, but the collection continues. Separate run commands never share captured values.
- Requests with an `assert` block return an `assertions` result containing `evaluated` and per-check results. Human output shows pass/fail counts without raw actual values; JSON output includes actual server values, so treat it as sensitive response data.
- For `request run`, read assertions from `data.result.assertions`; for `collection run`, read each `data.results[].assertions`. Each assertion result contains `expression`, `operator`, optional `expected`, optional `actual`, `passed`, and `message`. `evaluated: false` with an empty `results` array means the request failed before assertions could run; requests without assertions omit the field.
- `request run` and `collection run` use `--env <name>` when supplied. Otherwise they use `settings.yml`'s environment. Without either an environment or an earlier capture, unresolved variables fail before sending.
- JSON capture values are raw server data unless they match a known environment, proxy, or TLS secret, in which case Noodle recursively redacts them. Human capture output never includes values. Server response fields retain the existing raw-response policy, so treat all structured run output as sensitive.
- Run commands contact remote servers and may write cookie-jar state, bootstrap a `collection_id` for that jar, and refresh OAuth credentials. They do not write response timeline entries. Capture evaluation never writes RunScope values into request YAML, environment files, or collection settings. Execute runs only when the
  user has authorized the request scope, even when the HTTP method is normally
  read-only.
- Treat cookie `data.warnings` as non-fatal diagnostics. Run results can succeed while warning that cookie storage is plaintext or unavailable; unavailable jars are skipped for that run. `cookie list` also reports `data.state`, warnings, and `hostOnly` for every cookie.
- Treat every `cookie list` value as sensitive. Do not paste human or JSON output into logs, issues, or shared reports without redaction.
- `cookie clear` is the explicit recovery operation for unreadable cookie storage. It preserves the original file and returns its path in `data.backupPath` before creating a clean jar. Report that backup path to the user.
- Add `--insecure` to `request run` or `collection run` only when the user explicitly authorizes disabling TLS certificate verification for that invocation.
- `secret set` creates or updates the blank `# @secret KEY` declaration and stores the value in the OS vault. Prefer masked TTY input for humans; use `--stdin` only when automation can supply the value without exposing it in arguments or logs. `environment set` refuses declared secret keys.
- `collection audit --fix` writes canonical forms for valid files. Obtain user authorization before running it.

## Fall back to files

Use direct YAML/dotenv edits when the CLI cannot express the change: folders and inheritance, request headers, params, auth, bodies, form data, captures, assertions, new environment files, and manual conversions. After edits, run `noodle collection audit <dir> --json` and, when appropriate, execute the affected request sequence.
