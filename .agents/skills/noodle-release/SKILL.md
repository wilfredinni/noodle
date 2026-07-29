---
name: noodle-release
description: Prepare a Noodle release by inspecting changes since the latest tag, identifying affected README, AGENTS.md, skills, and noodle-site documentation, drafting source-backed updates, and validating them. Use for release preparation, documentation synchronization, skill updates, and public-surface review; never publish or tag.
---

# Noodle release preparation

Use this skill when the maintainer asks to prepare a Noodle release or synchronize public documentation after a set of changes.

## Workflow

1. Run `bun run release:context`. If the documentation checkout is not at `../noodle-site`, set `NOODLE_SITE_DIR` to its path.
2. Read the generated report before editing. Treat changed files, tests, and CLI help as evidence; do not infer unsupported behavior.
3. Read [the public-surface map](references/public-surface-map.md) and inspect the current target documents in both repositories.
4. Audit `src/ui/Tips.tsx` against current keybindings, commands, CLI behavior, and UI modes. Replace stale tips, remove duplicates, and add concise tips for evidence-backed user-facing behavior introduced since the prior release.
5. If update mechanism changed (update manifest, cache format, release asset structure), verify `noodle-site/public/update.json` schema, `noodle-site/netlify.toml` cache headers (target: `Cache-Control: s-maxage=300, stale-while-revalidate=600` for `/update.json`), release workflow ordering, and site installation docs are consistent.
6. Update only the affected README, `AGENTS.md`, skills, site pages, `src/ui/Tips.tsx`, and `CHANGELOG.md`. Preserve each repository's existing voice and examples. Do not modify blog posts or any files under `noodle-site/src/content/docs/blog/`.
7. Update `CHANGELOG.md` for the target version. Group evidence-backed changes under these exact headings when applicable: `### ✨ Features`, `### 🐞 Fixes`, and `### 🔧 Refactors`. Use `### 📚 Documentation` for documentation-only changes when applicable. Keep `Unreleased` at the top, include only changes since the previous release tag, and do not invent behavior.
8. For uncertain behavior, leave a review note instead of guessing.
9. Run `bun run release:check -- --tag <version>` and report failures with their command output.
10. Stop after the verified diff and review summary. Do not commit, tag, push, publish, or modify GitHub releases.

## Evidence rules

- Verify CLI syntax and options against the current CLI help and implementation.
- Verify examples against tests or a local smoke run when they are deterministic and do not require credentials or network access.
- Verify shortcut labels in `src/ui/Tips.tsx` against `src/ui/keybind.ts`; preserve `{key}` markup and identify any required focus or browse/edit mode.
- Keep tips concise, actionable, and limited to supported current behavior. Do not add a tip solely because an implementation detail changed.
- Describe export formats from their serializers and tests; do not promise support for fields the serializer drops.
- Treat overlays, focus, and event-propagation fixes as release-note candidates unless users must learn a new interaction.
- Do not update every skill by default. Update only skills whose workflows or supported behavior changed.
- The GitHub release body is generated from the matching `CHANGELOG.md` version section. Write it for release readers, not as a raw commit list.
- Preserve the exact emoji headings in the release body; GitHub supports the Unicode emojis from `CHANGELOG.md`.
