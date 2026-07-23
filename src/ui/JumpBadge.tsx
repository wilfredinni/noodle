import { useTheme, contrastOnPrimary } from "./theme"

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
    <box style={{ position: "absolute", ...style }}>
      <box
        style={{
          backgroundColor: bg,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text fg={fg}>{letter.toUpperCase()}</text>
      </box>
    </box>
  )
}
