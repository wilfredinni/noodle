import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { type InputRenderable } from "@opentui/core"
import { isValidTag } from "../../tags"
import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface TagEditorOverlayHandle {
  confirm: () => string | null
}

interface TagEditorOverlayProps {
  visible: boolean
  initialValue: string
  onConfirm?: () => void
  onClose?: () => void
}

export const TagEditorOverlay = forwardRef<
  TagEditorOverlayHandle,
  TagEditorOverlayProps
>(function TagEditorOverlay(
  { visible, initialValue, onConfirm, onClose },
  ref,
) {
  const theme = useTheme()
  const [value, setValue] = useState(initialValue)
  const [errorText, setErrorText] = useState<string | null>(null)
  const inputRef = useRef<InputRenderable | null>(null)

  useEffect(() => {
    if (visible) {
      setValue(initialValue)
      setErrorText(null)
      inputRef.current?.focus()
    }
  }, [initialValue, visible])

  useImperativeHandle(ref, () => ({
    confirm: () => {
      if (!isValidTag(value)) {
        setErrorText("Tag must be a non-empty trimmed string")
        return null
      }
      setErrorText(null)
      return value
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
        <text fg={theme.text}>{initialValue ? "Edit Tag" : "Add Tag"}</text>
        <EscapeClose onClose={() => onClose?.()} />
      </box>

      <box style={{ paddingX: 2, flexDirection: "column", paddingBottom: 1 }}>
        <text fg={theme.textMuted}>Tag</text>
        <input
          ref={inputRef}
          value={value}
          placeholder="e.g. smoke"
          onInput={setValue}
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
        <ActionButton
          shortcut="^S"
          label="save"
          onAction={() => onConfirm?.()}
        />
        <ActionButton
          shortcut="esc"
          label="close"
          onAction={() => onClose?.()}
        />
      </box>
    </Overlay>
  )
})
