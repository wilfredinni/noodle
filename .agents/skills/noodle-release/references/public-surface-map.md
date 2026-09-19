# Noodle public-surface map

Use this map to turn changed implementation areas into a focused release review.

| Changed area                                             | Review targets                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`, `src/app/commands/`                          | `README.md`, `CHANGELOG.md`, `noodle-site` CLI reference, `noodle-use`                                                     |
| `src/schema/`, `src/lang/`, `src/filestore/`, `src/env/` | Collection/environment references and `noodle-use`                                                                         |
| `src/ui/`, command-palette actions, keybindings, themes  | `CHANGELOG.md`, relevant site guides, `AGENTS.md`, and `src/ui/Tips.tsx`; screenshots only for material visual changes     |
| Overlay/focus/event handling                             | `CHANGELOG.md` unless the documented interaction changes                                                                   |
| `.github/workflows/`, `scripts/install.sh`, `scripts/install.ps1`, update/release code | `CHANGELOG.md`, `README.md`, `AGENTS.md`, `noodle-site` installation/CLI docs, `noodle-site/public/update.json`, `noodle-site/netlify.toml`, and the Homebrew tap |
| `.agents/skills/`                                        | Skill instructions, examples, and the site AI-agent-skills guide                                                           |
