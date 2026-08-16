import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"

export interface ConfirmOverlayProps {
  visible: boolean
  message: string
  onConfirm?: () => void
  onCancel?: () => void
}

export function ConfirmOverlay({
  visible,
  message,
  onConfirm,
  onCancel,
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
        <EscapeClose onClose={() => onCancel?.()} />
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
        <ActionButton
          shortcut="y"
          label="confirm"
          onAction={() => onConfirm?.()}
        />
        <ActionButton
          shortcut="n"
          label="cancel"
          onAction={() => onCancel?.()}
        />
      </box>
    </Overlay>
  )
}
