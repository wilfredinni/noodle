import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import type { InputRenderable, TextareaRenderable } from "@opentui/core"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "./theme"
import { VarText } from "./VarText"
import type { Environment } from "../schema"
import {
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
  type VariableToken,
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
    const defaultColor = baseColor ?? theme.text
    const inputRef = useRef<InputRenderable | null>(null)
    const textareaRef = useRef<TextareaRenderable | null>(null)
    const [completionDismissed, setCompletionDismissed] = useState(false)
    const [completionIndex, setCompletionIndex] = useState(0)
    const prevPrefixRef = useRef("")

    const getEditable = useCallback(() => {
      const editable = inputRef.current ?? textareaRef.current
      return editable && !editable.isDestroyed ? editable : null
    }, [])
    const suggestionNames = useMemo(() => {
      if (variableNames != null) return [...variableNames]
      return Object.keys(env?.vars ?? {})
    }, [variableNames, env?.vars])
    const getCompletion = useCallback(() => {
      const editable = getEditable()
      const text = editable?.plainText ?? value
      const cursorOffset = editable?.cursorOffset ?? value.length
      const token = getVariableToken(text, cursorOffset)
      const suggestions = token
        ? getVariableSuggestions(suggestionNames, token.prefix)
        : []
      const tokenText = token ? text.slice(token.start + 1, token.end) : ""
      const isComplete =
        suggestions.length === 1 &&
        cursorOffset === token?.end &&
        suggestions[0] === tokenText
      return { token, suggestions, isComplete }
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
        const { token, suggestions, isComplete } = getCompletion()
        if (!token || suggestions.length === 0 || isComplete) return false

        if (key.name === "up" || key.name === "down") {
          const maxVisible = Math.min(suggestions.length, 10)
          setCompletionIndex((current) => {
            const delta = key.name === "up" ? -1 : 1
            const next = current + delta
            if (next < 0) return maxVisible - 1
            if (next >= maxVisible) return 0
            return next
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

    const { token, suggestions, isComplete } = getCompletion()

    useEffect(() => {
      const editable = getEditable()
      if (
        !isEditing ||
        !editable?.focused ||
        completionDismissed ||
        !token ||
        suggestions.length === 0 ||
        isComplete
      ) {
        return
      }
      return registerVariableCompletion(handleCompletionKey)
    }, [
      completionDismissed,
      getEditable,
      handleCompletionKey,
      isComplete,
      isEditing,
      suggestions.length,
      token,
    ])

    useEffect(() => {
      const prefix = token?.prefix ?? ""
      if (prefix !== prevPrefixRef.current) {
        setCompletionIndex(0)
        prevPrefixRef.current = prefix
      }
    }, [token?.prefix])

    const showCompletion =
      isEditing &&
      !completionDismissed &&
      token &&
      suggestions.length > 0 &&
      !isComplete

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
            {showCompletion && (
              <CompletionPopup
                token={token}
                suggestions={suggestions}
                isComplete={isComplete}
                completionDismissed={completionDismissed}
                completionIndex={completionIndex}
                isEditing={isEditing}
                getEditable={getEditable}
                value={value}
              />
            )}
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
          {showCompletion && (
            <CompletionPopup
              token={token}
              suggestions={suggestions}
              isComplete={isComplete}
              completionDismissed={completionDismissed}
              completionIndex={completionIndex}
              isEditing={isEditing}
              getEditable={getEditable}
              value={value}
            />
          )}
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

function CompletionPopup({
  token,
  suggestions,
  isComplete,
  completionDismissed,
  completionIndex,
  isEditing,
  getEditable,
  value,
}: {
  token: VariableToken | null
  suggestions: string[]
  isComplete: boolean
  completionDismissed: boolean
  completionIndex: number
  isEditing: boolean
  getEditable: () => (InputRenderable | TextareaRenderable) | null
  value: string
}) {
  const renderer = useRenderer()
  const { width: terminalWidth, height: terminalHeight } =
    useTerminalDimensions()
  const theme = useTheme()
  const [completionAnchor, setCompletionAnchor] = useState<{
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const editable = getEditable()
    if (
      !isEditing ||
      !editable ||
      completionDismissed ||
      !token ||
      suggestions.length === 0 ||
      isComplete
    ) {
      setCompletionAnchor((current) => (current === null ? current : null))
      return
    }
    const cursor = editable.visualCursor
    const visibleCount = Math.min(suggestions.length, 10)
    const menuHeight = visibleCount + 2
    const menuWidth = 18
    const rawX = editable.x + cursor.visualCol
    const rawY = editable.y + cursor.visualRow + 1
    const next = {
      x: Math.max(0, Math.min(rawX, terminalWidth - menuWidth)),
      y: Math.max(0, Math.min(rawY, terminalHeight - menuHeight)),
    }
    setCompletionAnchor((current) =>
      current?.x === next.x && current?.y === next.y ? current : next,
    )
  }, [
    completionDismissed,
    getEditable,
    isComplete,
    isEditing,
    suggestions.length,
    terminalHeight,
    terminalWidth,
    token,
    value,
  ])

  if (
    completionDismissed ||
    !token ||
    suggestions.length === 0 ||
    isComplete ||
    !completionAnchor
  ) {
    return null
  }

  return createPortal(
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
      {suggestions.slice(0, 10).map((name, index) => (
        <box
          key={name}
          style={{
            backgroundColor:
              index === completionIndex ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={index === completionIndex ? theme.primary : theme.text}>
            ${name}
          </text>
        </box>
      ))}
    </box>,
    renderer.root,
    null,
  )
}
