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
- `request run` and `collection run` use `--env <name>` when supplied. Otherwise they use `settings.yml`'s environment; ensure referenced `$vars` exist there.
- Treat cookie `data.warnings` as non-fatal diagnostics. Run results can succeed while warning that cookie storage is plaintext or unavailable; unavailable jars are skipped for that run. `cookie list` also reports `data.state`, warnings, and `hostOnly` for every cookie.
- Treat every `cookie list` value as sensitive. Do not paste human or JSON output into logs, issues, or shared reports without redaction.
- `cookie clear` is the explicit recovery operation for unreadable cookie storage. It preserves the original file and returns its path in `data.backupPath` before creating a clean jar. Report that backup path to the user.
- Add `--insecure` to `request run` or `collection run` only when the user explicitly authorizes disabling TLS certificate verification for that invocation.
- `secret set` creates or updates the blank `# @secret KEY` declaration and stores the value in the OS vault. Prefer masked TTY input for humans; use `--stdin` only when automation can supply the value without exposing it in arguments or logs. `environment set` refuses declared secret keys.
- `collection audit --fix` writes canonical forms for valid files. Obtain user authorization before running it.

## Fall back to files

Use direct YAML/dotenv edits when the CLI cannot express the change: folders and inheritance, request headers/params/auth/body/form data, new environment files, and manual conversions. After edits, run `noodle collection audit <dir> --json` and, when appropriate, execute the affected request.
