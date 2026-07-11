import { useCallback, useEffect, useMemo, useState } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { Environment } from "../../schema"
import { registerVariableCompletion } from "../variableCompletionInterceptor"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "../theme"
import {
  useVariableCompletion,
  MAX_COMPLETION_VISIBLE,
} from "../useVariableCompletion"

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
  const theme = useTheme()
  const renderer = useRenderer()
  const { width: terminalWidth, height: terminalHeight } =
    useTerminalDimensions()
  const [completionDismissed, setCompletionDismissed] = useState(false)
  const [completionIndex, setCompletionIndex] = useState(0)

  const getEditor = useCallback(() => {
    if (!editor || editor.isDestroyed) return null
    return editor
  }, [editor])

  const variableNames = useMemo(() => Object.keys(env?.vars ?? {}), [env?.vars])

  const { completion, makeHandleKey } = useVariableCompletion({
    getEditor,
    variableNames,
    value,
    isEditing,
  })

  const handleKey = useMemo(
    () =>
      makeHandleKey({
        completionDismissed,
        completionIndex,
        setCompletionIndex,
        setCompletionDismissed,
        onAccept: () => {},
      }),
    [completionDismissed, completionIndex, makeHandleKey],
  )

  useEffect(() => {
    if (!isEditing || !editor || completion.suggestions.length === 0) return
    const dispose = registerVariableCompletion(handleKey)
    return () => {
      dispose()
    }
  }, [completion.suggestions.length, editor, handleKey, isEditing])

  useEffect(() => {
    setCompletionDismissed(false)
    setCompletionIndex(0)
  }, [completion.token?.prefix])

  useEffect(() => {
    if (!isEditing || !editor) return
    editor.refreshHighlights()
    const onChange = () => {
      setCompletionDismissed(false)
    }
    editor.on("content-changed", onChange)
    return () => {
      editor.off("content-changed", onChange)
    }
  }, [editor, isEditing])

  if (
    !isEditing ||
    !editor ||
    completionDismissed ||
    !completion.token ||
    completion.suggestions.length === 0 ||
    completion.isComplete
  )
    return null

  const cursor = editor.visualCursor
  const menuHeight =
    Math.min(completion.suggestions.length, MAX_COMPLETION_VISIBLE) + 2
  const menuWidth = 18
  const x = Math.max(
    0,
    Math.min(editor.x + cursor.visualCol, terminalWidth - menuWidth),
  )
  const y = Math.max(
    0,
    Math.min(editor.y + cursor.visualRow + 1, terminalHeight - menuHeight),
  )

  return createPortal(
    <box
      id="var-completion-menu"
      style={{
        position: "absolute",
        top: y,
        left: x,
        zIndex: 10000,
        flexDirection: "column",
        minWidth: 16,
        backgroundColor: theme.backgroundPanel,
        paddingLeft: 1,
        paddingRight: 1,
      }}
      borderStyle="single"
      borderColor={theme.borderActive}
    >
      {completion.suggestions
        .slice(0, MAX_COMPLETION_VISIBLE)
        .map((name, index) => (
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
