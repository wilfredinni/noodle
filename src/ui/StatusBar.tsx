import { useTheme } from "./theme"

export interface StatusBarSections {
  left: string
  center: string
  right: string
}

export function statusBarText(envLabel: string): StatusBarSections {
  return {
    left: "[?] help",
    center: envLabel ? `● ${envLabel}` : "(no env)",
    right: "[s] send  [w] save  [t] theme",
  }
}

export function StatusBar({ envLabel }: { envLabel: string }) {
  const theme = useTheme()
  const sections = statusBarText(envLabel)

  return (
    <box
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text fg={theme.textMuted}>{sections.left}</text>
      <text fg={theme.info}>{sections.center}</text>
      <text fg={theme.textMuted}>{sections.right}</text>
    </box>
  )
}
