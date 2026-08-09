# Config files

Noodle's global config lives at `~/.config/noodle/`. Two files.

## config.yml

User preferences for TUI appearance, workspace management, and undo behavior:

```yaml
theme: catppuccin
layout: stacked
confirm_undo_all: true
collections:
  - /Users/me/Projects/noodle-api
  - /Users/me/Projects/other-api
proxy:
  mode: custom
  url: http://$PROXY_USER:$PROXY_PASSWORD@proxy.example:8080
  bypass: [localhost, .internal.example]
```

All fields are optional; missing fields use defaults.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | string | `"catppuccin"` | TUI theme name. Controls colors and styling. Noodle does NOT validate this value — it passes the string to OpenTUI, which falls back to its own default if unrecognized. Known theme names: `opencode`, `catppuccin`, `dracula`, `nord`, `tokyonight`, `gruvbox`, `ayu`, `monokai`, `solarized`, `onedark`, `aura`, `everforest`, `kanagawa`, `rosepine`, `material`, `carbonfox`, `synthwave84`, `catppuccin-frappe`, `catppuccin-macchiato`, `cobalt2`, `cursor`, `flexoki`, `github`, `matrix`, `mercury`, `nightowl`, `orng`, `osaka-jade`, `palenight`, `vercel`, `vesper`, `zenburn`. |
| `layout` | `"stacked"` \| `"side-by-side"` | `"stacked"` | Pane arrangement. `stacked` = vertical (sidebar top, request middle, response bottom). `side-by-side` = horizontal split. Invalid values fall back to `"stacked"`. |
| `confirm_undo_all` | boolean | `true` | Whether `Ctrl+R` (revert all request fields) shows a confirmation dialog before reverting. Set to `false` to skip the confirmation. |
| `collections` | string[] | `[]` | List of absolute paths to noodle collections. These appear in the workspace selector. Paths are resolved and normalized on load/save (duplicates and empty strings removed). Noodle prepends the current collection to this list when switching directories. TUI startup selects the first registered path that still exists, then falls back to `./collections`. |
| `proxy` | object | system proxy | Optional global policy: `system`, `off`, or `custom`. A custom policy needs an `http` or `https` URL and may include a string-array `bypass` list. Custom credentials may use active-environment `$VARNAME` values; literal credentials are rejected. |

## keybinds.yml

Use `noodle workspace audit --json` to inspect registered paths. Add `--fix` to remove entries that are missing, not directories, inaccessible, or no longer collection roots.

Override built-in TUI keybindings. All keys except `fixed` keys can be rebound:

```yaml
env_cycle: ctrl+u
command_palette: ctrl+p
```

### Available keybind IDs

Each entry shows: ID, default key, description, whether it's `fixed` (cannot be overridden).

| ID | Default | Description | Fixed |
|----|---------|-------------|-------|
| `request_send` | `Ctrl+Return` | Send request | yes |
| `request_save` | `Ctrl+S` | Save request to disk | no |
| `env_cycle` | `Ctrl+U` | Cycle active environment | no |
| `command_palette` | `Ctrl+P` | Open command palette | no |
| `collection_switcher` | `Ctrl+O` | Open collection switcher | no |
| `request_new` | `Ctrl+N` | New request | no |
| `folder_new` | `Ctrl+Alt+N` | New folder | no |
| `request_clone` | `Ctrl+K` | Clone request | no |
| `request_delete` | `Ctrl+W` | Delete request | no |
| `env_picker` | `e` | Open environment picker | no |
| `env_editor` | `F3` | Open environment editor | no |
| `settings_open` | `F4` | Open Settings | no |
| `help_toggle` | `F1` | Toggle help overlay | no |
| `theme_picker` | `Ctrl+T` | Open theme picker | no |
| `browse_delete` | `Ctrl+D` | Revert current field (browse mode) | no |
| `browse_revert_all` | `Ctrl+R` | Revert all fields (browse mode) | no |
| `global_undo_all` | `Ctrl+Z` | Undo all unsaved changes | no |
| `focus_next` | `Tab` | Next pane in focus cycle | yes |
| `focus_prev` | `Shift+Tab` | Previous pane in focus cycle | yes |
| `layout_toggle` | `Ctrl+L` | Toggle layout (stacked / side-by-side) | no |
| `pane_expand` | `F2` | Expand/collapse focused pane | no |
| `response_copy_body` | `Ctrl+B` | Copy response body to clipboard | no |
| `request_edit_yaml` | `Ctrl+Alt+E` | Edit request YAML in overlay | no |
| `request_edit_overlay` | `Ctrl+E` | Edit request in overlay | no |
| `env_save` | `Ctrl+S` | Save environment (env editor) | no |
| `env_new` | `Ctrl+N` | Create new environment (env editor) | no |
| `env_clone` | `Ctrl+K` | Clone environment (env editor) | no |
| `env_delete` | `Ctrl+W` | Delete environment (env editor) | no |

Browse/edit mode keys (`request_edit`, `browse_up`, `browse_down`, `browse_left`, `browse_right`, `browse_enter`, `browse_escape`, `edit_commit`, `edit_cancel`, `browse_toggle_form_type`) are all `fixed` and cannot be overridden. They are not listed in the table above — only keys usable in `keybinds.yml` are shown.

### Key syntax

Format: `modifier+key`. Supported modifiers: `ctrl`, `alt`, `shift`. Special characters: `tab`, `return`, `escape`, `space`, `backspace`, `up`, `down`, `left`, `right`, `f1`-`f12`, `delete`, `home`, `end`.

Examples: `ctrl+s`, `alt+enter`, `shift+tab`, `f1`, `ctrl+alt+n`.

### Reading keybinds.yml

Parse as YAML. Each key is a bind ID from the table above, each value is a key descriptor string. Unknown bind IDs cause `noodle` to throw — do NOT invent bind IDs. `fixed` keys are ignored even if included in the file.

### Writing keybinds.yml

Serialize as YAML mapping. Only include overridden non-fixed keys — don't write defaults. Use the exact keybind ID names from the table above. Example for a user who remaps env_cycle and command_palette:

```yaml
env_cycle: ctrl+e
command_palette: ctrl+p
```
