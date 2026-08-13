import type { BindingCommandMap } from "@opentui/keymap/extras"
import type { KeyEvent } from "@opentui/core"

export type KeybindCategory =
  "Navigation" | "Request" | "Environment" | "Cookies" | "Workspace" | "System"

export type KeybindContext =
  | "main"
  | "request-browse"
  | "request-edit"
  | "folder"
  | "folder-browse"
  | "folder-edit"
  | "env-editor"
  | "env-browse"
  | "env-edit"
  | "cookie-jar"
  | "settings"

const EVERY_CONTEXT: readonly KeybindContext[] = [
  "main",
  "request-browse",
  "request-edit",
  "folder",
  "folder-browse",
  "folder-edit",
  "env-editor",
  "env-browse",
  "env-edit",
  "cookie-jar",
  "settings",
]

export interface KeybindDefinition {
  default: string
  description: string
  fixed: boolean
  category: KeybindCategory
  contexts: readonly KeybindContext[]
}

function keybind(
  value: string,
  description: string,
  fixed = false,
  category: KeybindCategory = "System",
  contexts: readonly KeybindContext[] = EVERY_CONTEXT,
): KeybindDefinition {
  return { default: value, description, fixed, category, contexts }
}

export const Definitions = {
  request_send: keybind("ctrl+return", "Send request", true, "Request", [
    "main",
    "request-browse",
    "request-edit",
  ]),
  request_save: keybind("ctrl+s", "Save request to disk", false, "Request", [
    "main",
    "request-browse",
    "folder",
  ]),
  env_cycle: keybind("ctrl+u", "Cycle environment", false, "Environment", [
    "main",
  ]),
  command_palette: keybind("ctrl+p", "Open command palette"),
  request_find: keybind("ctrl+f", "Find request", false, "Request", ["main"]),
  collection_switcher: keybind(
    "ctrl+o",
    "Open collection switcher",
    false,
    "Workspace",
  ),
  request_new: keybind("ctrl+n", "New request", false, "Request", [
    "main",
    "folder",
  ]),
  folder_new: keybind("ctrl+alt+n", "New folder", false, "Workspace", [
    "main",
    "folder",
  ]),
  request_clone: keybind("ctrl+k", "Clone request", false, "Request", [
    "main",
    "folder",
  ]),
  request_delete: keybind("ctrl+w", "Delete request", false, "Request", [
    "main",
    "folder",
    "settings",
  ]),
  env_picker: keybind("e", "Open environment picker", false, "Environment", [
    "main",
  ]),
  env_editor: keybind("f3", "Open environment editor", false, "Environment"),
  settings_open: keybind("f4", "Open settings"),
  help_toggle: keybind("f1", "Toggle help overlay"),
  theme_picker: keybind("ctrl+t", "Open theme picker", false, "System", [
    "main",
    "folder",
    "env-editor",
    "settings",
  ]),
  browse_delete: keybind("ctrl+d", "Revert field", false, "Request", [
    "request-browse",
    "folder-browse",
    "env-browse",
    "settings",
  ]),
  browse_revert_all: keybind("ctrl+r", "Revert all fields", false, "Request", [
    "request-browse",
    "folder-browse",
  ]),
  global_undo_all: keybind("ctrl+z", "Undo all unsaved changes"),
  jump_mode: keybind("g", "Enter jump mode", false, "Navigation"),

  focus_next: keybind("tab", "Next pane", true, "Navigation"),
  focus_prev: keybind("shift+tab", "Previous pane", true, "Navigation"),
  layout_toggle: keybind(
    "ctrl+l",
    "Toggle layout (stacked/side-by-side)",
    false,
    "Workspace",
  ),
  pane_expand: keybind(
    "f2",
    "Expand/collapse focused pane",
    false,
    "Workspace",
    ["main", "request-browse", "request-edit"],
  ),
  response_copy_body: keybind(
    "ctrl+b",
    "Copy response body",
    false,
    "Request",
    ["main"],
  ),
  response_query: keybind(
    "/",
    "Filter response with JSONPath",
    false,
    "Request",
    ["main"],
  ),
  request_edit_yaml: keybind(
    "ctrl+alt+e",
    "Edit request/folder YAML",
    false,
    "Request",
    ["main", "folder"],
  ),
  request_edit_overlay: keybind("ctrl+e", "Edit request", false, "Request", [
    "main",
  ]),
  request_edit: keybind(
    "return",
    "Enter edit-browse (request pane)",
    true,
    "Request",
    ["main", "folder"],
  ),
  browse_up: keybind("up", "Cursor up (browse)", true, "Navigation", [
    "request-browse",
    "folder-browse",
    "env-browse",
  ]),
  browse_down: keybind("down", "Cursor down (browse)", true, "Navigation", [
    "request-browse",
    "folder-browse",
    "env-browse",
  ]),
  browse_left: keybind("left", "Previous field (browse)", true, "Navigation", [
    "request-browse",
    "folder-browse",
  ]),
  browse_right: keybind("right", "Next field (browse)", true, "Navigation", [
    "request-browse",
    "folder-browse",
  ]),
  browse_toggle_form_type: keybind(
    "ctrl+t",
    "Toggle form entry text/file",
    false,
    "Request",
    ["request-browse"],
  ),
  browse_enter: keybind("return", "Enter editing mode", true, "Request", [
    "request-browse",
    "folder-browse",
    "env-browse",
  ]),
  browse_escape: keybind("escape", "Exit browse", true, "Navigation", [
    "request-browse",
    "folder-browse",
    "env-browse",
  ]),
  edit_commit: keybind("return", "Commit edit", true, "Request", [
    "request-edit",
    "folder-edit",
    "env-edit",
  ]),
  edit_cancel: keybind("escape", "Cancel edit", true, "Navigation", [
    "request-edit",
    "folder-edit",
    "env-edit",
  ]),

  env_save: keybind("ctrl+s", "Save environment", false, "Environment", [
    "env-editor",
    "env-browse",
    "env-edit",
  ]),
  env_secret: keybind("s", "Toggle environment secret", false, "Environment", [
    "env-browse",
  ]),
  env_reveal: keybind("r", "Reveal environment secret", false, "Environment", [
    "env-browse",
  ]),
  env_new: keybind("ctrl+n", "Create new environment", false, "Environment", [
    "env-editor",
  ]),
  env_clone: keybind("ctrl+k", "Clone environment", false, "Environment", [
    "env-editor",
  ]),
  env_delete: keybind("ctrl+w", "Delete environment", false, "Environment", [
    "env-editor",
  ]),
  cookie_delete: keybind("ctrl+w", "Delete cookie", false, "Cookies", [
    "cookie-jar",
  ]),
  cookie_delete_domain: keybind(
    "ctrl+d",
    "Delete cookies for domain",
    false,
    "Cookies",
    ["cookie-jar"],
  ),
  cookie_clear: keybind("ctrl+k", "Clear cookie jar", false, "Cookies", [
    "cookie-jar",
  ]),
  cookie_new: keybind("ctrl+n", "Add cookie", false, "Cookies", ["cookie-jar"]),
  cookie_copy: keybind("ctrl+b", "Copy cookie", false, "Cookies", [
    "cookie-jar",
  ]),
} satisfies Record<string, KeybindDefinition>

