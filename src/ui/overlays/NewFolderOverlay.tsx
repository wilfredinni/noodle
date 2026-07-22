import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { InputRenderable } from "@opentui/core"
import { Overlay } from "./Overlay"
import { useTheme } from "../theme"

export interface NewFolderOverlayHandle {
  confirm: () => string | null
}

interface NewFolderOverlayProps {
  visible: boolean
}

export const NewFolderOverlay = forwardRef<
  NewFolderOverlayHandle,
  NewFolderOverlayProps
>(function NewFolderOverlay({ visible }, ref) {
  const theme = useTheme()
  const [name, setName] = useState("")
  const [errorText, setErrorText] = useState<string | null>(null)
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
        <text fg={theme.textMuted}>esc</text>
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
        <text fg={theme.text}>^S</text>
        <text fg={theme.textMuted}>save</text>
        <text fg={theme.textMuted}> · </text>
        <text fg={theme.text}>esc</text>
        <text fg={theme.textMuted}>close</text>
      </box>
    </Overlay>
  )
})
