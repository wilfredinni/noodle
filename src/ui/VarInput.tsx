import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  MouseButton,
  type InputRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "./theme"
import { FrameInteractionContext } from "./Frame"
import { VarText } from "./VarText"
import type { Environment, ParamEntry } from "../schema"
import { highlightVariables } from "./variable-completion/variableHighlight"
import { registerVariableCompletion } from "./variable-completion/variableCompletionInterceptor"
import {
  useVariableCompletion,
  MAX_COMPLETION_VISIBLE,
} from "./variable-completion/useVariableCompletion"
import { usePathCompletion } from "./path-completion/usePathCompletion"
import type { PathCompletionOptions } from "./path-completion/pathCompletion"

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
  pathParams?: ParamEntry[]
  pathCompletion?: PathCompletionOptions
  stopMousePropagation?: boolean
  onFocus?: () => void
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
      pathParams,
      pathCompletion,
      stopMousePropagation = false,
      onFocus,
    },
    ref,
  ) {
    const theme = useTheme()
    const frameCapturesInteractions = useContext(FrameInteractionContext)
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
      return [
        ...new Set([
          ...Object.keys(env?.vars ?? {}),
          ...Object.keys(env?.secretVars ?? {}),
        ]),
      ]
    }, [variableNames, env?.vars, env?.secretVars])

    const inputFocused = isFocused ?? true

    const { completion, makeHandleKey, acceptSuggestion } =
      useVariableCompletion({
        getEditor: getEditable,
        variableNames: suggestionNames,
        value,
        isEditing: isEditing && inputFocused,
      })

    const applyHighlights = useCallback(() => {
      const editable = getEditable()
      if (editable)
        highlightVariables(editable, editable.plainText, theme, env, pathParams)
    }, [env, getEditable, theme, pathParams])

    const handlePathChange = useCallback(
      (nextValue: string) => {
        onChange?.(nextValue)
        applyHighlights()
      },
      [applyHighlights, onChange],
    )

    const pathCompletionState = usePathCompletion({
      getEditor: getEditable,
      value,
      isEditing: isEditing && inputFocused,
      options: pathCompletion,
      onChange: handlePathChange,
    })

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus()
        textareaRef.current?.focus()
      },
    }))

    const handleTextareaChange = useCallback(() => {
      const ta = textareaRef.current
      if (!ta || ta.plainText === value) return
      onChange?.(ta.plainText)
      setCompletionDismissed(false)
      applyHighlights()
    }, [applyHighlights, onChange, value])

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

    const handleCompletionAccepted = useCallback(() => {
      const editable = getEditable()
      if (editable) {
        const text = editable.plainText
        onChange?.(text)
        highlightVariables(editable, text, theme, env, pathParams)
      }
    }, [env, getEditable, onChange, pathParams, theme])

    const selectCompletion = useCallback(
      (name: string): boolean => {
        if (!acceptSuggestion(name)) return false
        setCompletionDismissed(true)
        handleCompletionAccepted()
        return true
      },
      [acceptSuggestion, handleCompletionAccepted],
    )

    const handleCompletionKey = useMemo(
      () =>
        makeHandleKey({
          completionDismissed,
          completionIndex,
          setCompletionIndex,
          setCompletionDismissed,
          onAccept: handleCompletionAccepted,
        }),
      [
        completionDismissed,
        completionIndex,
        handleCompletionAccepted,
        makeHandleKey,
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

    const completionPopup = pathCompletionState.active ? (
      <CompletionPopup
        id="path-completion-menu"
        items={pathCompletionState.items
          .slice(0, MAX_COMPLETION_VISIBLE)
          .map((item) => ({
            key: `${item.type}:${item.name}`,
            label: item.type === "directory" ? `${item.name}/` : item.name,
          }))}
        completionIndex={pathCompletionState.selectedIndex}
        message={pathCompletionState.message}
        isEditing={isEditing && inputFocused}
        getEditable={getEditable}
        value={value}
        onSelect={pathCompletionState.selectItem}
        onHighlight={pathCompletionState.setSelectedIndex}
      />
    ) : showCompletion ? (
      <CompletionPopup
        id="var-completion-menu"
        items={suggestions.map((name) => ({ key: name, label: `$${name}` }))}
        completionIndex={completionIndex}
        isEditing={isEditing && inputFocused}
        getEditable={getEditable}
        value={value}
        onSelect={(index) => selectCompletion(suggestions[index]!)}
        onHighlight={setCompletionIndex}
      />
    ) : null

    if (isEditing) {
      if (useTextarea) {
        return (
          <box
            onMouseDown={
              onFocus ||
              stopMousePropagation ||
              (isEditing && frameCapturesInteractions)
                ? (event) => {
                    if (event.button === MouseButton.LEFT) onFocus?.()
                    if (
                      stopMousePropagation ||
                      (isEditing && frameCapturesInteractions)
                    ) {
                      event.stopPropagation()
                    }
                  }
                : undefined
            }
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
            {completionPopup}
          </box>
        )
      }

      return (
        <box
          onMouseDown={
            onFocus ||
            stopMousePropagation ||
            (isEditing && frameCapturesInteractions)
              ? (event) => {
                  if (event.button === MouseButton.LEFT) onFocus?.()
                  if (
                    stopMousePropagation ||
                    (isEditing && frameCapturesInteractions)
                  ) {
                    event.stopPropagation()
                  }
                }
              : undefined
          }
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
          {completionPopup}
        </box>
      )
    }

    const displayColor = value ? defaultColor : theme.textMuted
    const displayText = value || (placeholder ?? "")

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
  id,
  items,
  completionIndex,
  message,
  isEditing,
  getEditable,
  value,
  onSelect,
  onHighlight,
}: {
  id: string
  items: { key: string; label: string }[]
  completionIndex: number
  message?: string
  isEditing: boolean
  getEditable: () => (InputRenderable | TextareaRenderable) | null
  value: string
  onSelect?: (index: number) => boolean
  onHighlight?: (index: number) => void
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
    const visibleCount = Math.max(
      message ? 1 : 0,
      Math.min(items.length, MAX_COMPLETION_VISIBLE),
    )
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
    items.length,
    message,
    terminalHeight,
    terminalWidth,
    value,
  ])

  if (!completionAnchor) {
    return null
  }

  return createPortal(
    <box
      id={id}
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
      {message ? <text fg={theme.textMuted}>{message}</text> : null}
      {items.slice(0, MAX_COMPLETION_VISIBLE).map((item, index) => (
        <box
          key={item.key}
          onMouseDown={
            onSelect
              ? (event) => {
                  if (event.button !== MouseButton.LEFT || !onSelect(index))
                    return
                  event.preventDefault()
                  event.stopPropagation()
                }
              : undefined
          }
          onMouseOver={onHighlight ? () => onHighlight(index) : undefined}
          style={{
            backgroundColor:
              index === completionIndex ? theme.backgroundElement : undefined,
          }}
        >
          <text fg={index === completionIndex ? theme.primary : theme.text}>
            {item.label}
          </text>
        </box>
      ))}
    </box>,
    renderer.root,
    null,
  )
}
