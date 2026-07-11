import { useCallback, useMemo } from "react"
import {
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
  type VariableToken,
} from "./variableCompletion"

export interface CompletionEditor {
  plainText: string
  cursorOffset: number
  focused: boolean
  isDestroyed: boolean
  replaceText(text: string): void
}

export interface CompletionState {
  token: VariableToken | null
  suggestions: string[]
  isComplete: boolean
}

interface CompletionKeyEvent {
  name: string
  preventDefault: () => void
  stopPropagation: () => void
  defaultPrevented?: boolean
}

export const MAX_COMPLETION_VISIBLE = 10

export function useVariableCompletion({
  getEditor,
  variableNames,
  value,
  isEditing,
}: {
  getEditor: () => CompletionEditor | null
  variableNames: string[]
  value: string
  isEditing: boolean
}) {
  const getCompletion = useCallback((): CompletionState => {
    const editor = getEditor()
    const text = editor?.plainText ?? value
    const cursorOffset = editor?.cursorOffset ?? text.length
    const token = getVariableToken(text, cursorOffset)
    const suggestions = token
      ? getVariableSuggestions(variableNames, token.prefix)
      : []
    const tokenText = token ? text.slice(token.start + 1, token.end) : ""
    const isComplete =
      suggestions.length === 1 &&
      cursorOffset === token?.end &&
      suggestions[0] === tokenText
    return { token, suggestions, isComplete }
  }, [getEditor, variableNames, value])

  const completion = useMemo(() => getCompletion(), [getCompletion])

  const makeHandleKey = useCallback(
    ({
      completionDismissed,
      completionIndex,
      setCompletionIndex,
      setCompletionDismissed,
      onAccept,
    }: {
      completionDismissed: boolean
      completionIndex: number
      setCompletionIndex: (fn: (current: number) => number) => void
      setCompletionDismissed: (dismissed: boolean) => void
      onAccept: (name: string) => void
    }) =>
      (key: CompletionKeyEvent): boolean => {
        const editor = getEditor()
        if (
          !isEditing ||
          !editor ||
          editor.isDestroyed ||
          !editor.focused ||
          completionDismissed ||
          key.defaultPrevented
        ) {
          return false
        }
        const { token, suggestions, isComplete } = getCompletion()
        if (!token || suggestions.length === 0 || isComplete) return false

        if (key.name === "up" || key.name === "down") {
          const max = Math.min(suggestions.length, MAX_COMPLETION_VISIBLE)
          setCompletionIndex((current) => {
            const next = current + (key.name === "up" ? -1 : 1)
            return next < 0 ? max - 1 : next >= max ? 0 : next
          })
          return true
        }

        if (key.name === "tab" || key.name === "return") {
          const idx = Math.min(
            completionIndex,
            Math.min(suggestions.length, MAX_COMPLETION_VISIBLE) - 1,
          )
          const name = suggestions[idx] ?? suggestions[0]!
          const result = replaceVariableToken(editor.plainText, token, name)
          editor.replaceText(result.value)
          editor.cursorOffset = result.cursorOffset
          setCompletionDismissed(true)
          onAccept(name)
          return true
        }

        if (key.name === "escape") {
          setCompletionDismissed(true)
          return true
        }

        return false
      },
    [getEditor, getCompletion, isEditing],
  )

  return { completion, getCompletion, makeHandleKey }
}
