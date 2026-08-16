import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { MouseButton, type InputRenderable } from "@opentui/core"
import { ActionButton } from "../ActionButton"
import { VALID_COLORS } from "../../env/constants"
import { Select, type SelectItem } from "../Select"
import { useTheme } from "../theme"
import { EscapeClose } from "./EscapeClose"
import { Overlay } from "./Overlay"

export interface NewEnvironmentValues {
  name: string
  color: string | undefined
}

export interface NewEnvironmentOverlayHandle {
  cycleFocus: (direction: 1 | -1) => void
  commitField: () => void
  confirm: () => NewEnvironmentValues | null
  getFocus: () => "name" | "color"
  setError: (message: string) => void
}

interface NewEnvironmentOverlayProps {
  visible: boolean
  onConfirm?: () => void
  onClose?: () => void
}

export const NewEnvironmentOverlay = forwardRef<
  NewEnvironmentOverlayHandle,
  NewEnvironmentOverlayProps
>(function NewEnvironmentOverlay({ visible, onConfirm, onClose }, ref) {
  const theme = useTheme()
  const [name, setName] = useState("")
  const [color, setColor] = useState("none")
  const [focus, setFocus] = useState<"name" | "color">("name")
  const [errorText, setErrorText] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const nameRef = useRef<InputRenderable | null>(null)

  const colorItems = useMemo<SelectItem[]>(() => {
    const colors = theme as unknown as Record<string, string>
    return [
      { id: "none", label: "(none)" },
      ...Array.from(VALID_COLORS).map((value) => ({
        id: value,
        color: value,
        label: <text fg={colors[value] ?? theme.textMuted}>{value}</text>,
      })),
    ]
  }, [theme])

  useImperativeHandle(ref, () => ({
    cycleFocus: (direction: 1 | -1) => {
      setErrorText(null)
      setFocus((current) =>
        direction === 1
          ? current === "name"
            ? "color"
            : "name"
          : current === "color"
            ? "name"
            : "color",
      )
    },
    commitField: () => setFocus("color"),
    confirm: () => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        setErrorText("Environment name is required")
        return null
      }
      setErrorText(null)
      return {
        name: trimmedName,
        color: color === "none" ? undefined : color,
      }
    },
    getFocus: () => focus,
    setError: setErrorText,
  }))

  useEffect(() => {
    if (!visible) return
    setName("")
    setColor("none")
    setFocus("name")
    setErrorText(null)
    nameRef.current?.focus()
  }, [visible])

  useEffect(() => {
    if (focus === "name") nameRef.current?.focus()
    else nameRef.current?.blur()
  }, [focus])

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
        <text fg={theme.text}>New Environment</text>
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
        <box style={{ flexDirection: "column" }}>
          <text fg={theme.textMuted}>Environment Name</text>
          <input
            ref={nameRef}
            value={name}
            placeholder="e.g. development"
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

        <box
          style={{
            flexDirection: "column",
            zIndex: selectOpen ? 1 : undefined,
          }}
        >
          <text fg={theme.textMuted}>Color</text>
          <Select
            items={colorItems}
            value={color}
            onChange={setColor}
            focused={focus === "color"}
            maxDropdownHeight={10}
            onOpenChange={setSelectOpen}
            onActivate={() => setFocus("color")}
            triggerPriority={110}
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
