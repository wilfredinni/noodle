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
    <Overlay visible={visible} width={50} gap={1} padding={2}>
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
    </Overlay>
  )
}
