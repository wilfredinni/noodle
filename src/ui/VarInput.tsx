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
import { highlightVariables } from "./variable-completion/variableHighlight"
import { registerVariableCompletion } from "./variable-completion/variableCompletionInterceptor"
import {
  useVariableCompletion,
  MAX_COMPLETION_VISIBLE,
} from "./variable-completion/useVariableCompletion"

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

    const inputFocused = isFocused ?? true

    const { completion, makeHandleKey } = useVariableCompletion({
      getEditor: getEditable,
      variableNames: suggestionNames,
      value,
      isEditing: isEditing && inputFocused,
    })

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

    const handleCompletionKey = useMemo(
      () =>
        makeHandleKey({
          completionDismissed,
          completionIndex,
          setCompletionIndex,
          setCompletionDismissed,
          onAccept: () => {
            const editable = getEditable()
            if (editable) {
              const text = editable.plainText
              onChange?.(text)
              highlightVariables(editable, text, theme, env)
            }
          },
        }),
      [
        completionDismissed,
        completionIndex,
        env,
        getEditable,
        makeHandleKey,
        onChange,
        theme,
      ],
    )

    const { token, suggestions, isComplete } = completion

    useEffect(() => {
      const editable = getEditable()
      if (
        !isEditing ||
        !inputFocused ||
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
      inputFocused,
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
      inputFocused &&
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
              focused={inputFocused}
            />
            {showCompletion && (
              <CompletionPopup
                suggestions={suggestions}
                completionIndex={completionIndex}
                isEditing={isEditing && inputFocused}
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
            focused={inputFocused}
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
              suggestions={suggestions}
              completionIndex={completionIndex}
              isEditing={isEditing && inputFocused}
              getEditable={getEditable}
              value={value}
            />
          )}
        </box>
      )
    }

    const displayColor = value ? defaultColor : theme.textMuted
    const displayText = value ? value : (placeholder ?? "")

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
        <VarText text={displayText} env={env} baseColor={displayColor} />
      </box>
    )
  },
)

function CompletionPopup({
  suggestions,
  completionIndex,
  isEditing,
  getEditable,
  value,
}: {
  suggestions: string[]
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
    if (!isEditing || !editable) {
      setCompletionAnchor((current) => (current === null ? current : null))
      return
    }
    const cursor = editable.visualCursor
    const visibleCount = Math.min(suggestions.length, MAX_COMPLETION_VISIBLE)
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
    getEditable,
    isEditing,
    suggestions.length,
    terminalHeight,
    terminalWidth,
    value,
  ])

  if (!completionAnchor) {
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
      {suggestions.slice(0, MAX_COMPLETION_VISIBLE).map((name, index) => (
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