export type KeybindName = keyof typeof Definitions

export const CommandMap = {
  request_send: "request.send",
  request_save: "request.save",
  layout_toggle: "layout.toggle",
  pane_expand: "request.expand-toggle",
  response_copy_body: "response.copy-body",
  response_query: "response.query",
  request_edit: "request.edit-enter",
  env_cycle: "env.cycle",
  command_palette: "app.command-palette",
  request_find: "request.find",
  collection_switcher: "collection.switcher",
  env_picker: "env.picker-open",
  env_editor: "env.editor-open",
  settings_open: "app.settings-open",
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
  jump_mode: "jump.enter",
  browse_toggle_form_type: "browse.toggle-form-type",
  edit_commit: "edit.commit",
  edit_cancel: "edit.cancel",
  env_save: "env.save",
  env_secret: "env-browse.secret",
  env_reveal: "env-browse.reveal",
  env_new: "env.new",
  env_clone: "env.clone",
  env_delete: "env.delete",
  cookie_delete: "cookie.delete",
  cookie_delete_domain: "cookie.delete-domain",
  cookie_clear: "cookie.clear",
  cookie_new: "cookie.new",
  cookie_copy: "cookie.copy",
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

export function keybindOverrides(keybinds: Keybinds): KeybindOverrides {
  const overrides: KeybindOverrides = {}
  for (const name of Object.keys(Definitions) as KeybindName[]) {
    const definition = Definitions[name]
    if (!definition.fixed && keybinds[name] !== definition.default) {
      overrides[name] = keybinds[name]
    }
  }
  return overrides
}

export function findKeybindConflict(
  name: KeybindName,
  key: string,
  keybinds: Keybinds,
): KeybindName | null {
  const contexts = Definitions[name].contexts
  for (const other of Object.keys(Definitions) as KeybindName[]) {
    if (other === name || keybinds[other] !== key) continue
    if (
      Definitions[other].contexts.some((context) => contexts.includes(context))
    ) {
      return other
    }
  }
  return null
}

export function keyEventToBinding(
  event: Pick<
    KeyEvent,
    "name" | "ctrl" | "shift" | "option" | "meta" | "super" | "hyper"
  >,
): string | null {
  if (event.super || event.hyper) return null
  const name = event.name === "linefeed" ? "return" : event.name.toLowerCase()
  if (
    ["ctrl", "shift", "alt", "option", "meta", "super", "hyper"].includes(name)
  ) {
    return null
  }
  if (name === "escape" || (event.ctrl && name === "c")) return null
  const supportedName =
    name.length === 1 ||
    /^f(?:[1-9]|1[0-2])$/.test(name) ||
    [
      "return",
      "tab",
      "space",
      "backspace",
      "delete",
      "up",
      "down",
      "left",
      "right",
      "home",
      "end",
      "pageup",
      "pagedown",
    ].includes(name)
  if (!supportedName) return null
  const modifiers = [
    event.ctrl ? "ctrl" : null,
    event.option || event.meta ? "alt" : null,
    event.shift ? "shift" : null,
  ].filter((value): value is string => value !== null)
  const binding = [...modifiers, name].join("+")
  if (
    ["ctrl+c", "ctrl+g", "ctrl+shift+z", "shift+return", "f5", "f6"].includes(
      binding,
    )
  ) {
    return null
  }
  return binding
}
