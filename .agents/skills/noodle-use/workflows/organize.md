# Organize workflow

Restructure, rename, and refactor existing noodle collections.

## Principles

- **Never break IDs**: Requests and folders are identified by their relative path (ID). Moving or renaming changes the ID. If the user has timeline data or UI state, the old ID will be orphaned.
- **Always ask before bulk changes**: Restructuring affects all IDs. Confirm the plan before executing.
- **Preserve folder.yml**: When moving files between folders, the `folder.yml` overrides may change behavior. Warn if auth/headers will change.

## Rename a request

### Step 1: Understand the change

Renaming the display name in the `name` field is safe — it doesn't affect the ID.

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
├── folder.yml        (optional: shared auth)
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

Remove the duplicated header from each request file. This is a lossless change — the folder override applies the header.

## Ensure env consistency

When restructuring, check that all `$var` references in requests have corresponding declarations in every environment file. Missing vars cause runtime errors.

### Step 1: Scan all request files for `$var` patterns

Regex: `/\$(\w+)/g` across all `.yml` files.

### Step 2: For each environment, check that every var is declared

Read each `.env` file. Flag any missing declarations.

### Step 3: Add missing vars with placeholder values

Add `missing_var=PLACEHOLDER` to environments that lack it.
