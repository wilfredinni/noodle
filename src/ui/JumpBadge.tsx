import { useTheme, contrastOnPrimary } from "./theme"
import { TextAttributes } from "@opentui/core"

export function JumpBadge({
  letter,
  style,
}: {
  letter: string
  style?: Record<string, unknown>
}) {
  const theme = useTheme()
  const bg = theme.primary
  const fg = contrastOnPrimary(theme)
  return (
    <box
      style={{
        position: "absolute",
        zIndex: 100,
        backgroundColor: bg,
        paddingLeft: 1,
        paddingRight: 1,
        ...style,
      }}
    >
      <text fg={fg} attributes={TextAttributes.BOLD}>
        {letter.toLowerCase()}
      </text>
    </box>
  )
}
