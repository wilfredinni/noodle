import { useCallback, useEffect, useMemo, useState } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { Environment } from "../../schema"
import { Autocomplete } from "../Autocomplete"
import { useVariableCompletion } from "../variable-completion/useVariableCompletion"
import {
  variableCompletionItem,
  type BodyCompletion,
} from "../variable-completion/variableCompletion"

export function CodeEditorCompletion({
  editor,
  env,
  isEditing,
  value,
  body,
}: {
  editor: CodeEditorRenderable | null
  env: Environment | null
  isEditing: boolean
  value: string
  body?: BodyCompletion
}) {
  const [dismissed, setDismissed] = useState(false)
  const getEditor = useCallback(
    () => (editor && !editor.isDestroyed ? editor : null),
    [editor],
  )
  const variableNames = useMemo(() => Object.keys(env?.vars ?? {}), [env?.vars])
  const { completion, acceptSuggestion } = useVariableCompletion({
    getEditor,
    variableNames,
    value,
    isEditing,
    body,
  })

  useEffect(() => {
    setDismissed(false)
  }, [completion.token?.prefix])

  useEffect(() => {
    if (!isEditing || !editor) return
    editor.refreshHighlights()
    const onChange = () => setDismissed(false)
    editor.on("content-changed", onChange)
    return () => {
      editor.off("content-changed", onChange)
    }
  }, [editor, isEditing])

  if (
    !isEditing ||
    !editor ||
    dismissed ||
    !completion.token ||
    completion.suggestions.length === 0 ||
    completion.isComplete
  )
    return null

  return (
    <Autocomplete
      id="var-completion-menu"
      items={completion.suggestions.map((name) =>
        variableCompletionItem(name, body),
      )}
      query={completion.token.prefix}
      value={value}
      getEditor={getEditor}
      onSelect={(index) => {
        if (!acceptSuggestion(completion.suggestions[index]!)) return false
        setDismissed(!completion.suggestions[index]!.endsWith("."))
        return true
      }}
      onDismiss={() => setDismissed(true)}
    />
  )
}
