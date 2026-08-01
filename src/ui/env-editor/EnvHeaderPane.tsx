import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react"
import { useTheme } from "../theme"
import { FullBorder } from "../borders"
import type { InputRenderable } from "@opentui/core"
import { Select, type SelectItem } from "../Select"
import { VALID_COLORS } from "../../env/constants"
import { Frame } from "../Frame"
import { JumpBadge, JUMP_BADGE_TOP_LEFT } from "../JumpBadge"

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
    jumpMode?: boolean
    onColorFocus?: () => void
    onPaneFocus?: () => void
  }
>(function EnvHeaderPane(
  {
    name,
    color,
    onNameChange,
    onColorChange,
    focused,
    jumpMode = false,
    onColorFocus,
    onPaneFocus,
  },
  ref,
) {
  const theme = useTheme()
  const nameRef = useRef<InputRenderable | null>(null)
  const prevFocused = useRef(false)
  const [colorFocused, setColorFocused] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const nameFocused = focused && !colorFocused

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
    if (focused && !prevFocused.current && !colorFocused) {
      nameRef.current?.focus()
    }
    prevFocused.current = focused
  }, [focused, colorFocused])

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
    <Frame
      style={{
        flexDirection: "row",
        gap: 1,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.backgroundPanel,
        zIndex: selectOpen ? 1 : undefined,
        flexShrink: 0,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      onPaneFocus={onPaneFocus}
    >
      <box style={{ flexGrow: 1, position: "relative" }}>
        {jumpMode && <JumpBadge letter="m" style={JUMP_BADGE_TOP_LEFT} />}
        <input
          ref={nameRef}
          value={name}
          placeholder="Environment name"
          onInput={onNameChange}
          focused={nameFocused}
          backgroundColor={
            nameFocused ? theme.backgroundElement : theme.backgroundPanel
          }
          focusedBackgroundColor={theme.borderSubtle}
          textColor={theme.text}
          cursorColor={theme.primary}
          paddingX={1}
          style={{ flexGrow: 1 }}
        />
      </box>
      <box style={{ flexShrink: 0, position: "relative" }}>
        {jumpMode && <JumpBadge letter="c" style={JUMP_BADGE_TOP_LEFT} />}
        <Select
          items={colorItems}
          value={color ?? "none"}
          onChange={(id) => onColorChange(id === "none" ? undefined : id)}
          focused={colorFocused}
          maxDropdownHeight={10}
          dropdownAlign="right"
          badge
          onOpenChange={setSelectOpen}
          onActivate={() => {
            setColorFocused(true)
            onColorFocus?.()
          }}
        />
      </box>
    </Frame>
  )
})
