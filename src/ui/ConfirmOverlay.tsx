import { RGBA } from "@opentui/core"
import { useTheme } from "./theme"

export interface ConfirmOverlayProps {
  visible: boolean
  message: string
  selectedIndex: number
}

export function ConfirmOverlay({
  visible,
  message,
  selectedIndex: _selectedIndex,
}: ConfirmOverlayProps) {
  const theme = useTheme()

  if (!visible) return null

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
          width: 50,
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          gap: 1,
          padding: 2,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text fg={theme.text}>Confirm</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <text fg={theme.text}>{message}</text>
        <box
          style={{
            flexDirection: "row",
            alignSelf: "flex-end",
            gap: 1,
            paddingRight: 1,
          }}
        >
          <text fg={theme.primary}>Y</text>
          <text fg={theme.textMuted}>Confirm</text>
          <text fg={theme.textMuted}> · </text>
          <text fg={theme.primary}>N</text>
          <text fg={theme.textMuted}>Cancel</text>
        </box>
      </box>
    </box>
  )
}
