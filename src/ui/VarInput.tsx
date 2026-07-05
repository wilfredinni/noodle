import { forwardRef, useCallback, useImperativeHandle, useRef } from "react"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import { useTheme } from "./theme"
import { VarText } from "./VarText"
import type { Environment } from "../schema"

export interface VarInputStyle {
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number
}

export interface VarInputHandle {
  focus: () => void
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

export const VarInput = forwardRef<VarInputHandle, VarInputProps>(
  function VarInput(
    {
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
    },
    ref,
  ) {
    const theme = useTheme()
    const defaultColor = baseColor ?? theme.text
    const inputRef = useRef<InputRenderable | null>(null)
    const textareaRef = useRef<TextareaRenderable | null>(null)

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus()
        textareaRef.current?.focus()
      },
    }))

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
            placeholder={placeholder}
            onContentChange={handleTextareaChange}
            backgroundColor={backgroundColor ?? theme.backgroundPanel}
            focusedBackgroundColor={
              focusedBackgroundColor ?? theme.backgroundPanel
            }
            textColor={defaultColor}
            cursorColor={theme.primary}
            paddingX={paddingX}
            focused
          />
        )
      }

      return (
        <input
          ref={inputRef}
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
  },
)
