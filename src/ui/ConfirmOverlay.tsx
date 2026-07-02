import { useTheme } from "./theme"
import { Overlay } from "./Overlay"

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

  return (
    <Overlay visible={visible} width={50} gap={1} padding={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Confirm</text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box style={{ paddingX: 2, paddingBottom: 1 }}>
        <text fg={theme.text}>{message}</text>
      </box>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>y</text>
        <text fg={theme.textMuted}>confirm</text>
        <text fg={theme.textMuted}> · </text>
        <text fg={theme.text}>n</text>
        <text fg={theme.textMuted}>cancel</text>
      </box>
    </Overlay>
  )
}
