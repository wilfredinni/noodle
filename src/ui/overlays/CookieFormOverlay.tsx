import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import { Checkbox } from "../Checkbox"
import { Select } from "../Select"
import { useTheme } from "../theme"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"
import type { JarCookie } from "../../cookies"

export interface CookieFormValues {
  name: string
  value: string
  domain: string
  path: string
  expires: string
  secure: boolean
  httpOnly: boolean
  sameSite: "strict" | "lax" | "none" | ""
}

export type CookieFormFocus =
  | "name"
  | "value"
  | "domain"
  | "path"
  | "expires"
  | "secure"
  | "httpOnly"
  | "sameSite"

export interface CookieFormOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => CookieFormValues | null
  getFocus: () => CookieFormFocus
  setError: (message: string) => void
  toggleFocused: () => void
}

interface CookieFormOverlayProps {
  visible: boolean
  initial?: JarCookie | null
  onConfirm?: () => void
  onClose?: () => void
}

const FIELDS: CookieFormFocus[] = [
  "name",
  "value",
  "domain",
  "path",
  "expires",
  "secure",
  "httpOnly",
  "sameSite",
]

const LABELS: Record<CookieFormFocus, string> = {
  name: "Name",
  value: "Value",
  domain: "Domain",
  path: "Path",
  expires: "Expires",
  secure: "Secure",
  httpOnly: "HttpOnly",
  sameSite: "SameSite",
}

export const CookieFormOverlay = forwardRef<
  CookieFormOverlayHandle,
  CookieFormOverlayProps
>(function CookieFormOverlay({ visible, initial, onConfirm, onClose }, ref) {
  const theme = useTheme()
  const [name, setName] = useState("")
  const [value, setValue] = useState("")
  const [domain, setDomain] = useState("")
  const [path, setPath] = useState("/")
  const [expires, setExpires] = useState("")
  const [secure, setSecure] = useState(false)
  const [httpOnly, setHttpOnly] = useState(false)
  const [sameSite, setSameSite] = useState<"strict" | "lax" | "none" | "">("")
  const [focus, setFocus] = useState<CookieFormFocus>("name")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
  const inputRefs = useRef<
    Partial<Record<CookieFormFocus, InputRenderable | null>>
  >({})

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction: 1 | -1) => {
      setErrorText(null)
      setFocus((current) => {
        const index = FIELDS.indexOf(current)
        const next = (index + direction + FIELDS.length) % FIELDS.length
        return FIELDS[next]!
      })
    },
    commitField: () => {
      setErrorText(null)
      const index = FIELDS.indexOf(focus)
      setFocus(FIELDS[(index + 1) % FIELDS.length]!)
    },
    confirm: () => {
      const trimmedName = name.trim()
      const trimmedDomain = domain.trim()
      const trimmedPath = path.trim() || "/"
      if (!trimmedName) {
        setErrorText("Cookie name is required")
        setFocus("name")
        return null
      }
      if (!trimmedDomain) {
        setErrorText("Cookie domain is required")
        setFocus("domain")
        return null
      }
      if (
        expires.trim() !== "" &&
        Number.isNaN(new Date(expires.trim()).getTime())
      ) {
        setErrorText("Invalid date; use YYYY-MM-DD or leave blank")
        setFocus("expires")
        return null
      }
      setErrorText(null)
      return {
        name: trimmedName,
        value,
        domain: trimmedDomain,
        path: trimmedPath,
        expires,
        secure,
        httpOnly,
        sameSite,
      }
    },
    getFocus: () => focus,
    setError: setErrorText,
    toggleFocused: () => {
      setErrorText(null)
      if (focus === "secure") setSecure((current) => !current)
      else if (focus === "httpOnly") setHttpOnly((current) => !current)
    },
  }))

  useEffect(() => {
    if (!visible) return
    setName(initial?.name ?? "")
    setValue(initial?.value ?? "")
    setDomain(initial?.domain ?? "")
    setPath(initial?.path ?? "/")
    setExpires(
      initial?.expires instanceof Date
        ? initial.expires.toISOString().slice(0, 10)
        : "",
    )
    setSecure(initial?.secure ?? false)
    setHttpOnly(initial?.httpOnly ?? false)
    setSameSite(initial?.sameSite ?? "")
    setFocus("name")
    setErrorText(null)
  }, [visible, initial])

  useEffect(() => {
    if (!visible) return
    const field = ["secure", "httpOnly", "sameSite"].includes(focus)
      ? undefined
      : focus
    if (field) inputRefs.current[field]?.focus()
    else inputRefs.current.name?.blur()
  }, [focus, visible])

  const setField = (field: CookieFormFocus, next: string) => {
    if (field === "name") setName(next)
    else if (field === "value") setValue(next)
    else if (field === "domain") setDomain(next)
    else if (field === "path") setPath(next)
    else if (field === "expires") setExpires(next)
    setErrorText(null)
  }

  return (
    <Overlay visible={visible} width={56} padding={1} gap={1}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
          paddingX: 2,
        }}
      >
        <text fg={theme.text}>{initial ? "Edit Cookie" : "New Cookie"}</text>
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
        {FIELDS.map((field) => {
          const isActive = focus === field
          return (
            <box
              key={field}
              style={{
                flexDirection: "column",
                zIndex: field === "sameSite" && selectOpen ? 1 : undefined,
              }}
            >
              <text fg={theme.textMuted}>{LABELS[field]}</text>
              {field === "secure" ? (
                <box
                  style={{
                    flexDirection: "row",
                    gap: 1,
                    backgroundColor: isActive
                      ? theme.backgroundElement
                      : undefined,
                  }}
                  onMouseDown={(event) => {
                    if (event.button === MouseButton.LEFT) setFocus(field)
                  }}
                >
                  <Checkbox checked={secure} theme={theme} />
                </box>
              ) : field === "httpOnly" ? (
                <box
                  style={{
                    flexDirection: "row",
                    gap: 1,
                    backgroundColor: isActive
                      ? theme.backgroundElement
                      : undefined,
                  }}
                  onMouseDown={(event) => {
                    if (event.button === MouseButton.LEFT) setFocus(field)
                  }}
                >
                  <Checkbox checked={httpOnly} theme={theme} />
                </box>
              ) : field === "sameSite" ? (
                <Select
                  items={[
                    { id: "", label: "(none)" },
                    { id: "strict", label: "strict" },
                    { id: "lax", label: "lax" },
                    { id: "none", label: "none" },
                  ]}
                  value={sameSite}
                  onChange={(next) =>
                    setSameSite(
                      next === "strict" || next === "lax" || next === "none"
                        ? next
                        : "",
                    )
                  }
                  focused={isActive}
                  onOpenChange={setSelectOpen}
                  onActivate={() => setFocus("sameSite")}
                  triggerPriority={110}
                />
              ) : (
                <input
                  ref={(node) => {
                    inputRefs.current[field] = node
                  }}
                  value={
                    field === "name"
                      ? name
                      : field === "value"
                        ? value
                        : field === "domain"
                          ? domain
                          : field === "path"
                            ? path
                            : expires
                  }
                  placeholder={
                    field === "expires"
                      ? "YYYY-MM-DD (blank = session)"
                      : undefined
                  }
                  onInput={(next) => setField(field, next)}
                  onMouseDown={(event) => {
                    if (event.button === MouseButton.LEFT) setFocus(field)
                  }}
                  focused={isActive}
                  backgroundColor={theme.backgroundElement}
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={theme.text}
                  cursorColor={theme.primary}
                  placeholderColor={theme.textMuted}
                />
              )}
            </box>
          )
        })}

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
