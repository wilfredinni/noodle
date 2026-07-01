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
import type { Method } from "../schema"

export interface NewRequestOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => { name: string; method: Method; url: string } | null
  getFocus: () => "name" | "method" | "url"
}

interface NewRequestOverlayProps {
  visible: boolean
  mode?: "create" | "edit"
  initialName?: string
  initialMethod?: Method
  initialUrl?: string
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
  { visible, mode, initialName, initialMethod, initialUrl },
  ref,
) {
  const theme = useTheme()
  const isEdit = mode === "edit"
  const [name, setName] = useState("")
  const [method, setMethod] = useState<Method>("GET")
  const [url, setUrl] = useState("")
  const [focus, setFocus] = useState<"name" | "method" | "url">("name")
  const [errorText, setErrorText] = useState<string | null>(null)

  const nameRef = useRef<InputRenderable | null>(null)
  const urlRef = useRef<InputRenderable | null>(null)

  const focusOrder: Array<"name" | "method" | "url"> = ["name", "method", "url"]

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction: 1 | -1) => {
      setErrorText(null)
      setFocus((prev) => {
        const idx = focusOrder.indexOf(prev)
        const next = (idx + direction + focusOrder.length) % focusOrder.length
        return focusOrder[next]!
      })
    },
    commitField: () => {
      if (focus === "name") {
        setFocus("method")
      }
    },
    confirm: () => {
      if (name.trim() === "") {
        setErrorText("Request name is required")
        return null
      }
      setErrorText(null)
      return { name, method, url }
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
      } else {
        setName("")
        setMethod("GET")
        setUrl("")
      }
      setFocus("name")
      setErrorText(null)
    }
  }, [visible, isEdit, initialName, initialMethod, initialUrl])

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
        <text fg={theme.primary}>
          {isEdit ? "Edit Request" : "New Request"}
        </text>
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
            <box style={{ flexGrow: 1 }}>
              <input
                ref={urlRef}
                value={url}
                placeholder="Request URL"
                onInput={setUrl}
                focused={focus === "url"}
                backgroundColor={theme.backgroundElement}
                focusedBackgroundColor={theme.borderSubtle}
                textColor={theme.text}
                cursorColor={theme.primary}
                placeholderColor={theme.textMuted}
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
        <text fg={theme.primary}>^S</text>
        <text fg={theme.textMuted}>save</text>
        <text fg={theme.textMuted}> · </text>
        <text fg={theme.primary}>esc</text>
        <text fg={theme.textMuted}>close</text>
      </box>
    </Overlay>
  )
})

export { slugify }
