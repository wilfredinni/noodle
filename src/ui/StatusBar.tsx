import { useTheme } from "./theme"
import type { Keybinds } from "./keybind"

export interface StatusBarSections {
  left: string
  center: string
  right: string
}

export function statusBarText(
  envLabel: string,
  kb: Keybinds,
): StatusBarSections {
  return {
    left: `[${kb.help_toggle}] help`,
    center: envLabel ? `● ${envLabel}` : "(no env)",
    right: `[${kb.request_send}] send  [${kb.request_save}] save  [${kb.theme_picker}] theme`,
  }
}

export function StatusBar({
  envLabel,
  keybinds,
}: {
  envLabel: string
  keybinds: Keybinds
}) {
  const theme = useTheme()
  const sections = statusBarText(envLabel, keybinds)

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
