import type { Theme } from "./theme"

export function Checkbox({
  checked,
  theme,
}: {
  checked: boolean
  theme: Theme
}) {
  return (
    <text fg={checked ? theme.primary : theme.textMuted}>
      {checked ? "[x] " : "[ ] "}
    </text>
  )
}
