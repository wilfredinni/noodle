export interface HelpKey {
  key: string
  description: string
}

export interface HelpSection {
  title: string
  keys: HelpKey[]
}

export function getHelpSections(): HelpSection[] {
  return [
    {
      title: "NAVIGATION",
      keys: [
        { key: "[↑/↓]", description: "Select request · sidebar" },
        { key: "[↑/↓]", description: "Move cursor (browse) · request" },
        { key: "[Tab]", description: "Next pane" },
        { key: "[Shift+Tab]", description: "Previous pane" },
        {
          key: "[Enter]",
          description: "Enter request edit-browse · request pane",
        },
      ],
    },
    {
      title: "EDITING",
      keys: [
        {
          key: "[Enter]",
          description: "Edit focused field · request browse",
        },
        { key: "[Enter]", description: "Commit edit" },
        { key: "[Esc]", description: "Cancel edit / exit browse" },
        { key: "[d]", description: "Revert field" },
        { key: "[R]", description: "Revert all fields" },
      ],
    },
    {
      title: "ACTIONS",
      keys: [
        { key: "[s]", description: "Send request" },
        { key: "[w]", description: "Save to disk" },
        { key: "[[ ]", description: "Previous environment" },
        { key: "[] ]", description: "Next environment" },
      ],
    },
    {
      title: "SYSTEM",
      keys: [
        { key: "[Ctrl+C]", description: "Quit" },
        { key: "[?]", description: "Toggle help" },
      ],
    },
  ]
}
