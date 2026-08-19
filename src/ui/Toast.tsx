import { useEffect, useRef, useState } from "react"
import { createPortal, useRenderer } from "@opentui/react"
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
  const [state, setState] = useState<{
    message: string
    variant: ToastVariant
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const show = (message: string, variant?: ToastVariant) => {
      setState({ message, variant: variant ?? "info" })
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setState(null), 5000)
    }
    showToastFn = show
    return () => {
      if (showToastFn === show) showToastFn = null
      clearTimeout(timerRef.current)
    }
  }, [])

  if (!state) return null

  return createPortal(
    <box
      style={{
        position: "absolute",
        bottom: 2,
        right: 2,
        zIndex: 10003,
      }}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={theme.background}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={theme.primary}
    >
      <text fg={theme.text}>{state.message}</text>
    </box>,
    renderer.root,
    null,
  )
}
