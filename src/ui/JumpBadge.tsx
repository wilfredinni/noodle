import { useTheme, contrastOnSecondary } from "./theme"
import { TextAttributes } from "@opentui/core"

export const JUMP_BADGE_TOP_LEFT: Record<string, unknown> = { top: -1, left: 0 }
export const JUMP_BADGE_TOP_INDENT: Record<string, unknown> = {
  top: -1,
  left: 2,
}

export function JumpBadge({
  letter,
  style,
}: {
  letter: string
  style?: Record<string, unknown>
}) {
  const theme = useTheme()
  const bg = theme.secondary
  const fg = contrastOnSecondary(theme)
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
