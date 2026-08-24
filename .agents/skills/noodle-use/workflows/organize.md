# Organize workflow

Restructure, rename, and refactor existing noodle collections.

## Principles

- **Never break IDs**: Requests and folders are identified by their relative path (ID). Moving or renaming changes the ID. If the user has timeline data or UI state, the old ID will be orphaned.
- **Always ask before bulk changes**: Restructuring affects all IDs. Confirm the plan before executing.
- **Preserve folder.yml**: When moving files between folders, the `folder.yml` overrides may change behavior. Warn if auth/headers will change.
- **Preserve collection identity**: Keep the generated `collection_id` when moving or renaming one collection so OS-vault secrets remain available. Never copy that ID into a different collection.
- **Preserve assertions**: Keep each request's `assert` block during moves, renames, and unrelated edits. Never weaken or remove a check merely to make a run pass.

## Rename a request

### Step 1: Understand the change

Renaming the display name in the `name` field is safe because it does not affect the ID.

Renaming the file changes the ID. Example: `users/get.yml` → `users/get-users.yml` changes ID from `"users/get"` to `"users/get-users"`.

### Step 2: For display name rename

Read the file, change the `name` field, write back.

### Step 3: For file rename (ID change)

```bash
mv <dir>/users/get.yml <dir>/users/get-users.yml
```

Update any references:
- If there's a timeline file at `.timeline/users/get.yml`, it becomes orphaned. The old response history is lost.
- If `last-request` points to this ID, it's now stale.
- UI state at `.noodle/ui-state/users/get.yml` is orphaned.

Warn the user about these consequences.

## Move requests into a folder

### Step 1: Read the collection

List all `.yml` files in the target directory.

### Step 2: Create the folder

```bash
mkdir -p <dir>/<new-folder>
```

Optionally create `folder.yml` if auth/headers/ordering is needed.

### Step 3: Move files

```bash
mv <dir>/<old-path>.yml <dir>/<new-folder>/<old-name>.yml
```

### Step 4: Update IDs and warn

All moved requests get new IDs. Old timeline data is orphaned. Suggest the user re-run the requests after moving to repopulate.

## Restructure by domain

Common refactor: flat list → grouped by resource.

**Before:**
```
collection/
├── get-users.yml
├── create-user.yml
├── delete-user.yml
├── get-posts.yml
├── create-post.yml
└── .environments/
```

**After:**
```
collection/
├── users/
│   ├── get-users.yml
│   ├── create-user.yml
│   └── delete-user.yml
├── posts/
│   ├── get-posts.yml
│   └── create-post.yml
└── .environments/
```

### Step 1: Group by naming pattern

Look for files that share a common prefix or resource name.

### Step 2: Create folders and move

```bash
mkdir -p <dir>/users <dir>/posts
mv <dir>/get-users.yml <dir>/users/get-users.yml
mv <dir>/create-user.yml <dir>/users/create-user.yml
# ... etc
```

### Step 3: Check for shared auth

If multiple groups use the same auth pattern, suggest creating a shared parent folder with `folder.yml` and updating descendant requests to use `type: inherit`. Root-level `folder.yml` is ignored.

### Step 4: Add folder display names

```yaml
# users/folder.yml
meta:
  name: Users
  seq: 1
```

```yaml
# posts/folder.yml
meta:
  name: Posts
  seq: 2
```

## Flatten deeply nested folders

If a collection has more than 3 levels of nesting:

```
collection/
└── api/
    └── v2/
        └── users/
            └── get-users.yml       # 4 levels deep
```

Suggest flattening. Options:
- Remove the `api/v2` nesting and use display names: `Users v2`
- Move `users/` to root, add `seq: 2` instead of nesting under `api/`

## Deduplicate headers

If every request in a folder repeats the same header:

### Step 1: Find repeated headers

Scan all requests in a folder for headers that appear on every file.

### Step 2: Move to folder.yml

Add the common header to `folder.yml`:
```yaml
headers:
  Content-Type: application/json
```

### Step 3: Remove from individual requests

Remove the duplicated header from each request file. This is a lossless change because the folder override applies the header.

## Reorder folders

Folder order is controlled by `meta.seq` in each real child folder's
`folder.yml`. Lower numbers appear first and folders without `seq` appear after
numbered folders. To apply a requested order, assign a unique sequence in that
order, preferably `1`, `2`, `3`, and so on. Do not use a root `folder.yml` for
ordering because the loader ignores it.

After editing, run `noodle collection audit <dir> --json` and inspect the tree
with `noodle collection list <dir> --json`.

## Clone or delete requests

To clone a request, copy its `.yml` file to a new valid path inside the same
collection, update the display `name` when appropriate, and preserve its request
fields and assertions unless the user requested a contract change. The new path
becomes the new request ID. Validate the collection after writing it.

Deleting a request is destructive. Obtain explicit authorization for the exact
file, then delete only that request `.yml`. Leave its `.timeline/` history and
`.noodle/` UI state untouched unless the user separately asks to remove generated
data. Explain that those records become orphaned after deletion.

## Clone or delete environments

To clone an environment, copy its `.env` declarations to a new valid environment
name, change public values as requested, and leave secret placeholders blank.
OS-vault values are scoped to the environment name and are not cloned. Store new
secret values only when the user supplies them through an authorized secret
workflow.

Deleting an environment is destructive. Obtain explicit authorization and make
sure `settings.yml` will still name an existing environment. If the environment
declares no secrets, delete only its exact `.environments/<name>.env` file. If it
declares secrets, do not perform a file-only deletion because that would leave
vault entries behind. Ask the human user to delete it in Noodle's environment
editor, which removes stored values and rolls them back if file deletion fails.

## Ensure env consistency

When restructuring, check that all evaluated `$var` references in requests and
nested `folder.yml` overrides have corresponding declarations in every
environment file. Include path parameters and strings nested inside assertion
expected values. Disabled headers, query parameters, form entries, and OAuth 2
additional parameters are not substituted until enabled.

### Step 1: Scan all request files for `$var` patterns

Regex: `/\$(\w+)/g` across request `.yml` files and non-root `folder.yml` files.
Classify each match by field so disabled entries can be excluded.

### Step 2: For each environment, check that every var is declared

Read each `.env` file. Flag any missing declarations.

### Step 3: Add missing vars with placeholder values

Add public values as `missing_var=PLACEHOLDER`. For credentials, tokens, private
keys, or other sensitive values, add a blank secure declaration instead:

```dotenv
# @secret missing_secret
missing_secret=
```

## Maintain response assertions

When a request contract changes, review its `assert` block with the rest of the
request. Use the user's intended contract or an authoritative API specification,
not one observed response, to decide what should change.

- Update only checks affected by the contract change. Preserve unrelated checks
  and their order.
- Keep assertions at the request level when moving files. Folder inheritance does
  not apply to assertions.
- Include assertion expected strings when checking `$VARNAME` references across
  environments.
- Do not delete, relax, or replace a failing assertion until you determine whether
  the request, environment, server response, or assertion is wrong.

After an assertion edit, validate the collection with `noodle collection audit
<dir> --json`. When request execution is authorized, run the affected request
with `noodle request run <id> --collection <dir> --env <environment> --json`.
Treat JSON actual values as sensitive response data. An assertion result with
`evaluated: false` means the request failed before its checks could run.
