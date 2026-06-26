import { RGBA } from "@opentui/core"
import { getHelpSections } from "./helpTexts"
import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"

export function HelpOverlay({
  visible,
  keybinds,
}: {
  visible: boolean
  keybinds: Keybinds
}) {
  const theme = useTheme()

  if (!visible) return null

  const sections = getHelpSections(keybinds)

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width: 60,
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          gap: 1,
          padding: 1,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <text fg={theme.text}>Keybindings</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box style={{ flexDirection: "column", gap: 1 }}>
          {sections.map((section) => (
            <box key={section.title} style={{ flexDirection: "column" }}>
              <box style={{ paddingLeft: 4, paddingRight: 4 }}>
                <text fg={theme.primary}>{section.title}</text>
              </box>
              {section.keys.map((k, i) => (
                <box key={i} style={{ paddingLeft: 4, paddingRight: 4 }}>
                  <text fg={theme.text}>
                    {k.key}
                    {"  "}
                    {k.description}
                  </text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
