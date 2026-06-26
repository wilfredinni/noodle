import type { Keybinds } from "./keybind"

export interface HelpKey {
  key: string
  description: string
}

export interface HelpSection {
  title: string
  keys: HelpKey[]
}

function bracket(v: string): string {
  return `[${v}]`
}

export function getHelpSections(keybinds: Keybinds): HelpSection[] {
  return [
    {
      title: "NAVIGATION",
      keys: [
        { key: "[↑/↓]", description: "Select request · sidebar" },
        { key: "[↑/↓]", description: "Move cursor (browse) · request" },
        { key: bracket(keybinds.focus_next), description: "Next pane" },
        { key: bracket(keybinds.focus_prev), description: "Previous pane" },
        {
          key: bracket(keybinds.request_edit),
          description: "Enter request edit-browse · request pane",
        },
      ],
    },
    {
      title: "EDITING",
      keys: [
        {
          key: bracket(keybinds.browse_enter),
          description: "Edit focused field · request browse",
        },
        { key: bracket(keybinds.edit_commit), description: "Commit edit" },
        {
          key: bracket(keybinds.browse_escape),
          description: "Cancel edit / exit browse",
        },
        { key: bracket(keybinds.browse_delete), description: "Revert field" },
        {
          key: bracket(keybinds.browse_revert_all),
          description: "Revert all fields",
        },
      ],
    },
    {
      title: "ACTIONS",
      keys: [
        { key: bracket(keybinds.request_send), description: "Send request" },
        { key: bracket(keybinds.request_save), description: "Save to disk" },
        { key: bracket(keybinds.layout_toggle), description: "Toggle layout" },
        { key: "[[ ]", description: "Previous environment" },
        { key: "[] ]", description: "Next environment" },
      ],
    },
    {
      title: "SYSTEM",
      keys: [
        { key: "[Ctrl+C]", description: "Quit" },
        { key: bracket(keybinds.help_toggle), description: "Toggle help" },
      ],
    },
  ]
}
