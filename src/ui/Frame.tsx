import { createContext, type ReactNode } from "react"
import {
  MouseButton,
  type BorderCharacters,
  type MouseEvent,
} from "@opentui/core"

export const FrameInteractionContext = createContext(false)

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
  onInteraction?: () => void
  onMouseDrag?: (event: MouseEvent) => void
  onMouseUp?: (event: MouseEvent) => void
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
  onInteraction,
  onMouseDrag,
  onMouseUp,
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
      onMouseDrag={onMouseDrag}
      onMouseUp={onMouseUp}
      onMouseDown={
        onPaneFocus
          ? (event) => {
              if (event.button !== MouseButton.LEFT) return
              onInteraction?.()
              onPaneFocus()
            }
          : onInteraction
            ? (event) => {
                if (event.button === MouseButton.LEFT) onInteraction()
              }
            : undefined
      }
    >
      <FrameInteractionContext.Provider value={onInteraction !== undefined}>
        {children}
      </FrameInteractionContext.Provider>
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
