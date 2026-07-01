import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { TextAttributes, type InputRenderable } from "@opentui/core"
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
}

export const METHOD_ITEMS: SelectItem[] = [
  { id: "GET", label: "GET" },
  { id: "POST", label: "POST" },
  { id: "PUT", label: "PUT" },
  { id: "PATCH", label: "PATCH" },
  { id: "DELETE", label: "DEL" },
  { id: "HEAD", label: "HEAD" },
  { id: "OPTIONS", label: "OPTIONS" },
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
>(function NewRequestOverlay({ visible }, ref) {
  const theme = useTheme()
  const [name, setName] = useState("")
  const [method, setMethod] = useState<Method>("GET")
  const [url, setUrl] = useState("")
  const [focus, setFocus] = useState<"name" | "method" | "url">("name")
  const [errorText, setErrorText] = useState<string | null>(null)

  const nameRef = useRef<InputRenderable | null>(null)
  const urlRef = useRef<InputRenderable | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)

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
      } else if (focus === "method") {
        setSelectOpen(true)
      }
      // focus === "url" handled by useOverlayIntercepts (y equivalent)
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
      setName("")
      setMethod("GET")
      setUrl("")
      setFocus("name")
    }
  }, [visible])

  // Auto-focus name input when overlay opens
  useEffect(() => {
    if (visible && focus === "name") {
      nameRef.current?.focus()
    }
  }, [visible])

  // Manage input focus based on focus state
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
        }}
      >
        <text fg={theme.primary} attributes={TextAttributes.BOLD}>
          New Request
        </text>
        <text fg={theme.textMuted}>esc to close</text>
      </box>

      {/* Separator */}
      <box style={{ height: 1, backgroundColor: theme.borderSubtle }} />

      {/* Request Name */}
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
      />

      {/* Method & URL */}
      <text fg={theme.textMuted}>Method &amp; URL</text>
      <box style={{ flexDirection: "row", gap: 0 }}>
        <Select
          items={METHOD_ITEMS}
          value={method}
          onChange={(id) => setMethod(id as Method)}
          focused={focus === "method"}
          onOpenChange={setSelectOpen}
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
          />
        </box>
      </box>

      {/* Error text */}
      {errorText && (
        <text fg={theme.error}>
          {errorText}
        </text>
      )}

      {/* Separator */}
      <box style={{ height: 1, backgroundColor: theme.borderSubtle }} />

      {/* Footer */}
      <box
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 3,
        }}
      >
        <text fg={theme.success}>y confirm</text>
        <text fg={theme.error}>n cancel</text>
      </box>
    </Overlay>
  )
})

export { slugify }
