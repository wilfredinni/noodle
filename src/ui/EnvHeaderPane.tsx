import { useEffect, useImperativeHandle, useRef, forwardRef } from "react"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"

export interface EnvHeaderPaneHandle {
  focusName: () => void
  focusColor: () => void
}

export const EnvHeaderPane = forwardRef<EnvHeaderPaneHandle, {
  name: string
  color: string | undefined
  onNameChange: (name: string) => void
  onColorChange: (color: string | undefined) => void
  focused: boolean
}>(function EnvHeaderPane({
  name,
  color,
  onNameChange,
  onColorChange,
  focused,
}, ref) {
  const theme = useTheme()
  const nameRef = useRef<{ focus: () => void } | null>(null)
  const colorRef = useRef<{ focus: () => void } | null>(null)
  const prevFocused = useRef(false)

  useImperativeHandle(ref, () => ({
    focusName: () => nameRef.current?.focus(),
    focusColor: () => colorRef.current?.focus(),
  }))

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
      <input
        ref={colorRef}
        value={color ?? ""}
        placeholder="Color"
        onInput={(v) => onColorChange(v || undefined)}
        focused={false}
        backgroundColor={theme.backgroundElement}
        textColor={colorValue}
        cursorColor={theme.primary}
        style={{ width: 18 }}
      />
    </box>
  )
})
