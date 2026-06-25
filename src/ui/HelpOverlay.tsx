import { getHelpSections } from "./helpTexts"

export function HelpOverlay({ visible }: { visible: boolean }) {
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
          borderColor: "#61dafb",
          flexDirection: "column",
          padding: 1,
          gap: 1,
        }}
        title="▸ Keybindings"
      >
        {sections.map((section) => (
          <box key={section.title} style={{ flexDirection: "column" }}>
            <text fg="#61dafb">{section.title}</text>
            {section.keys.map((k, i) => (
              <text key={i}>
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
