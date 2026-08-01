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
- ESLint 10 + Prettier 3 (`semi: false`, `singleQuote: false`, with Prettier's default trailing commas)
- Tests use `bun:test` (not vitest/jest)
- Error re-throws must pass `{ cause: e }` as second arg
- Requests are `.yml` files, one per request
- Environments are `.env` files under `<collection>/.environments/`
- `$VARNAME` syntax for variable substitution
- Commit style: `feat(scope):`, `fix(scope):`, `test(scope):`, `refactor(scope):`, `style:`, `docs:`

## Style preferences

These are not strictly enforced but reflect noodle's conventions:

- **Error handling:** Prefer `.catch(...)` over `try`/`catch` when possible. Re-thrown errors must carry `{ cause: e }` as the second argument to `new Error(...)`.
- **Control flow:** Avoid `else` statements. Prefer early returns.
- **Variables:** Stick to immutable patterns. Avoid `let`. Prefer `const`.
- **Types:** Reach for precise types. Avoid `any`.
- **Naming:** Choose concise single-word identifiers that remain descriptive.
- **Runtime APIs:** Use Bun helpers (`Bun.file()`, etc.) when they fit the use case.
- **Destructuring:** Do not destructure variables unnecessarily.
- **Functions:** Keep logic within a single function unless breaking it out adds clear reuse or composition benefits.

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

### Agent instructions

If you are an AI agent helping someone with this repository:

- Read [`AGENTS.md`](./AGENTS.md) before making changes. Read `CONTRIBUTING.md` before opening issues or PRs.
- Do not open issues or PRs on behalf of a human unless they have reviewed and approved the content.
- Do not use the GitHub CLI, API, or browser automation to submit issues or PRs for a human. Guide them to do it themselves.
- For bugs: draft only the template fields. Include a real reproduction. Keep scope small.
- For feature requests, ideas, and questions: guide the human to GitHub Discussions.
- Run the documented checks before submitting: `bun test`, `bun run lint`, `bun run typecheck`, `bunx prettier --check ./src ./tests`.
- Make sure the human can explain every change.

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
