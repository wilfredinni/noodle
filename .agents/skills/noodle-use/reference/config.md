# Config files

Noodle's global config lives at `~/.config/noodle/`. Two files:

## config.yml

User preferences for TUI appearance:

```yaml
theme: nord
layout: stacked
```

**theme**: One of the built-in theme names. Themes control colors and styling in the TUI. The full list:
`default`, `monokai`, `solarized`, `solarized-light`, `dracula`, `nord`, `gruvbox`, `one-dark`, `github`, `github-light`, `tokyo-night`, `catppuccin`, `catppuccin-latte`, `everforest`, `everforest-light`, `rose-pine`, `rose-pine-moon`, `rose-pine-dawn`, `kanagawa`, `kanagawa-wave`, `kanagawa-lotus`, `ayu-dark`, `ayu-mirage`, `ayu-light`, `night-owl`, `night-owl-light`, `palenight`, `oceanic-next`, `cyanide`, `plastic`.

When reading/writing: validate the theme name against this list. Unknown themes cause noodle to fall back to `default`.

**layout**: `"stacked"` (vertical arrangement) or `"side-by-side"` (horizontal split).

## keybinds.yml

Override built-in TUI keybindings. All keys except `fixed` keys can be rebound:

```yaml
env_cycle: ctrl+u
command_palette: ctrl+p
```

### Available keybind IDs

**Global (always active, gated on `!helpVisible`):**
| ID | Default | Action |
|----|---------|--------|
| `focus_cycle` | `Tab` | Cycle focus (sidebar → request → response) |
| `focus_cycle_reverse` | `Shift+Tab` | Reverse cycle focus |
| `send_request` | `Ctrl+Return` | Send request |
| `save_request` | `Ctrl+S` | Save request to disk |
| `new_request` | `Ctrl+N` | New request |
| `clone_request` | `Ctrl+K` | Clone request |
| `delete_request` | `Ctrl+W` | Delete request |
| `env_cycle` | `Ctrl+U` | Cycle environment |
| `command_palette` | `Ctrl+P` | Open command palette |
| `toggle_layout` | `Ctrl+L` | Toggle layout |
| `toggle_focus_pane_expand` | `F2` | Expand/collapse focused pane |
| `toggle_help` | `F1` | Toggle help overlay |
| `theme_picker` | `Ctrl+T` | Open theme picker |
| `edit_request` | `Ctrl+E` | Edit request in overlay |
| `edit_request_yaml` | `Ctrl+Alt+E` | Edit request YAML in overlay |
| `copy_body` | `Ctrl+B` | Copy response body |
| `new_folder` | `Ctrl+Alt+N` | New folder |
| `open_env_editor` | `e` | Open environment editor |
| `quit` | `Ctrl+C` | Quit (copies selection first if text is selected) |

### Key syntax

Format: `modifier+key`. Supported modifiers: `ctrl`, `alt`, `shift`. Special characters: `tab`, `return`, `escape`, `space`, `backspace`, `up`, `down`, `left`, `right`, `f1`-`f12`, `delete`, `home`, `end`.

Examples: `ctrl+s`, `alt+enter`, `shift+tab`, `f1`, `ctrl+alt+n`.

### Reading keybinds.yml

Parse as YAML. Each key is a bind ID, each value is a key descriptor string. Unknown bind IDs are ignored. Invalid key descriptors fall back to default.

### Writing keybinds.yml

Serialize as YAML mapping. Only include overridden keys — don't write defaults. Use the exact keybind ID names from the table above.
