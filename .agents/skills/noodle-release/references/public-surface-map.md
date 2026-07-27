# Noodle public-surface map

Use this map to turn changed implementation areas into a focused release review.

| Changed area                                             | Review targets                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/`, `src/app/commands/`                          | `README.md`, `CHANGELOG.md`, `noodle-site` CLI reference, `noodle-use`                             |
| `src/schema/`, `src/lang/`, `src/filestore/`, `src/env/` | Collection/environment references and `noodle-use`                                                 |
| `src/ui/`, command-palette actions, keybindings, themes  | `CHANGELOG.md`, relevant site guides and `AGENTS.md`; screenshots only for material visual changes |
| Overlay/focus/event handling                             | `CHANGELOG.md` unless the documented interaction changes                                           |
| Install/update/release files                             | `CHANGELOG.md`, `README.md`, `noodle-site` installation docs, `noodle-site/public/update.json`, `noodle-site/netlify.toml` |
| `.agents/skills/`                                        | Skill instructions, examples, and the site AI-agent-skills guide                                   |
