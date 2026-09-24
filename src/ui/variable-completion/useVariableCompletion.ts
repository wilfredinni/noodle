import { useCallback, useMemo } from "react"
import {
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
  type VariableToken,
  bodyVariableNames,
  type BodyCompletion,
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
  body,
}: {
  getEditor: () => CompletionEditor | null
  variableNames: string[]
  value: string
  isEditing: boolean
  body?: BodyCompletion
}) {
  const getCompletion = useCallback((): CompletionState => {
    const editor = getEditor()
    const text = editor?.plainText ?? value
    const cursorOffset = editor?.cursorOffset ?? text.length
    const token = getVariableToken(text, cursorOffset, body)
    const suggestions = token
      ? getVariableSuggestions(
          body ? bodyVariableNames(variableNames, token.prefix) : variableNames,
          token.prefix,
        )
      : []
    const tokenText = token ? text.slice(token.start + 1, token.end) : ""
    const isComplete =
      tokenText !== "random." &&
      cursorOffset === token?.end &&
      suggestions.includes(tokenText)
    return { token, suggestions, isComplete }
  }, [getEditor, variableNames, value, body])

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

      const result = replaceVariableToken(editor.plainText, token, name, body)
      editor.replaceText(result.value)
      editor.cursorOffset = result.cursorOffset
      return true
    },
    [getCompletion, getEditor, isEditing, body],
  )

  return { completion, getCompletion, acceptSuggestion }
}
