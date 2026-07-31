import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import { Overlay } from "./Overlay"
import { useTheme } from "../theme"

export interface CloneRequestOverlayHandle {
  confirm: () => string | null
}

interface CloneRequestOverlayProps {
  visible: boolean
  initialName: string
  onConfirm?: () => void
  onClose?: () => void
}

export const CloneRequestOverlay = forwardRef<
  CloneRequestOverlayHandle,
  CloneRequestOverlayProps
>(function CloneRequestOverlay(
  { visible, initialName, onConfirm, onClose },
  ref,
) {
  const theme = useTheme()
  const [name, setName] = useState(initialName)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
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
    <Overlay visible={visible} width={50} padding={1} gap={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>Clone Request</text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box style={{ paddingX: 2, flexDirection: "column", paddingBottom: 1 }}>
        <text fg={theme.textMuted}>Request Name</text>
        <input
          ref={nameRef}
          value={name}
          placeholder="e.g. Get Users"
          onInput={setName}
          focused
          backgroundColor={theme.backgroundElement}
          focusedBackgroundColor={theme.borderSubtle}
          textColor={theme.text}
          cursorColor={theme.primary}
          placeholderColor={theme.textMuted}
        />
      </box>

      {errorText && (
        <box style={{ paddingX: 2 }}>
          <text fg={theme.error}>{errorText}</text>
        </box>
      )}

      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 1,
          paddingX: 2,
        }}
      >
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onConfirm?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("save")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "save" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>^S</text>
          <text fg={theme.textMuted}> save</text>
        </box>
        <box
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onClose?.()
            event.preventDefault()
            event.stopPropagation()
          }}
          onMouseOver={() => setHoveredAction("close")}
          onMouseOut={() => setHoveredAction(null)}
          style={{
            flexDirection: "row",
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor:
              hoveredAction === "close" ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={theme.text}>esc</text>
          <text fg={theme.textMuted}> close</text>
        </box>
      </box>
    </Overlay>
  )
})
