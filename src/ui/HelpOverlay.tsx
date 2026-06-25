import { getHelpSections } from "./helpTexts"
import { useTheme } from "./theme"

export function HelpOverlay({ visible }: { visible: boolean }) {
  const theme = useTheme()

  if (!visible) return null

  const sections = getHelpSections()

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <box
        style={{
          border: true,
          borderColor: theme.primary,
          flexDirection: "column",
          padding: 1,
          gap: 1,
        }}
        title="▸ Keybindings"
      >
        {sections.map((section) => (
          <box key={section.title} style={{ flexDirection: "column" }}>
            <text fg={theme.primary}>{section.title}</text>
            {section.keys.map((k, i) => (
              <text key={i} fg={theme.text}>
                {k.key}
                {"  "}
                {k.description}
              </text>
            ))}
          </box>
        ))}
      </box>
    </box>
  )
}
