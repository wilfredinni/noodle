import { useCallback, useEffect, useMemo, useState } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { Environment } from "../schema"
import {
  getVariableSuggestions,
  getVariableToken,
  replaceVariableToken,
} from "./variableCompletion"
import { registerVariableCompletion } from "./variableCompletionInterceptor"
import {
  createPortal,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import { useTheme } from "./theme"

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
  const [revision, setRevision] = useState(0)

  const completion = useMemo(() => {
    const text = editor?.plainText ?? ""
    const cursorOffset = editor?.cursorOffset ?? text.length
    const token = getVariableToken(text, cursorOffset)
    const suggestions = token
      ? getVariableSuggestions(Object.keys(env?.vars ?? {}), token.prefix)
      : []
    const tokenText = token ? text.slice(token.start + 1, token.end) : ""
    const isComplete =
      suggestions.length === 1 &&
      cursorOffset === token?.end &&
      suggestions[0] === tokenText
    return { token, suggestions, isComplete }
  }, [editor, env?.vars, revision, value])

  const handleKey = useCallback(
    (key: {
      name: string
      preventDefault: () => void
      stopPropagation: () => void
      defaultPrevented?: boolean
    }) => {
      if (
        !isEditing ||
        !editor ||
        editor.isDestroyed ||
        !editor.focused ||
        completionDismissed ||
        key.defaultPrevented
      )
        return false
      const { token, suggestions, isComplete } = completion
      if (!token || suggestions.length === 0 || isComplete) return false
      if (key.name === "up" || key.name === "down") {
        const max = Math.min(suggestions.length, 10)
        setCompletionIndex((current) => {
          const next = current + (key.name === "up" ? -1 : 1)
          return next < 0 ? max - 1 : next >= max ? 0 : next
        })
        return true
      }
      if (key.name === "tab" || key.name === "return") {
        const name = suggestions[completionIndex] ?? suggestions[0]!
        const result = replaceVariableToken(editor.plainText, token, name)
        editor.replaceText(result.value)
        editor.cursorOffset = result.cursorOffset
        setCompletionDismissed(true)
        setRevision((value) => value + 1)
        return true
      }
      if (key.name === "escape") {
        setCompletionDismissed(true)
        return true
      }
      return false
    },
    [completion, completionDismissed, completionIndex, editor, isEditing],
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
    const onChange = () => {
      setCompletionDismissed(false)
      setRevision((value) => value + 1)
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
  const menuHeight = Math.min(completion.suggestions.length, 10) + 2
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
      {completion.suggestions.slice(0, 10).map((name, index) => (
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
