import { MouseButton } from "@opentui/core"
import { useState, type ReactNode } from "react"
import { LeftBar } from "../borders"
import { useTheme } from "../theme"

export function SettingsField({
  id,
  title,
  description,
  error,
  active = false,
  border = true,
  alignItems = "center",
  stacked = false,
  children,
  onMouseDown,
}: {
  id?: string
  title: string
  description?: string
  error?: string
  active?: boolean
  border?: boolean
  alignItems?: "center" | "flex-start"
  stacked?: boolean
  children: ReactNode
  onMouseDown?: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <box style={{ flexDirection: "column", width: "100%" }}>
      <box
        id={id}
        border={border ? [...LeftBar.border] : undefined}
        customBorderChars={border ? LeftBar.customBorderChars : undefined}
        borderColor={
          border ? (active ? theme.primary : theme.borderSubtle) : undefined
        }
        style={{
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "stretch" : alignItems,
          width: "100%",
          minWidth: 0,
          backgroundColor:
            active || hovered ? theme.backgroundElement : undefined,
        }}
        onMouseDown={
          onMouseDown
            ? (event) => {
                if (event.button !== MouseButton.LEFT) return
                onMouseDown()
                event.stopPropagation()
              }
            : undefined
        }
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <text fg={theme.text} style={{ flexShrink: 0 }}>
          {title}:{" "}
        </text>
        <box
          style={{
            flexDirection: "row",
            alignItems: "center",
            width: stacked ? "100%" : undefined,
            flexGrow: 1,
            minWidth: 0,
          }}
        >
          {children}
        </box>
      </box>
      {description && (
        <text fg={theme.textMuted} wrapMode="word">
          {description}
        </text>
      )}
      {error && (
        <text fg={theme.error} wrapMode="word">
          {error}
        </text>
      )}
    </box>
  )
}
