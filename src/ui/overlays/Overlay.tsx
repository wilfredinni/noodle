import { MouseButton, RGBA } from "@opentui/core"
import { createPortal, useRenderer } from "@opentui/react"
import { useId, type ReactNode } from "react"
import { useTheme } from "../theme"
import {
  MODAL_BACKDROP_ID,
  paintModalResponseImage,
} from "../modalImageComposition"

export interface OverlayProps {
  visible: boolean
  width: number
  children: ReactNode
  onClose: () => void
  height?: number | `auto` | `${number}%`
  padding?: number
  gap?: number
  overflow?: "hidden" | "visible"
}

export function Overlay({
  visible,
  width,
  children,
  onClose,
  height,
  padding,
  gap,
  overflow,
}: OverlayProps) {
  const theme = useTheme()
  const renderer = useRenderer()
  const id = useId()

  if (!visible) return null

  return createPortal(
    <box
      id={`${MODAL_BACKDROP_ID}:${id}`}
      renderAfter={function (buffer) {
        paintModalResponseImage(renderer.root, buffer, this)
      }}
      onMouseDown={(event) => {
        if (
          event.button !== MouseButton.LEFT ||
          event.target !== event.currentTarget
        ) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        zIndex: 10000,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width,
          flexShrink: 0,
          ...(height !== undefined && { height }),
          backgroundColor: theme.backgroundPanel,
          flexDirection: "column",
          ...(padding !== undefined && { padding }),
          ...(gap !== undefined && { gap }),
          ...(overflow !== undefined && { overflow }),
        }}
      >
        {children}
      </box>
    </box>,
    renderer.root,
    null,
  )
}
