import type { Keybinds } from "./keybind"
import { displayKey } from "./keybind"

export interface HelpKey {
  key: string
  description: string
}

export interface HelpSection {
  title: string
  keys: HelpKey[]
}

export function getHelpSections(keybinds: Keybinds): HelpSection[] {
  return [
    {
      title: "Navigation",
      keys: [
        { key: "↑/↓", description: "Select request · sidebar" },
        { key: "↑/↓", description: "Move cursor (browse) · request" },
        { key: keybinds.focus_next, description: "Next pane" },
        { key: keybinds.focus_prev, description: "Previous pane" },
        {
          key: keybinds.request_edit,
          description: "Enter request edit-browse · request pane",
        },
        {
          key: keybinds.request_edit_yaml,
          description: "Edit request YAML (sidebar)",
        },
      ],
    },
    {
      title: "Editing",
      keys: [
        {
          key: keybinds.browse_enter,
          description: "Edit focused field · request browse",
        },
        { key: keybinds.edit_commit, description: "Commit edit" },
        {
          key: keybinds.browse_escape,
          description: "Cancel edit / exit browse",
        },
        { key: keybinds.browse_delete, description: "Revert field" },
        {
          key: keybinds.browse_toggle,
          description: "Toggle header/param enabled",
        },
        {
          key: keybinds.browse_revert_all,
          description: "Revert all fields",
        },
      ],
    },
    {
      title: "Actions",
      keys: [
        { key: displayKey(keybinds.request_send), description: "Send request" },
        { key: displayKey(keybinds.request_save), description: "Save to disk" },
        { key: displayKey(keybinds.layout_toggle), description: "Toggle layout" },
        { key: displayKey(keybinds.env_prev), description: "Previous environment" },
        { key: displayKey(keybinds.env_next), description: "Next environment" },
      ],
    },
    {
      title: "System",
      keys: [
        { key: "^c", description: "Quit" },
        { key: keybinds.help_toggle, description: "Toggle help" },
      ],
    },
  ]
}
