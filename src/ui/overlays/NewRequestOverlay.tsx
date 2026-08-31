import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import { ActionButton } from "../ActionButton"
import { VarInput, type VarInputHandle } from "../VarInput"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"
import { Select, type SelectItem } from "../Select"
import { useTheme } from "../theme"
import type { Method, Environment, ParamEntry } from "../../schema"
import { METHOD_ITEMS } from "../methodItems"

export { METHOD_ITEMS }

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
  initialPathParams?: ParamEntry[]
  folderPaths?: SelectItem[]
  initialFolderPath?: string
  activeEnv?: Environment | null
  onConfirm?: () => void
  onClose?: () => void
}

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
    initialPathParams,
    folderPaths,
    initialFolderPath,
    activeEnv,
    onConfirm,
    onClose,
  },
  ref,
) {
  const theme = useTheme()
  const isEdit = mode === "edit"
  const showFolder = (folderPaths?.length ?? 0) > 0
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
  const urlRef = useRef<VarInputHandle | null>(null)

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
        setFolderPath(initialFolderPath ?? "")
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
    else if (focus === "url") urlRef.current?.focus()
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
        <EscapeClose onClose={() => onClose?.()} />
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
              onActivate={() => setFocus("folder")}
              triggerPriority={110}
              width={52}
              maxDropdownHeight={10}
              showDropdownScrollbar
            />
          </box>
        )}

        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Request Name</text>
          <input
            ref={nameRef}
            value={name}
            placeholder="e.g. Get Users"
            onInput={setName}
            onMouseDown={(event) => {
              if (event.button === MouseButton.LEFT) setFocus("name")
            }}
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
              onActivate={() => setFocus("method")}
              triggerPriority={110}
            />
            <box
              onMouseDown={(event) => {
                if (event.button === MouseButton.LEFT) setFocus("url")
              }}
              style={{ flexGrow: 1, flexShrink: 1 }}
            >
              <VarInput
                ref={urlRef}
                value={url || ""}
                env={activeEnv ?? null}
                pathParams={initialPathParams}
                isEditing
                onChange={setUrl}
                isFocused={focus === "url"}
                placeholder="https://api.example.com/users"
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                paddingX={1}
                style={{ flexGrow: 1, flexShrink: 1 }}
              />
            </box>
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

export { slugify }
