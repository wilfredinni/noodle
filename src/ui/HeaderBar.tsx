import { TextAttributes } from "@opentui/core"
import pkg from "../../package.json" with { type: "json" }
import { useTheme } from "./theme"
import { type Keybinds, displayKey } from "./keybind"

export interface HeaderBarProps {
  collectionName?: string
  kb?: Keybinds
}

export function HeaderBar({ collectionName, kb }: HeaderBarProps) {
  const theme = useTheme()
  const keyHint = kb ? displayKey(kb.collection_switcher) : "^o"

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
        {collectionName ? (
          <>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              {collectionName}
            </text>
            <text fg={theme.textMuted}>·</text>
          </>
        ) : null}
        <text fg={theme.text}>{keyHint}</text>
        <text fg={theme.textMuted}>change collection</text>
      </box>
      <box style={{ flexDirection: "row", gap: 1, alignItems: "center" }}>
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          Noodle
        </text>
        <text fg={theme.textMuted}>v{pkg.version}</text>
      </box>
    </box>
  )
}
