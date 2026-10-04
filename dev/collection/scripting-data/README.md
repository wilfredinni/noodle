# Local inheritance and datasets

Start the services with `bun run dev:server`. Open the main development collection, select only the scripting-data folder in F5, and use `./scripting-data/users.csv` or `./scripting-data/users.json`.

The suite runs two requests for each row, exercising inherited pre/post/tests, JSON Schema, typed iteration data and isolated RunScope values. All URLs use the local base_url environment variable.

From the repo root:

```bash
bun src/app/cli.ts collection run dev/collection scripting-data/ --data dev/collection/scripting-data/users.csv --json
```
