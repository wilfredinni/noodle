import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { BoxRenderable, InputRenderable } from "@opentui/core"

export interface EnvHeaderPaneHandle {
  focusName: () => void
  focusColor: () => void
}

export const EnvHeaderPane = forwardRef<EnvHeaderPaneHandle, {
  name: string
  color: string | undefined
  onNameChange: (name: string) => void
  focused: boolean
}>(function EnvHeaderPane({
  name,
  color,
  onNameChange,
  focused,
}, ref) {
  const theme = useTheme()
  const nameRef = useRef<InputRenderable | null>(null)
  const colorRef = useRef<BoxRenderable | null>(null)
  const prevFocused = useRef(false)
  const [colorFocused, setColorFocused] = useState(false)

  useImperativeHandle(ref, () => ({
    focusName: () => {
      setColorFocused(false)
      colorRef.current?.blur()
      nameRef.current?.focus()
    },
    focusColor: () => {
      setColorFocused(true)
      nameRef.current?.blur()
      colorRef.current?.focus()
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

  const colorValue =
    color !== undefined
      ? ((theme as unknown as Record<string, string>)[color] ?? theme.textMuted)
      : theme.textMuted

  const colorBg = colorFocused ? theme.borderSubtle : theme.backgroundElement

  return (
    <box
      style={{
        flexDirection: "row",
        gap: 1,
        padding: 1,
        backgroundColor: theme.backgroundPanel,
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
      <box
        ref={colorRef}
        style={{
          height: 1,
          backgroundColor: colorBg,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text fg={colorValue}>Color: {color ?? "(none)"}</text>
      </box>
    </box>
  )
})
