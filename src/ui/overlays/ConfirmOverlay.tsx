import { MouseButton } from "@opentui/core"
import { useState } from "react"
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
  const [hoveredAction, setHoveredAction] = useState<
    "confirm" | "cancel" | null
  >(null)

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
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onConfirm?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("confirm")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "confirm" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>y</text>
          <text fg={theme.textMuted}> confirm</text>
        </box>
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onCancel?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("cancel")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "cancel" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>n</text>
          <text fg={theme.textMuted}> cancel</text>
        </box>
      </box>
    </Overlay>
  )
}
