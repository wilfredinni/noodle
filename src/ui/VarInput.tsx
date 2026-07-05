import { useCallback, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { useTheme } from "./theme"
import { VarText } from "./VarText"
import type { Environment } from "../schema"

export interface VarInputStyle {
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | 0
}

export interface VarInputProps {
  value: string
  env: Environment | null
  isEditing: boolean
  onChange?: (value: string) => void
  useTextarea?: boolean
  isFocused?: boolean
  baseColor?: string
  placeholder?: string
  backgroundColor?: string
  focusedBackgroundColor?: string
  paddingX?: number
  style?: VarInputStyle
}

export function VarInput({
  value,
  env,
  isEditing,
  onChange,
  useTextarea = false,
  isFocused,
  baseColor,
  placeholder,
  backgroundColor,
  focusedBackgroundColor,
  paddingX,
  style,
}: VarInputProps) {
  const theme = useTheme()
  const defaultColor = baseColor ?? theme.text
  const textareaRef = useRef<TextareaRenderable | null>(null)

  const handleTextareaChange = useCallback(() => {
    const ta = textareaRef.current
    if (ta) onChange?.(ta.plainText)
  }, [onChange])

  if (isEditing) {
    if (useTextarea) {
      return (
        <textarea
          ref={textareaRef}
          initialValue={value}
          onContentChange={handleTextareaChange}
          backgroundColor={backgroundColor ?? theme.backgroundPanel}
          focusedBackgroundColor={
            focusedBackgroundColor ?? theme.backgroundPanel
          }
          textColor={defaultColor}
          cursorColor={theme.primary}
          focused
        />
      )
    }

    return (
      <input
        value={value}
        placeholder={placeholder}
        onInput={onChange}
        focused={isFocused ?? false}
        backgroundColor={backgroundColor}
        focusedBackgroundColor={focusedBackgroundColor ?? theme.borderSubtle}
        textColor={defaultColor}
        cursorColor={theme.primary}
        paddingX={paddingX}
        style={{
          flexGrow: style?.flexGrow,
          flexShrink: style?.flexShrink,
          flexBasis: style?.flexBasis,
        }}
      />
    )
  }

  return (
    <box
      style={{
        backgroundColor,
        flexShrink: style?.flexShrink ?? 1,
        flexGrow: style?.flexGrow,
        flexBasis: style?.flexBasis,
        minWidth: 0,
        overflow: "hidden",
        paddingLeft: paddingX,
        paddingRight: paddingX,
      }}
    >
      <VarText text={value} env={env} baseColor={defaultColor} />
    </box>
  )
}
