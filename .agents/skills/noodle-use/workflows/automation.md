# Automation workflow

Use Noodle's non-interactive CLI for supported collection operations. Never start the TUI from an agent.

## Choose the operation

| Need | Command |
| --- | --- |
| Find registered collections | `noodle workspace list --json` |
| Create a starter collection | `noodle collection create <name> --output <parent> --json` |
| Inspect files and environments | `noodle collection inspect <dir> --json` |
| Validate file formats | `noodle collection audit <dir> --json` |
| Canonicalize valid files | `noodle collection audit <dir> --fix --json` |
| Create a minimal request | `noodle request create <id> --url <url> --method <method> --collection <dir> --json` |
| Update an existing environment variable | `noodle environment set <key> <value> --env <name> --collection <dir> --json` |
| Run one request or all requests | `noodle request run <id> ... --json` or `noodle collection run <dir> ... --json` |

## Rules

- Read `status`, `data`, and `errors` from the one JSON envelope. A nonzero exit status means invalid input or a failed run.
- Request IDs are relative paths without `.yml`, such as `users/list`. Do not use traversal, empty segments, or hidden segments.
- `request run` and `collection run` use `--env <name>` when supplied. Otherwise they use `settings.yml`'s environment; ensure referenced `$vars` exist there.
- `collection audit --fix` writes canonical forms for valid files. Obtain user authorization before running it.

## Fall back to files

Use direct YAML/dotenv edits when the CLI cannot express the change: folders and inheritance, request headers/params/auth/body/form data, new environment files, and manual conversions. After edits, run `noodle collection audit <dir> --json` and, when appropriate, execute the affected request.
