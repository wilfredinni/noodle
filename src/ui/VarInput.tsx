import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createPortal, useKeyboard, useRenderer } from "@opentui/react"
import { useTheme } from "./theme"
import { VarText } from "./VarText"
import type { Environment } from "../schema"
import {
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
} from "./variableCompletion"
import { highlightVariables } from "./variableHighlight"
import { registerVariableCompletion } from "./variableCompletionInterceptor"

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
  variableNames?: Iterable<string>
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
      variableNames,
    },
    ref,
  ) {
    const theme = useTheme()
    const renderer = useRenderer()
    const defaultColor = baseColor ?? theme.text
    const inputRef = useRef<InputRenderable | null>(null)
    const textareaRef = useRef<TextareaRenderable | null>(null)
    const [completionDismissed, setCompletionDismissed] = useState(false)
    const [completionIndex, setCompletionIndex] = useState(0)
    const [completionAnchor, setCompletionAnchor] = useState<{
      x: number
      y: number
    } | null>(null)

    const getEditable = useCallback(() => {
      const editable = inputRef.current ?? textareaRef.current
      return editable && !editable.isDestroyed ? editable : null
    }, [])
    const suggestionNames = variableNames ?? Object.keys(env?.vars ?? {})
    const getCompletion = useCallback(() => {
      const editable = getEditable()
      const text = editable?.plainText ?? value
      const cursorOffset = editable?.cursorOffset ?? value.length
      const token = getVariableToken(text, cursorOffset)
      return {
        token,
        suggestions: token
          ? getVariableSuggestions(suggestionNames, token.prefix)
          : [],
      }
    }, [getEditable, suggestionNames, value])

    const applyHighlights = useCallback(() => {
      const editable = getEditable()
      if (editable) highlightVariables(editable, editable.plainText, theme, env)
    }, [env, getEditable, theme])

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus()
        textareaRef.current?.focus()
      },
    }))

    const handleTextareaChange = useCallback(() => {
      const ta = textareaRef.current
      if (!ta) return
      onChange?.(ta.plainText)
      setCompletionDismissed(false)
      applyHighlights()
    }, [applyHighlights, onChange])

    const handleInput = useCallback(
      (nextValue: string) => {
        onChange?.(nextValue)
        setCompletionDismissed(false)
        applyHighlights()
      },
      [applyHighlights, onChange],
    )

    useEffect(() => {
      if (!isEditing) return
      applyHighlights()
    }, [applyHighlights, isEditing, value])

    useEffect(() => {
      const editable = getEditable()
      const { token, suggestions } = getCompletion()
      if (
        !editable ||
        completionDismissed ||
        !token ||
        suggestions.length === 0
      ) {
        setCompletionAnchor((current) => (current === null ? current : null))
        return
      }
      const next = { x: editable.x, y: editable.y + editable.height }
      setCompletionAnchor((current) =>
        current?.x === next.x && current.y === next.y ? current : next,
      )
    }, [completionDismissed, isEditing, value])

    const handleCompletionKey = useCallback(
      (key: {
        name: string
        preventDefault: () => void
        stopPropagation: () => void
        defaultPrevented?: boolean
      }): boolean => {
        const editable = getEditable()
        if (
          !isEditing ||
          !editable?.focused ||
          completionDismissed ||
          key.defaultPrevented
        ) {
          return false
        }
        const { token, suggestions } = getCompletion()
        if (!token || suggestions.length === 0) return false

        if (key.name === "up" || key.name === "down") {
          setCompletionIndex((current) => {
            const delta = key.name === "up" ? -1 : 1
            return (current + delta + suggestions.length) % suggestions.length
          })
          return true
        } else if (key.name === "tab" || key.name === "return") {
          const name = suggestions[completionIndex] ?? suggestions[0]!
          const result = replaceVariableToken(editable.plainText, token, name)
          editable.replaceText(result.value)
          editable.cursorOffset = result.cursorOffset
          onChange?.(result.value)
          highlightVariables(editable, result.value, theme, env)
          setCompletionDismissed(true)
          return true
        } else if (key.name === "escape") {
          setCompletionDismissed(true)
          return true
        }
        return false
      },
      [
        completionDismissed,
        completionIndex,
        env,
        getCompletion,
        getEditable,
        isEditing,
        onChange,
        theme,
      ],
    )

    useEffect(() => {
      const { token, suggestions } = getCompletion()
      const editable = getEditable()
      if (
        !isEditing ||
        !editable?.focused ||
        completionDismissed ||
        !token ||
        suggestions.length === 0
      ) {
        return
      }
      return registerVariableCompletion(handleCompletionKey)
    }, [
      completionDismissed,
      getCompletion,
      getEditable,
      handleCompletionKey,
      isEditing,
    ])

    useKeyboard((key) => {
      if (handleCompletionKey(key)) {
        key.preventDefault()
        key.stopPropagation()
      }
    })

    const { token, suggestions } = getCompletion()

    const completionMenu =
      isEditing &&
      !completionDismissed &&
      token &&
      suggestions.length > 0 &&
      completionAnchor
        ? createPortal(
            <box
              id="var-completion-menu"
              style={{
                position: "absolute",
                top: completionAnchor.y,
                left: completionAnchor.x,
                zIndex: 10000,
                flexDirection: "column",
                flexShrink: 0,
                minWidth: 16,
                backgroundColor: theme.backgroundPanel,
                paddingLeft: 1,
                paddingRight: 1,
              }}
              borderStyle="single"
              borderColor={theme.borderActive}
            >
              {suggestions.slice(0, 6).map((name, index) => (
                <box
                  key={name}
                  style={{
                    backgroundColor:
                      index === completionIndex
                        ? theme.backgroundElement
                        : undefined,
                  }}
                >
                  <text
                    fg={index === completionIndex ? theme.primary : theme.text}
                  >
                    ${name}
                  </text>
                </box>
              ))}
            </box>,
            renderer.root,
            null,
          )
        : null

    if (isEditing) {
      if (useTextarea) {
        return (
          <box
            style={{
              flexGrow: style?.flexGrow,
            }}
          >
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
            {completionMenu}
          </box>
        )
      }

      return (
        <box
          style={{
            flexGrow: style?.flexGrow,
            flexShrink: style?.flexShrink,
            flexBasis: style?.flexBasis,
          }}
        >
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onInput={handleInput}
            focused={isFocused ?? false}
            backgroundColor={backgroundColor}
            focusedBackgroundColor={
              focusedBackgroundColor ?? theme.borderSubtle
            }
            textColor={defaultColor}
            cursorColor={theme.primary}
            paddingX={paddingX}
          />
          {completionMenu}
        </box>
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
