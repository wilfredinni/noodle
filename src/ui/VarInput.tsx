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
  InputRenderable,
  MouseButton,
  ScrollBoxRenderable,
  TextareaRenderable,
  type OptimizedBuffer,
} from "@opentui/core"
import { extend } from "@opentui/react"
import { Autocomplete } from "./Autocomplete"
import { useTheme } from "./theme"
import { FrameInteractionContext } from "./Frame"
import { VarText } from "./VarText"
import type { Environment, ParamEntry } from "../schema"
import { highlightVariables } from "./variable-completion/variableHighlight"
import { useVariableCompletion } from "./variable-completion/useVariableCompletion"
import { usePathCompletion } from "./path-completion/usePathCompletion"
import type { PathCompletionOptions } from "./path-completion/pathCompletion"

function cursorIsOutsideScrollbox(editable: TextareaRenderable): boolean {
  const cursor = editable.visualCursor
  const cursorX = editable.screenX + cursor.visualCol + 1
  const cursorY = editable.screenY + cursor.visualRow + 1
  let ancestor = editable.parent

  while (ancestor) {
    if (ancestor instanceof ScrollBoxRenderable) {
      const viewport = ancestor.viewport
      if (
        cursorX <= viewport.screenX ||
        cursorX > viewport.screenX + viewport.width ||
        cursorY <= viewport.screenY ||
        cursorY > viewport.screenY + viewport.height
      ) {
        return true
      }
    }
    ancestor = ancestor.parent
  }

  return false
}

class ViewportTextareaRenderable extends TextareaRenderable {
  override render(buffer: OptimizedBuffer, deltaTime: number) {
    super.render(buffer, deltaTime)
    if (this.focused && this.showCursor && cursorIsOutsideScrollbox(this)) {
      this._ctx.setCursorPosition(0, 0, false)
    }
  }
}

class ViewportInputRenderable extends InputRenderable {
  override render(buffer: OptimizedBuffer, deltaTime: number) {
    super.render(buffer, deltaTime)
    if (this.focused && this.showCursor && cursorIsOutsideScrollbox(this)) {
      this._ctx.setCursorPosition(0, 0, false)
    }
  }
}

extend({
  input: ViewportInputRenderable,
  textarea: ViewportTextareaRenderable,
})

export interface VarInputStyle {
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number
}

export interface VarInputHandle {
  focus: () => void
}

export type ValueCompletion =
  | string
  | { value: string; label: string; matchQuery?: string }

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
  variableAware?: boolean
  pathParams?: ParamEntry[]
  pathCompletion?: PathCompletionOptions
  completionValues?: readonly ValueCompletion[]
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
      variableAware = true,
      pathParams,
      pathCompletion,
      completionValues,
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

    const getEditable = useCallback(() => {
      const editable = inputRef.current ?? textareaRef.current
      return editable && !editable.isDestroyed ? editable : null
    }, [])
    const suggestionNames = useMemo(() => {
      if (!variableAware) return []
      if (variableNames != null) return [...variableNames]
      return [
        ...new Set([
          ...Object.keys(env?.vars ?? {}),
          ...Object.keys(env?.secretVars ?? {}),
        ]),
      ]
    }, [variableAware, variableNames, env?.vars, env?.secretVars])

    const inputFocused = isFocused ?? true

    const { completion, acceptSuggestion } = useVariableCompletion({
      getEditor: getEditable,
      variableNames: suggestionNames,
      value,
      isEditing: variableAware && isEditing && inputFocused,
    })

    const applyHighlights = useCallback(() => {
      const editable = getEditable()
      if (!variableAware) {
        editable?.clearAllHighlights()
        return
      }
      if (editable)
        highlightVariables(editable, editable.plainText, theme, env, pathParams)
    }, [env, getEditable, pathParams, theme, variableAware])

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

    const { token, suggestions, isComplete } = completion
    const valueSuggestions = useMemo(() => {
      if (!completionValues) return []
      return completionValues
        .map((suggestion) =>
          typeof suggestion === "string"
            ? { value: suggestion, label: suggestion }
            : suggestion,
        )
        .filter(
          (suggestion) =>
            suggestion.value !== value &&
            (suggestion.matchQuery === undefined
              ? suggestion.value
              : suggestion.label
            )
              .toLowerCase()
              .includes((suggestion.matchQuery ?? value).toLowerCase()),
        )
    }, [completionValues, value])

    const selectValueCompletion = useCallback(
      (index: number): boolean => {
        const editable = getEditable()
        const suggestion = valueSuggestions[index]
        if (!editable?.focused || !suggestion) return false
        editable.replaceText(suggestion.value)
        editable.cursorOffset = suggestion.value.length
        onChange?.(suggestion.value)
        setCompletionDismissed(true)
        return true
      },
      [getEditable, onChange, valueSuggestions],
    )

    const showCompletion =
      isEditing &&
      inputFocused &&
      !completionDismissed &&
      token &&
      suggestions.length > 0 &&
      !isComplete

    const showValueCompletion =
      isEditing &&
      inputFocused &&
      !completionDismissed &&
      valueSuggestions.length > 0

    const completionPopup = pathCompletionState.active ? (
      <Autocomplete
        key="paths"
        id="path-completion-menu"
        items={pathCompletionState.items.map((item) => ({
          key: `${item.type}:${item.name}`,
          label: item.type === "directory" ? `${item.name}/` : item.name,
        }))}
        query={pathCompletionState.query}
        message={pathCompletionState.message}
        getEditor={getEditable}
        value={value}
        onSelect={(index, trigger) =>
          pathCompletionState.selectItem(index, trigger !== "tab")
        }
        onDismiss={pathCompletionState.dismiss}
      />
    ) : showValueCompletion ? (
      <Autocomplete
        key="values"
        id="value-completion-menu"
        items={valueSuggestions.map((suggestion) => ({
          key: suggestion.value,
          label: suggestion.label,
          matchQuery: suggestion.matchQuery,
        }))}
        query={value}
        getEditor={getEditable}
        value={value}
        onSelect={selectValueCompletion}
        onDismiss={() => setCompletionDismissed(true)}
      />
    ) : showCompletion ? (
      <Autocomplete
        key="variables"
        id="var-completion-menu"
        items={suggestions.map((name) => ({ key: name, label: `$${name}` }))}
        query={token.prefix}
        getEditor={getEditable}
        value={value}
        onSelect={(index) => selectCompletion(suggestions[index]!)}
        onDismiss={() => setCompletionDismissed(true)}
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
