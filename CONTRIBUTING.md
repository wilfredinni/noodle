# Contributing to noodle

Noodle is a terminal REST client. Inspect, send, and iterate on HTTP requests from YAML files on disk.

This guide exists to keep noodle focused and to make it easy for you to contribute effectively.

## What gets merged

- Bug fixes
- HTTP/auth improvements (new auth types, body formats, param handling)
- Environment variable features and substitution fixes
- Import improvements (OpenAPI, Postman)
- CLI automation improvements
- Documentation improvements
- Performance fixes

For UI changes, interaction patterns, new panes, or product-direction changes: start a discussion first. Noodle is opinionated about how the TUI looks, feels, and works.

## Issue-first policy

All PRs must reference an open issue. Before writing code, open a bug report or feature request so maintainers can triage.

- `fix:` PRs → bug report issue
- `feat:` PRs → feature request issue
- `docs:`, `chore:`, `refactor:` → open a brief issue for context

PRs without a linked issue may be closed without review.

## First-time contributors

Before opening your first PR, comment on the issue you want to work on. A maintainer will acknowledge your intent to avoid duplicate work.

Keep it short. Write in your own voice. Do not paste AI-generated implementation plans.

## Development

```bash
git clone https://github.com/wilfredinni/noodle
cd noodle
bun install
bun run dev -- --collection ./collections --env development
```

### Run checks before submitting

```bash
bun test                              # ~1180 tests across 73 suites
bun run lint                          # eslint
bun run typecheck                     # tsc --noEmit
bunx prettier --check ./src ./tests   # format check
```

### Architecture overview

```
src/
├── schema/        # Types: Method, Auth, Request, Collection, Response, Environment
├── lang/          # YAML request language: parse + serialize
├── filestore/     # Disk I/O for collections
├── env/           # Environment file I/O
├── requests/      # Request executor + $var substitution
├── hooks/         # React hooks
├── converters/    # OpenAPI / Postman importers
├── app/           # CLI args, entry point
└── ui/            # React components, hooks, themes
```

Noodle uses [OpenTUI](https://github.com/anomius/opentui) (`@opentui/react`) for terminal rendering. JSX renders to a TUI. This is not standard React DOM. Read `.agents/skills/opentui/SKILL.md` before working on UI code.

Key conventions:
- TypeScript 6, strict mode, `"type": "module"`
- ESLint 10 + Prettier 3 (`semi: false`, `singleQuote: false`, no trailing commas)
- Tests use `bun:test` (not vitest/jest)
- Error re-throws must pass `{ cause: e }` as second arg
- Requests are `.yml` files, one per request
- Environments are `.env` files under `<collection>/.environments/`
- `$VARNAME` syntax for variable substitution
- Commit style: `feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `style:`, `docs:`

## Before submitting a PR

- `bun test` must pass
- `bun run lint` must pass
- `bun run typecheck` must pass
- `bunx prettier --check ./src ./tests` must pass
- Keep PRs small and focused. One concern per PR.
- Do not update docs/, CONTRIBUTING.md, or AGENTS.md for normal PRs
- Reference the issue in the PR description with `Closes #<number>`

## AI-assisted contributions

Using AI to write code is fine. Submitting code you do not understand is not. Keep PR descriptions short and in your own words. AI-generated walls of text will be ignored.

If you are an AI agent helping with this repository, read `AGENTS.md` first. Do not open issues or PRs on behalf of a human unless they have reviewed and approved the content.

## PR titles

Follow conventional commit format matching noodle's existing style:

- `feat:` new feature or functionality
- `fix:` bug fix
- `docs:` documentation changes
- `chore:` maintenance, dependency updates
- `refactor:` code change without behavior change
- `test:` adding or updating tests

Optionally include scope: `fix(filestore):`, `feat(env):`

## Questions?

Open a [GitHub Discussion](https://github.com/wilfredinni/noodle/discussions).
