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
      ],
    },
    {
      title: "Editing",
      keys: [
        {
          key: displayKey(keybinds.request_edit_yaml),
          description: "Edit request YAML",
        },
        {
          key: keybinds.browse_enter,
          description: "Edit focused field · request browse",
        },
        { key: keybinds.edit_commit, description: "Commit edit" },
        {
          key: keybinds.browse_escape,
          description: "Cancel edit / exit browse",
        },
        {
          key: displayKey(keybinds.browse_delete),
          description: "Revert field",
        },
        { key: "space", description: "Toggle checkboxes" },
        {
          key: displayKey(keybinds.browse_revert_all),
          description: "Revert all fields",
        },
      ],
    },
    {
      title: "Actions",
      keys: [
        { key: displayKey(keybinds.request_send), description: "Send request" },
        { key: displayKey(keybinds.request_save), description: "Save to disk" },
        {
          key: displayKey(keybinds.env_editor),
          description: "Open environment editor",
        },
        {
          key: displayKey(keybinds.layout_toggle),
          description: "Toggle layout",
        },
        {
          key: displayKey(keybinds.env_cycle),
          description: "Cycle environment",
        },
        {
          key: displayKey(keybinds.request_new),
          description: "New request",
        },
        {
          key: displayKey(keybinds.request_clone),
          description: "Clone request",
        },
        {
          key: displayKey(keybinds.request_delete),
          description: "Delete request",
        },
        {
          key: displayKey(keybinds.pane_expand),
          description: "Expand/collapse focused pane",
        },
      ],
    },
    {
      title: "System",
      keys: [
        { key: "^c", description: "Quit" },
        { key: keybinds.help_toggle, description: "Toggle help" },
        {
          key: displayKey(keybinds.theme_picker),
          description: "Open theme picker",
        },
      ],
    },
    {
      title: "Env Editor",
      keys: [
        { key: displayKey(keybinds.env_save), description: "Save environment" },
        {
          key: displayKey(keybinds.env_new),
          description: "Create new environment",
        },
        {
          key: displayKey(keybinds.env_clone),
          description: "Clone environment",
        },
        {
          key: displayKey(keybinds.env_delete),
          description: "Delete environment",
        },
      ],
    },
  ]
}
