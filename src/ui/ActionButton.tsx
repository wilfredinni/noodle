import { MouseButton } from "@opentui/core"
import { stringWidth } from "bun"
import { useState } from "react"
import { contrastOnSecondary, useTheme } from "./theme"

export function ActionButton({
  id,
  label,
  shortcut,
  shortcutPosition = "left",
  paddingX = 1,
  minWidth,
  gap = 0,
  active = true,
  disabled = false,
  onAction,
  onHover,
}: {
  id?: string
  label: string
  shortcut?: string
  shortcutPosition?: "left" | "right"
  paddingX?: number
  minWidth?: number
  gap?: number
  active?: boolean
  disabled?: boolean
  onAction: () => void
  onHover?: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const enabled = !disabled
  const highlighted = enabled && (hovered || active)
  const naturalWidth =
    paddingX * 2 +
    stringWidth(label) +
    (shortcut ? stringWidth(shortcut) + 1 : 0)
  const shortcutColor = disabled
    ? theme.border
    : hovered
      ? contrastOnSecondary(theme)
      : active
        ? theme.secondary
        : theme.text
  const labelColor = shortcut
    ? disabled
      ? theme.border
      : hovered
        ? contrastOnSecondary(theme)
        : theme.textMuted
    : shortcutColor

  return (
    <box
      id={id}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT || disabled) return
        onAction()
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseOver={() => {
        if (!enabled) return
        setHovered(true)
        onHover?.()
      }}
      onMouseOut={() => setHovered(false)}
      style={{
        flexDirection: "row",
        flexShrink: 0,
        width:
          shortcutPosition === "left"
            ? Math.max(minWidth ?? 0, naturalWidth)
            : undefined,
        minWidth: shortcutPosition === "right" ? minWidth : undefined,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        gap,
        backgroundColor: highlighted
          ? hovered
            ? theme.secondary
            : theme.backgroundElement
          : undefined,
      }}
    >
      {shortcutPosition === "right" ? (
        <>
          <text fg={labelColor}>{label}</text>
          <box flexGrow={1} />
          {shortcut && <text fg={shortcutColor}>{shortcut}</text>}
        </>
      ) : (
        <>
          {shortcut && <text fg={shortcutColor}>{shortcut}</text>}
          <text fg={labelColor}>{shortcut ? ` ${label}` : label}</text>
        </>
      )}
    </box>
  )
}
