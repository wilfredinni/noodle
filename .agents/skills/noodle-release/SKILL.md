---
name: noodle-release
description: Prepare a versioned Noodle release by updating package.json, inspecting changes since the latest tag, auditing every repository-maintained skill, synchronizing affected README, AGENTS.md, tests, CHANGELOG.md, and noodle-site documentation, and running the release validation. Use for release preparation, documentation synchronization, skill updates, and public-surface review; never commit, tag, push, publish, or modify GitHub releases.
---

# Noodle release preparation

Use this skill when the maintainer asks to prepare a Noodle release or synchronize public documentation after a set of changes.

## Workflow

1. Normalize the requested release as package version `X.Y.Z` and tag `vX.Y.Z`. Reject missing, prerelease, or malformed versions instead of guessing.
2. Run `bun run release:context` before editing. If the documentation checkout is not at `../noodle-site`, set `NOODLE_SITE_DIR` to its path.
3. Read the generated report before editing. Treat changed files, tests, and CLI help as evidence; do not infer unsupported behavior.
4. Read [the public-surface map](references/public-surface-map.md) and inspect the current target documents in both repositories.
5. Set `package.json` to package version `X.Y.Z`. Search tracked source, tests, scripts, and public documentation for the previous product version; update only references that intentionally track the Noodle release. Do not rewrite unrelated protocol versions or semver fixtures.
6. Identify version-sensitive tests and fixtures from the implementation and the version search. Update those that intentionally assert the current Noodle version, then rely on the full release check to catch additional required changes.
7. Audit every repository-maintained skill under `.agents/skills/`, including `noodle-dev`, `noodle-use`, `noodle-release`, and `opentui`. For each skill, record either `changed` with the evidence-backed reason or `unchanged` with a concise reason. Do not edit a skill merely to make the audit show a change.
8. Audit `src/ui/Tips.tsx` against current keybindings, commands, CLI behavior, and UI modes. Replace stale tips, remove duplicates, and add concise tips for evidence-backed user-facing behavior introduced since the prior release.
9. If the update mechanism changed (update manifest, cache format, release asset structure), verify `noodle-site/public/update.json` schema, `noodle-site/netlify.toml` cache headers (target: `Cache-Control: s-maxage=300, stale-while-revalidate=600` for `/update.json`), release workflow ordering, and site installation docs are consistent.
10. Update only the affected README, `AGENTS.md`, skills, site pages, `src/ui/Tips.tsx`, tests, and `CHANGELOG.md`. Preserve each repository's existing voice and examples. Do not modify blog posts or any files under `noodle-site/src/content/docs/blog/`.
11. Update `CHANGELOG.md` for the target version. Immediately below the version/date heading, add a concise two- to three-sentence release summary that synthesizes the most important evidence-backed user-facing changes. Then group the detailed changes under these exact headings when applicable: `### ✨ Features`, `### 🐞 Fixes`, and `### 🔧 Refactors`. Use `### 📚 Documentation` for documentation-only changes when applicable. Keep `Unreleased` at the top, include only changes since the previous release tag, and do not invent behavior.
12. For uncertain behavior, leave a review note instead of guessing.
13. Run `bun run release:check -- --tag vX.Y.Z` and report failures with their command output. Fix only failures within release-preparation scope, rerun the affected check, and finish with the complete release check passing.
14. Stop after the verified diff and review summary. Report the target package version and tag, validation commands and results, remaining review notes, and the explicit changed/unchanged decision for every audited skill. Do not commit, tag, push, publish, or modify GitHub releases.

## Evidence rules

- Verify CLI syntax and options against the current CLI help and implementation.
- Verify examples against tests or a local smoke run when they are deterministic and do not require credentials or network access.
- Verify shortcut labels in `src/ui/Tips.tsx` against `src/ui/keybind.ts`; preserve `{key}` markup and identify any required focus or browse/edit mode.
- Keep tips concise, actionable, and limited to supported current behavior. Do not add a tip solely because an implementation detail changed.
- Describe export formats from their serializers and tests; do not promise support for fields the serializer drops.
- Treat overlays, focus, and event-propagation fixes as release-note candidates unless users must learn a new interaction.
- Do not update every skill by default. Update only skills whose workflows or supported behavior changed.
- The GitHub release body is generated from the matching `CHANGELOG.md` version section. Write it for release readers, not as a raw commit list.
- The release summary belongs between the version/date heading and the first detailed section. It should be concise, release-reader oriented, and must not introduce claims absent from the detailed entries.
- Use a separate release-note bullet for each unrelated change within a section. Keep a single bullet when multiple details form one cohesive user-facing capability; do not split merely to mirror individual commits.
- When an agent skill changes, add a separate `### 📚 Documentation` bullet for each changed skill; do not combine multiple skill updates into one entry.
- Preserve the exact emoji headings in the release body; GitHub supports the Unicode emojis from `CHANGELOG.md`.
