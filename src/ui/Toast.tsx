import { useEffect, useRef, useState } from "react"
import { useTheme } from "./theme"
import { PaneBorder } from "./borders"

type ToastVariant = "info" | "success" | "warning" | "error"

let showToastFn: ((message: string, variant?: ToastVariant) => void) | null = null

export function showToast(message: string, variant?: ToastVariant) {
  showToastFn?.(message, variant)
}

export function Toast() {
  const theme = useTheme()
  const [state, setState] = useState<{
    message: string
    variant: ToastVariant
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    showToastFn = (message: string, variant?: ToastVariant) => {
      setState({ message, variant: variant ?? "info" })
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setState(null), 5000)
    }
    return () => {
      showToastFn = null
    }
  }, [])

  if (!state) return null

  return (
    <box
      position="absolute"
      top={2}
      right={2}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor={theme.backgroundPanel}
      border={[...PaneBorder.border]}
      customBorderChars={PaneBorder.customBorderChars}
      borderColor={theme.primary}
    >
      <text fg={theme.text}>{state.message}</text>
    </box>
  )
}
