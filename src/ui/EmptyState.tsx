import { type ASCIIFontName } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import type { BorderPreset } from "./borders"
import { useTheme } from "./theme"
import { ActionButton } from "./ActionButton"

export interface EmptyStateProps {
  title?: string
  message: string
  subtitle?: string
  font?: ASCIIFontName
  border?: BorderPreset
  actionActive?: boolean
  actionLabel?: string
  onAction: () => void
}

export function EmptyState({
  title,
  message,
  subtitle,
  font = "block",
  border,
  actionActive = false,
  actionLabel = message,
  onAction,
}: EmptyStateProps) {
  const theme = useTheme()
  const keymap = useKeymap()

  useKeyboard((key) => {
    if (keymap.getData("app.overlay") !== "none") return
    if (key.name !== "return" && key.name !== "space") return

    key.preventDefault()
    onAction()
  })

  return (
    <box
      id="empty-state"
      style={{
        alignItems: "center",
        flexGrow: 1,
        justifyContent: "center",
        minHeight: 0,
        width: "100%",
      }}
      border={border ? [...border.border] : undefined}
      customBorderChars={border?.customBorderChars}
      borderColor={border ? theme.primary : undefined}
    >
      <box
        style={{
          alignItems: "center",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {title && (
          <ascii-font
            id="empty-state-title"
            text={title}
            font={font}
            color={theme.primary}
            selectable={false}
          />
        )}
        {subtitle && (
          <text id="empty-state-subtitle" fg={theme.text}>
            {subtitle}
          </text>
        )}
        <ActionButton
          id="empty-state-action"
          label={actionLabel}
          active={actionActive}
          onAction={onAction}
        />
      </box>
    </box>
  )
}
