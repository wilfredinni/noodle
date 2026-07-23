import type { ReactNode } from "react"
import type { BorderCharacters } from "@opentui/core"

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
    >
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
      {children}
    </box>
  )
}
