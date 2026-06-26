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
  selectedIndex,
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
        <box style={{ flexDirection: "row", gap: 2, justifyContent: "center" }}>
          <box
            style={{
              backgroundColor:
                selectedIndex === 0 ? theme.primary : theme.backgroundElement,
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <text
              fg={
                selectedIndex === 0 ? theme.background : theme.textMuted
              }
            >
              [y] Confirm
            </text>
          </box>
          <box
            style={{
              backgroundColor:
                selectedIndex === 1 ? theme.primary : theme.backgroundElement,
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <text
              fg={
                selectedIndex === 1 ? theme.background : theme.textMuted
              }
            >
              [n] Cancel
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}
