import type { ScriptPhase } from "../../preRequestScript"
import { scriptCompletions } from "./scriptCompletion"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  scriptPhase,
}: {
  editor: CodeEditorRenderable | null
  env: Environment | null
  isEditing: boolean
  value: string
  scriptPhase?: ScriptPhase
  body?: BodyCompletion
}) {
  const [, refreshCursor] = useState(0)
  const cursorRef = useRef(editor?.cursorOffset)
  cursorRef.current = editor?.cursorOffset
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
    isEditing: isEditing && !scriptPhase,
    body,
  })

  useEffect(() => {
    setDismissed(false)
  }, [completion.token?.prefix])

  useEffect(() => {
    if (!isEditing || !editor) return
    editor.refreshHighlights()
    const onChange = () => {
      if (cursorRef.current === editor.cursorOffset) return
      cursorRef.current = editor.cursorOffset
      setDismissed(false)
      refreshCursor((n) => n + 1)
    }
    if (scriptPhase) editor.editBuffer.on("cursor-changed", onChange)
    return () => {
      editor.editBuffer.off("cursor-changed", onChange)
    }
  }, [editor, isEditing, scriptPhase])

  if (scriptPhase) {
    const result =
      editor && scriptCompletions(value, editor.cursorOffset, scriptPhase)
    if (!isEditing || !editor || dismissed || !result?.items.length) return null
    return (
      <Autocomplete
        id="script-completion-menu"
        compactDetails
        items={result.items}
        query={result.query}
        value={value}
        getEditor={getEditor}
        onSelect={(index) => {
          const item = result.items[index]
          if (!item) return false
          editor.replaceText(
            value.slice(0, result.start) +
              item.insert +
              value.slice(result.end),
          )
          editor.cursorOffset = result.start + item.insert.length
          setDismissed(true)
          return true
        }}
        onDismiss={() => setDismissed(true)}
      />
    )
  }

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
