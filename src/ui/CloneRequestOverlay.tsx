import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { InputRenderable } from "@opentui/core"
import { Overlay } from "./Overlay"
import { useTheme } from "./theme"

export interface CloneRequestOverlayHandle {
  confirm: () => string | null
}

interface CloneRequestOverlayProps {
  visible: boolean
  initialName: string
}

export const CloneRequestOverlay = forwardRef<
  CloneRequestOverlayHandle,
  CloneRequestOverlayProps
>(function CloneRequestOverlay({ visible, initialName }, ref) {
  const theme = useTheme()
  const [name, setName] = useState(initialName)
  const [errorText, setErrorText] = useState<string | null>(null)
  const nameRef = useRef<InputRenderable | null>(null)

  useEffect(() => {
    if (visible) {
      setName(initialName)
      setErrorText(null)
      nameRef.current?.focus()
    }
  }, [visible, initialName])

  useImperativeHandle(ref, () => ({
    confirm: () => {
      if (name.trim() === "") {
        setErrorText("Request name is required")
        return null
      }
      setErrorText(null)
      return name
    },
  }))

  return (
    <Overlay visible={visible} width={58} padding={1} gap={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.primary}>Clone Request</text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box style={{ paddingX: 2, flexDirection: "column" }}>
        <text fg={theme.textMuted}>Request Name</text>
        <input
          ref={nameRef}
          value={name}
          placeholder="Request Name"
          onInput={setName}
          focused
          backgroundColor={theme.backgroundElement}
          focusedBackgroundColor={theme.borderSubtle}
          textColor={theme.text}
          cursorColor={theme.primary}
          placeholderColor={theme.textMuted}
        />
      </box>

      {errorText && <text fg={theme.error}>{errorText}</text>}

      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.primary}>^S</text>
        <text fg={theme.textMuted}>save</text>
        <text fg={theme.textMuted}> · </text>
        <text fg={theme.primary}>esc</text>
        <text fg={theme.textMuted}>close</text>
      </box>
    </Overlay>
  )
})
