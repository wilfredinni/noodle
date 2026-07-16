# Conventions

Naming, structure, and behavioral conventions for noodle collections.

## Request naming

- **Display name** (`name` field): Human-readable. Use title case. Examples: `Get Users`, `Create Post`, `Delete Comment`.
- **File name** (determines ID): Lowercase, hyphen-separated. Match the HTTP method and resource. Examples: `get-users.yml`, `create-post.yml`, `delete-comment.yml`.
- **ID** = relative path minus `.yml`. File at `auth/login.yml` becomes ID `"auth/login"`.

Good file names:
```
users/get-users.yml          → ID: "users/get-users"
users/create-user.yml        → ID: "users/create-user"
users/update-user.yml        → ID: "users/update-user"
users/delete-user.yml        → ID: "users/delete-user"
```

Avoid generic names like `get.yml` or `post.yml` — they're ambiguous when reading a file list.

## Folder structure

- **Group by resource** (recommended): `users/`, `posts/`, `comments/`
- **Group by domain** (large APIs): `billing/`, `identity/`, `catalog/`
- **Max depth 3**: `domain/resource/request.yml`. Deeper nesting is hard to navigate.
- **Shared auth**: Put auth overrides in a specific folder's `folder.yml` or repeat auth on root-level requests. Root-level `folder.yml` is ignored.

## Environment conventions

- Name env files after deployment stages: `development.env`, `staging.env`, `production.env`
- Always include `_color` as first line. Use `success` for production, `warning` for staging, `info` for development.
- Never commit real secrets to env files. Use placeholder values and override locally.
- Keep all env files in sync — every env should declare the same set of variable names (different values).
- Comment out (`#`) variables that don't apply to a specific environment, don't delete them.

## Auth conventions

- **Prefer `inherit`**: Requests should use `type: inherit` and get auth from a parent folder. Don't repeat auth config on every request.
- **Root folder** is the right place for auth overrides that apply to the whole collection.
- **Only use `type: none`** (omit auth field) for truly unauthenticated endpoints.

## Headers conventions

- Use folder overrides for repeated headers (`X-API-Key`, `Authorization`).
- Use per-request headers for content-specific headers (`Content-Type`, `Accept`).
- Disabled headers have `enabled: false`. Remove them instead of disabling — disabled headers are noise.

## Body conventions

- `body_type: json` for JSON APIs. Use `|`-` or `|-` for multi-line strings.
- `body_type: urlencoded` for form submissions.
- `body_type: multipart` with `form_data` for file uploads.
- `body_type: binary` with `file_path` for raw binary uploads.
- `body_type: none` for GET/DELETE/HEAD requests without a body.

## Method usage

| Operation | Method |
|-----------|--------|
| Read (list) | GET |
| Read (single) | GET |
| Create | POST |
| Replace | PUT |
| Update (partial) | PATCH |
| Delete | DELETE |
| Headers only | HEAD |
| Preflight/options | OPTIONS |

## File organization in collection root

```
my-collection/
├── settings.yml              # default environment
├── folder.yml                # (optional) root-level auth/header overrides
├── get-health.yml             # ungrouped requests at root (flat)
├── users/
│   ├── folder.yml
│   ├── get-users.yml
│   └── create-user.yml
├── posts/
│   ├── folder.yml
│   ├── get-posts.yml
│   └── create-post.yml
├── .environments/
│   ├── development.env
│   └── production.env
└── .noodle/                   # managed by noodle, don't touch
    ├── last-request
    ├── expanded-folders
    └── ui-state/
```
