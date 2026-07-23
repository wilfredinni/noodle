import { TextAttributes } from "@opentui/core"
import pkg from "../../package.json" with { type: "json" }
import { useTheme } from "./theme"

export function HeaderBar() {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          Noodle
        </text>
        <text fg={theme.textMuted}>v{pkg.version}</text>
      </box>
    </box>
  )
}
