import type { Theme } from "./theme"

export function Checkbox({
  checked,
  indeterminate = false,
  theme,
}: {
  checked: boolean
  indeterminate?: boolean
  theme: Theme
}) {
  return (
    <text fg={checked || indeterminate ? theme.primary : theme.textMuted}>
      {indeterminate ? "[-] " : checked ? "[x] " : "[ ] "}
    </text>
  )
}
