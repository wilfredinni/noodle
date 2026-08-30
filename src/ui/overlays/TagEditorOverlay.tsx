import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { isValidTag } from "../../tags"
import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { VarInput, type VarInputHandle } from "../VarInput"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface TagEditorOverlayHandle {
  confirm: () => string | null
}

interface TagEditorOverlayProps {
  visible: boolean
  initialValue: string
  suggestions: readonly string[]
  title?: string
  onConfirm?: () => void
  onClear?: () => void
  onDelete?: () => void
  onClose?: () => void
}

export const TagEditorOverlay = forwardRef<
  TagEditorOverlayHandle,
  TagEditorOverlayProps
>(function TagEditorOverlay(
  {
    visible,
    initialValue,
    suggestions,
    title,
    onConfirm,
    onClear,
    onDelete,
    onClose,
  },
  ref,
) {
  const theme = useTheme()
  const [value, setValue] = useState(initialValue)
  const [errorText, setErrorText] = useState<string | null>(null)
  const inputRef = useRef<VarInputHandle | null>(null)
  const completionValues = useMemo(
    () => [...new Set(suggestions)].sort(),
    [suggestions],
  )

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
        <text fg={theme.text}>
          {title ?? (initialValue ? "Edit Tag" : "Add Tag")}
        </text>
        <EscapeClose onClose={() => onClose?.()} />
      </box>

      <box style={{ paddingX: 2, flexDirection: "column", paddingBottom: 1 }}>
        <text fg={theme.textMuted}>Tag</text>
        <VarInput
          ref={inputRef}
          value={value}
          env={null}
          isEditing
          variableAware={false}
          completionValues={completionValues}
          placeholder="e.g. smoke"
          onChange={setValue}
          backgroundColor={theme.backgroundElement}
          focusedBackgroundColor={theme.borderSubtle}
          baseColor={theme.text}
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
        {onClear ? (
          <ActionButton shortcut="^D" label="clear" onAction={onClear} />
        ) : null}
        <ActionButton
          shortcut="^S"
          label="save"
          onAction={() => onConfirm?.()}
        />
        {onDelete ? (
          <ActionButton shortcut="^D" label="delete" onAction={onDelete} />
        ) : (
          <ActionButton
            shortcut="esc"
            label="close"
            onAction={() => onClose?.()}
          />
        )}
      </box>
    </Overlay>
  )
})
