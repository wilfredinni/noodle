import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"
import { useTheme } from "../theme"

export interface NewFolderOverlayHandle {
  confirm: () => string | null
}

interface NewFolderOverlayProps {
  visible: boolean
  onConfirm?: () => void
  onClose?: () => void
}

export const NewFolderOverlay = forwardRef<
  NewFolderOverlayHandle,
  NewFolderOverlayProps
>(function NewFolderOverlay({ visible, onConfirm, onClose }, ref) {
  const theme = useTheme()
  const [name, setName] = useState("")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
  const nameRef = useRef<InputRenderable | null>(null)

  useEffect(() => {
    if (visible) {
      setName("")
      setErrorText(null)
      nameRef.current?.focus()
    }
  }, [visible])

  useImperativeHandle(ref, () => ({
    confirm: () => {
      if (name.trim() === "") {
        setErrorText("Folder name is required")
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
        <text fg={theme.text}>New Folder</text>
        <EscapeClose onClose={() => onClose?.()} />
      </box>

      <box style={{ paddingX: 2, flexDirection: "column", paddingBottom: 1 }}>
        <text fg={theme.textMuted}>Folder Name</text>
        <input
          ref={nameRef}
          value={name}
          placeholder="e.g. Users"
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
