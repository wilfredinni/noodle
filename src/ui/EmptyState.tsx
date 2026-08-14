import { MouseButton, type ASCIIFontName } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { useState } from "react"
import type { BorderPreset } from "./borders"
import { contrastOnSecondary, useTheme } from "./theme"

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
  const [hovered, setHovered] = useState(false)
  const actionTextColor = hovered
    ? contrastOnSecondary(theme)
    : actionActive
      ? theme.secondary
      : theme.text
  const actionBackgroundColor = hovered
    ? theme.secondary
    : actionActive
      ? theme.backgroundElement
      : undefined

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
        <box
          id="empty-state-action"
          paddingLeft={1}
          paddingRight={1}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onAction()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          style={{
            backgroundColor: actionBackgroundColor,
          }}
        >
          <text fg={actionTextColor}>{actionLabel}</text>
        </box>
      </box>
    </box>
  )
}
