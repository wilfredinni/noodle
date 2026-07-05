import type { BindingCommandMap } from "@opentui/keymap/extras"

export interface KeybindDefinition {
  default: string
  description: string
  fixed: boolean
}

function keybind(
  value: string,
  description: string,
  fixed = false,
): KeybindDefinition {
  return { default: value, description, fixed }
}

export const Definitions = {
  request_send: keybind("ctrl+return", "Send request"),
  request_save: keybind("ctrl+s", "Save request to disk"),
  env_cycle: keybind("ctrl+p", "Cycle environment"),
  request_new: keybind("ctrl+n", "New request"),
  folder_new: keybind("ctrl+alt+n", "New folder"),
  request_clone: keybind("ctrl+k", "Clone request"),
  request_delete: keybind("ctrl+w", "Delete request"),
  env_editor: keybind("e", "Open environment editor"),
  help_toggle: keybind("f1", "Toggle help overlay"),
  theme_picker: keybind("ctrl+t", "Open theme picker"),
  browse_delete: keybind("ctrl+d", "Revert field"),
  browse_revert_all: keybind("ctrl+r", "Revert all fields"),
  global_undo_all: keybind("ctrl+z", "Undo all unsaved changes"),

  focus_next: keybind("tab", "Next pane", true),
  focus_prev: keybind("shift+tab", "Previous pane", true),
  layout_toggle: keybind("ctrl+l", "Toggle layout (stacked/side-by-side)"),
  pane_expand: keybind("f2", "Expand/collapse focused pane"),
  response_copy_body: keybind("ctrl+b", "Copy response body"),
  request_edit_yaml: keybind("ctrl+alt+e", "Edit request YAML"),
  request_edit_overlay: keybind("ctrl+e", "Edit request"),
  request_edit: keybind("return", "Enter edit-browse (request pane)", true),
  browse_up: keybind("up", "Cursor up (browse)", true),
  browse_down: keybind("down", "Cursor down (browse)", true),
  browse_left: keybind("left", "Previous field (browse)", true),
  browse_right: keybind("right", "Next field (browse)", true),
  browse_toggle_form_type: keybind("ctrl+t", "Toggle form entry text/file"),
  browse_enter: keybind("return", "Enter editing mode", true),
  browse_escape: keybind("escape", "Exit browse", true),
  edit_commit: keybind("return", "Commit edit", true),
  edit_cancel: keybind("escape", "Cancel edit", true),

  env_save: keybind("ctrl+s", "Save environment"),
  env_new: keybind("ctrl+n", "Create new environment"),
  env_clone: keybind("ctrl+k", "Clone environment"),
  env_delete: keybind("ctrl+w", "Delete environment"),
} satisfies Record<string, KeybindDefinition>

export type KeybindName = keyof typeof Definitions

export const CommandMap = {
  request_send: "request.send",
  request_save: "request.save",
  layout_toggle: "layout.toggle",
  pane_expand: "request.expand-toggle",
  response_copy_body: "response.copy-body",
  request_edit: "request.edit-enter",
  env_cycle: "env.cycle",
  env_editor: "env.editor-open",
  help_toggle: "app.help",
  theme_picker: "app.theme",
  request_edit_yaml: "request.edit-yaml",
  request_edit_overlay: "request.edit-overlay",
  request_new: "request.new",
  folder_new: "folder.new",
  request_clone: "request.clone",
  request_delete: "request.delete",
  focus_next: "focus.next",
  focus_prev: "focus.prev",
  browse_up: "browse.up",
  browse_down: "browse.down",
  browse_left: "browse.left",
  browse_right: "browse.right",
  browse_enter: "browse.enter",
  browse_escape: "browse.escape",
  browse_delete: "browse.delete",
  browse_revert_all: "browse.revert-all",
  global_undo_all: "global.undo-all",
  browse_toggle_form_type: "browse.toggle-form-type",
  edit_commit: "edit.commit",
  edit_cancel: "edit.cancel",
  env_save: "env.save",
  env_new: "env.new",
  env_clone: "env.clone",
  env_delete: "env.delete",
} satisfies BindingCommandMap

const AllNames = new Set(Object.keys(Definitions))

export type Keybinds = { [K in KeybindName]: string }
export type KeybindOverrides = Partial<Keybinds>

export function parseOverrides(overrides: Record<string, unknown>): Keybinds {
  const unknown = Object.keys(overrides).filter((k) => !AllNames.has(k))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown keybinding${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
    )
  }
  const result = {} as Record<string, string>
  for (const [name, def] of Object.entries(Definitions)) {
    if (def.fixed) {
      result[name] = def.default
    } else if (typeof overrides[name] === "string") {
      result[name] = overrides[name]
    } else {
      result[name] = def.default
    }
  }
  return result as Keybinds
}

export function bindingDefaults(): Keybinds {
  const result = {} as Record<string, string>
  for (const [name, def] of Object.entries(Definitions)) {
    result[name] = def.default
  }
  return result as Keybinds
}

export function displayKey(key: string): string {
  return key.replace(/^ctrl\+/, "^")
}
