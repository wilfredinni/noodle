import { useCallback, useEffect, useMemo, useState } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { Environment } from "../../schema"
import { Autocomplete } from "../Autocomplete"
import { useVariableCompletion } from "../variable-completion/useVariableCompletion"

export function CodeEditorCompletion({
  editor,
  env,
  isEditing,
  value,
}: {
  editor: CodeEditorRenderable | null
  env: Environment | null
  isEditing: boolean
  value: string
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
      items={completion.suggestions.map((name) => ({
        key: name,
        label: `$${name}`,
      }))}
      query={completion.token.prefix}
      value={value}
      getEditor={getEditor}
      onSelect={(index) => {
        if (!acceptSuggestion(completion.suggestions[index]!)) return false
        setDismissed(true)
        return true
      }}
      onDismiss={() => setDismissed(true)}
    />
  )
}
