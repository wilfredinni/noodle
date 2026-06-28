import { RGBA } from "@opentui/core"
import type { ReactNode } from "react"
import { useTheme } from "./theme"

export interface OverlayProps {
  visible: boolean
  width: number
  children: ReactNode
  height?: number | string
  padding?: number
  gap?: number
  overflow?: "hidden" | "visible"
}

export function Overlay({
  visible,
  width,
  children,
  height,
  padding,
  gap,
  overflow,
}: OverlayProps) {
  const theme = useTheme()

  if (!visible) return null

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: RGBA.fromInts(0, 0, 0, 150),
        flexDirection: "column",
      }}
    >
      <box
        style={{
          width,
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
    </box>
  )
}
