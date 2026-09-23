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
      cursorOffset === token?.end && suggestions.includes(tokenText)
    return { token, suggestions, isComplete }
  }, [getEditor, variableNames, value])

  const completion = useMemo(() => getCompletion(), [getCompletion])

  const acceptSuggestion = useCallback(
    (name: string): boolean => {
      const editor = getEditor()
      if (!isEditing || !editor || editor.isDestroyed || !editor.focused) {
        return false
      }

      const { token, suggestions, isComplete } = getCompletion()
      if (
        !token ||
        suggestions.length === 0 ||
        isComplete ||
        !suggestions.includes(name)
      ) {
        return false
      }

      const result = replaceVariableToken(editor.plainText, token, name)
      editor.replaceText(result.value)
      editor.cursorOffset = result.cursorOffset
      return true
    },
    [getCompletion, getEditor, isEditing],
  )

  return { completion, getCompletion, acceptSuggestion }
}
