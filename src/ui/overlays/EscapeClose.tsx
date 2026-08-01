import { MouseButton } from "@opentui/core"
import { useState } from "react"
import { useTheme } from "../theme"

export function EscapeClose({ onClose }: { onClose: () => void }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <box
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        onClose()
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: hovered ? theme.backgroundElement : undefined,
      }}
    >
      <text fg={hovered ? theme.text : theme.textMuted}>esc</text>
    </box>
  )
}
