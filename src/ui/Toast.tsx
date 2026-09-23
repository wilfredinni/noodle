import { useCallback, useEffect, useRef, useState } from "react"
import { stringWidth } from "bun"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"

type ToastVariant = "info" | "success" | "warning" | "error"

let showToastFn: ((message: string, variant?: ToastVariant) => void) | null =
  null

export function showToast(message: string, variant?: ToastVariant) {
  showToastFn?.(message, variant)
}

export function Toast() {
  const theme = useTheme()
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const [state, setState] = useState<{
    id: number
    message: string
    variant: ToastVariant
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dismissLater = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setState(null), 5000)
  }, [])

  useEffect(() => {
    const show = (message: string, variant?: ToastVariant) => {
      setState((previous) => ({
        id: (previous?.id ?? 0) + 1,
        message,
        variant: variant ?? "info",
      }))
      dismissLater()
    }
    showToastFn = show
    return () => {
      if (showToastFn === show) showToastFn = null
      clearTimeout(timerRef.current)
    }
  }, [dismissLater])

  if (!state) return null
  const inset = width <= 10 ? 0 : 2
  const paddingX = width <= 10 ? 1 : 2

  return createPortal(
    <scrollbox
      key={state.id}
      focusable={false}
      style={{
        position: "absolute",
        bottom: 2,
        right: inset,
        zIndex: 10003,
        width:
          state.message
            .split("\n")
            .reduce((width, line) => Math.max(width, stringWidth(line)), 0) +
          2 +
          paddingX * 2,
        maxWidth: Math.max(1, width - inset * 2),
        maxHeight: Math.max(1, height - 4),
      }}
      paddingLeft={paddingX}
      paddingRight={paddingX}
      paddingTop={height <= 10 ? 0 : 1}
      paddingBottom={height <= 10 ? 0 : 1}
      backgroundColor={theme.background}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={theme.primary}
      horizontalScrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        trackOptions: {
          backgroundColor: theme.background,
          foregroundColor: theme.primary,
        },
      }}
      onMouseOver={() => clearTimeout(timerRef.current)}
      onMouseOut={dismissLater}
    >
      <text fg={theme.text}>{state.message}</text>
    </scrollbox>,
    renderer.root,
    null,
  )
}
