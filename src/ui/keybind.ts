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
  request_send: keybind("s", "Send request"),
  request_save: keybind("w", "Save request to disk"),
  env_prev: keybind("[", "Previous environment"),
  env_next: keybind("]", "Next environment"),
  help_toggle: keybind("?", "Toggle help overlay"),
  theme_picker: keybind("t", "Open theme picker"),
  browse_delete: keybind("d", "Revert field"),
  browse_revert_all: keybind("R", "Revert all fields"),

  focus_next: keybind("tab", "Next pane", true),
  focus_prev: keybind("shift+tab", "Previous pane", true),
  request_edit: keybind("return", "Enter edit-browse (request pane)", true),
  browse_up: keybind("up", "Cursor up (browse)", true),
  browse_down: keybind("down", "Cursor down (browse)", true),
  browse_left: keybind("left", "Previous field (browse)", true),
  browse_right: keybind("right", "Next field (browse)", true),
  browse_enter: keybind("return", "Enter editing mode", true),
  browse_escape: keybind("escape", "Exit browse", true),
  edit_commit: keybind("return", "Commit edit", true),
  edit_cancel: keybind("escape", "Cancel edit", true),
} satisfies Record<string, KeybindDefinition>

export type KeybindName = keyof typeof Definitions

export const CommandMap = {
  request_send: "request.send",
  request_save: "request.save",
  request_edit: "request.edit-enter",
  env_prev: "env.prev",
  env_next: "env.next",
  help_toggle: "app.help",
  theme_picker: "app.theme",
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
  edit_commit: "edit.commit",
  edit_cancel: "edit.cancel",
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

export function bindingDefaults(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, def] of Object.entries(Definitions)) {
    result[name] = def.default
  }
  return result
}
