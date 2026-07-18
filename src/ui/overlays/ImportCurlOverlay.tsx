import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import type { SelectItem } from "../Select"
import { Select } from "../Select"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"

export interface ImportCurlOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  confirm: () => { command: string; name: string; folderPath: string } | null
  getFocus: () => "folder" | "name" | "curl"
  setError: (message: string) => void
}

interface ImportCurlOverlayProps {
  visible: boolean
  folderPaths: SelectItem[]
  initialFolderPath: string
}

const FOCUS_ORDER: Array<"folder" | "name" | "curl"> = [
  "folder",
  "name",
  "curl",
]

export const ImportCurlOverlay = forwardRef<
  ImportCurlOverlayHandle,
  ImportCurlOverlayProps
>(function ImportCurlOverlay({ visible, folderPaths, initialFolderPath }, ref) {
  const theme = useTheme()
  const [command, setCommand] = useState("")
  const [name, setName] = useState("")
  const [folderPath, setFolderPath] = useState(initialFolderPath)
  const [focus, setFocus] = useState<"folder" | "name" | "curl">("folder")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)
  const curlRef = useRef<TextareaRenderable | null>(null)
  const nameRef = useRef<InputRenderable | null>(null)

  useEffect(() => {
    if (!visible) return
    setCommand("")
    setName("")
    setFolderPath(initialFolderPath)
    setFocus("folder")
    setErrorText(null)
  }, [visible, initialFolderPath])

  useEffect(() => {
    if (focus === "curl") curlRef.current?.focus()
    if (focus === "name") nameRef.current?.focus()
  }, [focus])

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction) => {
      setErrorText(null)
      setFocus((previous) => {
        const index = FOCUS_ORDER.indexOf(previous)
        return FOCUS_ORDER[
          (index + direction + FOCUS_ORDER.length) % FOCUS_ORDER.length
        ]!
      })
    },
    confirm: () => {
      if (!command.trim()) {
        setErrorText("cURL command is required")
        return null
      }
      if (!name.trim()) {
        setErrorText("Request name is required")
        return null
      }
      setErrorText(null)
      return { command, name, folderPath }
    },
    getFocus: () => focus,
    setError: setErrorText,
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
        <text fg={theme.text}>Import cURL Request</text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box
        style={{
          paddingX: 2,
          flexDirection: "column",
          gap: 1,
          paddingBottom: 1,
        }}
      >
        <box
          style={{
            flexDirection: "column",
            zIndex: folderSelectOpen ? 1 : undefined,
          }}
        >
          <text fg={theme.textMuted}>Folder</text>
          <Select
            items={folderPaths}
            value={folderPath}
            onChange={setFolderPath}
            focused={focus === "folder"}
            onOpenChange={setFolderSelectOpen}
          />
        </box>

        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Request Name</text>
          <input
            ref={nameRef}
            value={name}
            placeholder="e.g. Get Users"
            onInput={setName}
            focused={focus === "name"}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
            textColor={theme.text}
            cursorColor={theme.primary}
            placeholderColor={theme.textMuted}
          />
        </box>

        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>cURL Command</text>
          <textarea
            ref={curlRef}
            initialValue={command}
            placeholder="curl https://api.example.com/users"
            onContentChange={() => setCommand(curlRef.current?.plainText ?? "")}
            focused={focus === "curl"}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
            textColor={theme.text}
            cursorColor={theme.primary}
            placeholderColor={theme.textMuted}
            height={4}
            paddingX={1}
          />
        </box>

        {errorText && <text fg={theme.error}>{errorText}</text>}
      </box>

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
