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
          key: keybinds.jump_mode,
          description: "Jump mode: show hint, press letter to focus",
        },
      ],
    },
    {
      title: "Request Editing",
      keys: [
        {
          key: displayKey(keybinds.request_edit_overlay),
          description: "Edit request",
        },
        {
          key: displayKey(keybinds.request_edit_yaml),
          description: "Edit YAML",
        },
        {
          key: keybinds.browse_escape,
          description: "Cancel edit / exit browse",
        },
        {
          key: displayKey(keybinds.browse_delete),
          description: "Revert field / delete Automation row",
        },
        { key: "space", description: "Toggle checkboxes" },
        {
          key: displayKey(keybinds.browse_revert_all),
          description: "Revert all fields",
        },
        {
          key: displayKey(keybinds.browse_toggle_form_type),
          description: "Toggle form entry type",
        },
      ],
    },
    {
      title: "Code Editor",
      keys: [
        { key: "^g", description: "Toggle fold at cursor" },
        { key: "f5", description: "Fold all" },
        { key: "f6", description: "Unfold all" },
      ],
    },
    {
      title: "Actions",
      keys: [
        {
          key: `${displayKey(keybinds.request_send)} / ^j`,
          description: "Send request",
        },
        { key: displayKey(keybinds.request_save), description: "Save to disk" },
        {
          key: displayKey(keybinds.env_picker),
          description: "Open environment picker",
        },
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
        {
          key: displayKey(keybinds.folder_new),
          description: "New folder",
        },
        {
          key: displayKey(keybinds.response_copy_body),
          description: "Copy response body",
        },
        {
          key: displayKey(keybinds.response_query),
          description: "Filter response with JSONPath",
        },
      ],
    },
    {
      title: "System",
      keys: [
        { key: "^c", description: "Quit" },
        {
          key: displayKey(keybinds.command_palette),
          description: "Open command palette",
        },
        {
          key: displayKey(keybinds.settings_open),
          description: "Open settings",
        },
        { key: keybinds.help_toggle, description: "Toggle help" },
        {
          key: displayKey(keybinds.theme_picker),
          description: "Open theme picker",
        },
        {
          key: displayKey(keybinds.collection_switcher),
          description: "Switch collection",
        },
        {
          key: displayKey(keybinds.request_find),
          description: "Find request",
        },
        {
          key: displayKey(keybinds.global_undo_all),
          description: "Undo all unsaved changes",
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
    {
      title: "Cookie Jar",
      keys: [
        {
          key: displayKey(keybinds.cookie_new),
          description: "Add cookie",
        },
        {
          key: displayKey(keybinds.cookie_edit),
          description: "Edit selected cookie",
        },
        { key: "Enter", description: "Expand selected cookie" },
        {
          key: displayKey(keybinds.cookie_copy),
          description: "Copy selected cookie",
        },
        {
          key: displayKey(keybinds.cookie_delete),
          description: "Delete selected domain",
        },
        {
          key: displayKey(keybinds.cookie_delete_domain),
          description: "Delete selected cookie",
        },
        {
          key: displayKey(keybinds.cookie_clear),
          description: "Clear cookie jar",
        },
      ],
    },
  ]
}
