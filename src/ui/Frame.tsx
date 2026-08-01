import type { ReactNode } from "react"
import { MouseButton, type BorderCharacters } from "@opentui/core"

export interface FrameProps {
  children?: ReactNode
  titleLeft?: ReactNode
  titleRight?: ReactNode
  bottomRight?: ReactNode
  bottomLeft?: ReactNode
  style?: Record<string, unknown>
  border?: ("left" | "right" | "top" | "bottom")[]
  customBorderChars?: BorderCharacters
  borderColor?: string
  title?: string
  titleColor?: string
  titleAlignment?: "left" | "center" | "right"
  bottomTitle?: string
  bottomTitleAlignment?: "left" | "center" | "right"
  onPaneFocus?: () => void
}

export function Frame({
  children,
  titleLeft,
  titleRight,
  bottomRight,
  bottomLeft,
  style,
  border,
  customBorderChars,
  borderColor,
  title,
  titleColor,
  titleAlignment,
  bottomTitle,
  bottomTitleAlignment,
  onPaneFocus,
}: FrameProps) {
  return (
    <box
      style={style}
      border={border}
      customBorderChars={customBorderChars}
      borderColor={borderColor}
      title={title}
      titleColor={titleColor}
      titleAlignment={titleAlignment}
      bottomTitle={bottomTitle}
      bottomTitleAlignment={bottomTitleAlignment}
      onMouseDown={
        onPaneFocus
          ? (event) => {
              if (event.button === MouseButton.LEFT) onPaneFocus()
            }
          : undefined
      }
    >
      {children}
      {titleLeft ? (
        <box style={{ position: "absolute", top: -1, left: 2 }}>
          {titleLeft}
        </box>
      ) : null}
      {titleRight ? (
        <box style={{ position: "absolute", top: -1, right: 2 }}>
          {titleRight}
        </box>
      ) : null}
      {bottomLeft ? (
        <box style={{ position: "absolute", bottom: -1, left: 2 }}>
          {bottomLeft}
        </box>
      ) : null}
      {bottomRight ? (
        <box style={{ position: "absolute", bottom: -1, right: 2 }}>
          {bottomRight}
        </box>
      ) : null}
    </box>
  )
}
