import { getHelpSections } from "./helpTexts"
import { useTheme } from "./theme"
import { Overlay } from "./Overlay"
import type { Keybinds } from "./keybind"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useRef } from "react"

export function HelpOverlay({
  visible,
  keybinds,
}: {
  visible: boolean
  keybinds: Keybinds
}) {
  const theme = useTheme()
  const sections = getHelpSections(keybinds)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  return (
    <Overlay visible={visible} width={60} gap={1} padding={1}>
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
      <scrollbox
        ref={scrollRef}
        scrollY
        focused={visible}
        maxHeight={20}
        style={{ flexGrow: 1 }}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <box style={{ flexDirection: "column", gap: 1 }}>
          {sections.map((section) => (
            <box key={section.title} style={{ flexDirection: "column" }}>
              <box paddingLeft={4} paddingRight={4}>
                <text fg={theme.text}>{section.title}</text>
              </box>
              {section.keys.map((k, i) => (
                <box key={i} paddingLeft={4} paddingRight={4} style={{ flexDirection: "row" }}>
                  <text fg={theme.primary}>
                    {k.key.padEnd(11)}
                  </text>
                  <text fg={theme.textMuted}>{k.description}</text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </scrollbox>
    </Overlay>
  )
}
