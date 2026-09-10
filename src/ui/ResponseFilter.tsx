import type { ReactNode, RefObject } from "react"
import type { InputRenderable } from "@opentui/core"
import { useTheme } from "./theme"

export function ResponseFilter({
  id,
  inputRef,
  value,
  placeholder,
  onInput,
  onMouseDown,
  children,
}: {
  id?: string
  inputRef: RefObject<InputRenderable | null>
  value: string
  placeholder: string
  onInput: (value: string) => void
  onMouseDown?: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <box style={{ flexDirection: "column", gap: 0, flexShrink: 0 }}>
      <box style={{ flexDirection: "row", gap: 1 }}>
        <input
          id={id}
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          onInput={onInput}
          onMouseDown={onMouseDown}
          backgroundColor={theme.background}
          focusedBackgroundColor={theme.background}
          textColor={theme.text}
          cursorColor={theme.primary}
          style={{ flexGrow: 1 }}
        />
      </box>
      {children}
    </box>
  )
}
