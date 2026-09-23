# Inheritance, JSON Schema and CSV/JSON data

Two GET requests and two dataset rows exercise all four scripting additions.
They use the public [JSONPlaceholder API](https://jsonplaceholder.typicode.com/)
over HTTPS, like the other sample requests. An internet connection is required;
no local server, account, or API key is needed.

To use the main sample collection, select **Inheritance, schemas and datasets**
(`scripting-data`) in the sidebar and press F5. In **Data file**, enter
`./scripting-data/users.csv` or `./scripting-data/users.json`, then select **Run**.
Keep only this folder selected when running these datasets.

You can also open this suite as its own collection:

```bash
bun src/app/cli.ts ./collections/scripting-data
```

Then press F5 and use `./users.csv` or `./users.json` in **Data file**.
Type `./` to complete collection paths or `@/` to complete paths from your home
directory. Select a suggestion with Enter or Tab.

Both datasets produce **2 iterations, 4 successful requests and 28 passing tests**.
Results identify the collection/folder/request that declared each inherited block.

For the CLI, run either dataset from the repository root:

```bash
bun src/app/cli.ts collection run ./collections/scripting-data --data ./collections/scripting-data/users.csv --noproxy
bun src/app/cli.ts collection run ./collections/scripting-data --data ./collections/scripting-data/users.json --noproxy --json
```

CLI paths start at the current directory; Runner paths start at the open collection root.

| File | Demonstrates |
| --- | --- |
| `settings.yml` | Collection-level pre, post, and tests when opened independently |
| `folder.yml` | Equivalent suite setup when opened inside the main sample collection |
| `users/folder.yml` | Inherited pre/post/tests; draft-07 schema with local references and email format |
| `users/get-user.yml` | Request pre/post; dataset assertions; all four new matchers and their negations; negated schema |
| `users/nested/folder.yml` | An inner folder that adds pre/post/tests to its ancestors |
| `users/nested/get-user.yml` | Exact execution order and iteration context in a nested request |
| `users.csv` | String cells, a quoted comma, and a multiline field |
| `users.json` | The same rows with numeric IDs |

Each row supplies `$user_id`, `expected_email`, `expected_username`,
`expected_city`, and `case_name`. CSV cells remain strings; JSON retains numeric
IDs. Assertions convert the expected ID to a number so both files describe the
same two cases.

Every pre/post block appends its name to `exampleSteps` in RunScope. Tests verify
the order: suite, outer folder, inner folder (where present), request for pre;
request, inner folder, outer folder, suite for post. Tests run after assertions,
from suite to request. The suite resets that trace before each request. When this
directory is opened independently, `settings.yml` supplies the suite blocks and
the root `folder.yml` is ignored. When the parent collection is open, its child
`scripting-data/folder.yml` supplies them instead.

The request URLs and tests require iteration data. Run them through F5 or the
collection CLI with a dataset, rather than sending a request manually.

Rows start with fresh variables and independent cookies copied from the initial
jar. Captures and scripts may override row values, while `noodle.iteration.data`
retains the original, read-only row. Iteration changes are transient.
