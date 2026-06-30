import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { InputRenderable } from "@opentui/core"
import { Select, type SelectItem } from "./Select"
import { VALID_COLORS } from "../env/constants"

export interface EnvHeaderPaneHandle {
  focusName: () => void
  focusColor: () => void
}

export const EnvHeaderPane = forwardRef<
  EnvHeaderPaneHandle,
  {
    name: string
    color: string | undefined
    onNameChange: (name: string) => void
    onColorChange: (color: string | undefined) => void
    focused: boolean
  }
>(function EnvHeaderPane(
  { name, color, onNameChange, onColorChange, focused },
  ref,
) {
  const theme = useTheme()
  const nameRef = useRef<InputRenderable | null>(null)
  const prevFocused = useRef(false)
  const [colorFocused, setColorFocused] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    focusName: () => {
      setColorFocused(false)
      nameRef.current?.focus()
    },
    focusColor: () => {
      setColorFocused(true)
      nameRef.current?.blur()
    },
  }))

  useEffect(() => {
    if (!focused) setColorFocused(false)
  }, [focused])

  useEffect(() => {
    if (focused && !prevFocused.current) {
      nameRef.current?.focus()
    }
    prevFocused.current = focused
  }, [focused])

  const colorItems: SelectItem[] = useMemo(() => {
    const t = theme as unknown as Record<string, string>
    return [
      { id: "none", label: "(none)" },
      ...Array.from(VALID_COLORS).map((c) => ({
        id: c,
        color: c,
        label: <text fg={t[c] ?? theme.textMuted}>{c}</text>,
      })),
    ]
  }, [theme])

  return (
    <box
      style={{
        flexDirection: "row",
        gap: 1,
        padding: 1,
        backgroundColor: theme.backgroundPanel,
        zIndex: selectOpen ? 1 : undefined,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title="Environment"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      <input
        ref={nameRef}
        value={name}
        placeholder="Environment name"
        onInput={onNameChange}
        focused={focused}
        backgroundColor={theme.backgroundElement}
        focusedBackgroundColor={theme.borderSubtle}
        textColor={theme.text}
        cursorColor={theme.primary}
        style={{ flexGrow: 1 }}
      />
      <Select
        items={colorItems}
        value={color ?? "none"}
        onChange={(id) => onColorChange(id === "none" ? undefined : id)}
        focused={colorFocused}
        width={15}
        maxDropdownHeight={10}
        dropdownAlign="right"
        onOpenChange={setSelectOpen}
      />
    </box>
  )
})
