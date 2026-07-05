import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { InputRenderable } from "@opentui/core"
import { Overlay } from "./Overlay"
import { Select, type SelectItem } from "./Select"
import { useTheme } from "./theme"
import type { Method, Environment } from "../schema"
import { VarInput } from "./VarInput"

export interface NewRequestOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => {
    name: string
    method: Method
    url: string
    folderPath?: string
  } | null
  getFocus: () => "folder" | "name" | "method" | "url"
}

interface NewRequestOverlayProps {
  visible: boolean
  mode?: "create" | "edit"
  initialName?: string
  initialMethod?: Method
  initialUrl?: string
  folderPaths?: SelectItem[]
  initialFolderPath?: string
  activeEnv?: Environment | null
}

export const METHOD_ITEMS: SelectItem[] = [
  { id: "GET", label: "GET", color: "success" },
  { id: "POST", label: "POST", color: "warning" },
  { id: "PUT", label: "PUT", color: "warning" },
  { id: "PATCH", label: "PATCH", color: "warning" },
  { id: "DELETE", label: "DEL", color: "error" },
  { id: "HEAD", label: "HEAD", color: "textMuted" },
  { id: "OPTIONS", label: "OPTIONS", color: "textMuted" },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
}

export const NewRequestOverlay = forwardRef<
  NewRequestOverlayHandle,
  NewRequestOverlayProps
>(function NewRequestOverlay(
  {
    visible,
    mode,
    initialName,
    initialMethod,
    initialUrl,
    folderPaths,
    initialFolderPath,
    activeEnv,
  },
  ref,
) {
  const theme = useTheme()
  const isEdit = mode === "edit"
  const showFolder = isEdit && folderPaths && folderPaths.length > 0
  const [name, setName] = useState("")
  const [method, setMethod] = useState<Method>("GET")
  const [url, setUrl] = useState("")
  const [folderPath, setFolderPath] = useState("")
  const [focus, setFocus] = useState<"folder" | "name" | "method" | "url">(
    showFolder ? "folder" : "name",
  )
  const [errorText, setErrorText] = useState<string | null>(null)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)

  const nameRef = useRef<InputRenderable | null>(null)

  const FOCUS_ORDER: Array<"folder" | "name" | "method" | "url"> = showFolder
    ? ["folder", "name", "method", "url"]
    : ["name", "method", "url"]

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction: 1 | -1) => {
      setErrorText(null)
      setFocus((prev) => {
        const idx = FOCUS_ORDER.indexOf(prev)
        const next = (idx + direction + FOCUS_ORDER.length) % FOCUS_ORDER.length
        return FOCUS_ORDER[next]!
      })
    },
    commitField: () => {
      if (focus === "name") {
        setFocus("method")
      } else if (focus === "folder") {
        setFocus("name")
      }
    },
    confirm: () => {
      if (name.trim() === "") {
        setErrorText("Request name is required")
        return null
      }
      setErrorText(null)
      return showFolder
        ? { name, method, url, folderPath }
        : { name, method, url }
    },
    getFocus: () => focus,
  }))

  // Reset state when overlay opens
  useEffect(() => {
    if (visible) {
      if (isEdit) {
        setName(initialName ?? "")
        setMethod(initialMethod ?? "GET")
        setUrl(initialUrl ?? "")
        setFolderPath(initialFolderPath ?? "")
      } else {
        setName("")
        setMethod("GET")
        setUrl("")
        setFolderPath("")
      }
      setFocus(showFolder ? "folder" : "name")
      setErrorText(null)
    }
  }, [
    visible,
    isEdit,
    initialName,
    initialMethod,
    initialUrl,
    initialFolderPath,
    showFolder,
  ])

  // Auto-focus based on focus state
  useEffect(() => {
    if (focus === "name") nameRef.current?.focus()
  }, [focus])

  return (
    <Overlay visible={visible} width={58} padding={1} gap={1}>
      {/* Title bar */}
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>{isEdit ? "Edit Request" : "New Request"}</text>
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
        {showFolder && (
          <box
            style={{
              flexDirection: "column",
              zIndex: folderSelectOpen ? 1 : undefined,
            }}
          >
            <text fg={theme.textMuted}>Folder</text>
            <Select
              items={folderPaths!}
              value={folderPath}
              onChange={setFolderPath}
              focused={focus === "folder"}
              onOpenChange={setFolderSelectOpen}
            />
          </box>
        )}

        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Request Name</text>
          <input
            ref={nameRef}
            value={name}
            placeholder="Request Name"
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
          <text fg={theme.textMuted}>Method &amp; URL</text>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <Select
              items={METHOD_ITEMS}
              value={method}
              onChange={(id) => setMethod(id as Method)}
              focused={focus === "method"}
              badge
            />
            <VarInput
              value={url || ""}
              env={activeEnv ?? null}
              isEditing={focus === "url"}
              onChange={setUrl}
              isFocused
              placeholder="Request URL"
              backgroundColor={theme.backgroundElement}
              focusedBackgroundColor={theme.borderSubtle}
              paddingX={1}
              style={{ flexGrow: 1 }}
            />
          </box>
        </box>

        {errorText && <text fg={theme.error}>{errorText}</text>}
      </box>

      {/* Footer */}
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

export { slugify }
