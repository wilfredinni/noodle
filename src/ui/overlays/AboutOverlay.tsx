import { TextAttributes } from "@opentui/core"
import pkg from "../../../package.json" with { type: "json" }
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"

export function AboutOverlay({ visible }: { visible: boolean }) {
  const theme = useTheme()

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
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          About
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box style={{ flexDirection: "column", gap: 1, paddingX: 4 }}>
        <text fg={theme.text}>Noodle v{pkg.version}</text>
        <text fg={theme.textMuted}>
          Free, open-source REST client that runs entirely in your terminal.
        </text>
        <text>
          <a href="https://github.com/wilfredinni/noodle" fg={theme.primary}>
            GitHub
          </a>
          <span fg={theme.textMuted}> · </span>
          <a
            href="https://github.com/wilfredinni/noodle/releases"
            fg={theme.primary}
          >
            Releases
          </a>
          <span fg={theme.textMuted}> · </span>
          <a href="https://noodlerest.dev/" fg={theme.primary}>
            Website
          </a>
          <span fg={theme.textMuted}> · </span>
          <a href="https://noodlerest.dev/docs/" fg={theme.primary}>
            Docs
          </a>
        </text>
      </box>
    </Overlay>
  )
}
