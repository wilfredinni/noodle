# Inheritance, JSON Schema and CSV/JSON data

From the repository root, start the local API in one terminal:

```bash
bun collections/scripting-data/server.ts
```

Run both users with either file in another terminal:

```bash
bun src/app/cli.ts collection run ./collections/scripting-data --data ./collections/scripting-data/users.csv --noproxy
bun src/app/cli.ts collection run ./collections/scripting-data --data ./collections/scripting-data/users.json --noproxy --json
```

For the TUI, open `bun src/app/cli.ts ./collections/scripting-data`, press F5,
and enter `users.csv` or `users.json` in **Data file**. Select **Run**.
CLI paths start at the current directory; Runner paths start at the collection root.

Each row runs the request with `$user_id`. CSV values are strings; JSON keeps
numbers. Collection pre runs before folder pre, and tests run collection,
folder, then request. Results show each block's file. The request tests require
iteration data, so run this example through the CLI collection command or F5.

Rows start with fresh variables and independent cookies copied from the initial
jar. Captures and scripts may override row values, while `noodle.iteration.data`
retains the original, read-only row. Iteration changes are transient.
