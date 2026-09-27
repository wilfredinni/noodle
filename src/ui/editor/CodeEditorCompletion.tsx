import type { ScriptPhase } from "../../preRequestScript"
import {
  scriptCompletions,
  type ScriptAssistance,
  type ScriptCompletionContext,
} from "./scriptCompletion"
import type { createScriptDiagnostics } from "./scriptDiagnostics"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CodeEditorRenderable } from "./CodeEditor"
import type { Environment } from "../../schema"
import { Autocomplete } from "../Autocomplete"
import { isScriptCompletionBinding } from "../keybind"
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
  script,
}: {
  editor: CodeEditorRenderable | null
  env: Environment | null
  isEditing: boolean
  value: string
  scriptPhase?: ScriptPhase
  script?: {
    service: ReturnType<typeof createScriptDiagnostics>
    context: ScriptCompletionContext
    sourceKey: string
    shortcut: string
  }
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
    isEditing: isEditing && !scriptPhase,
    body,
  })

  useEffect(() => {
    setDismissed(false)
  }, [scriptPhase ? value : completion.token?.prefix])

  useEffect(() => {
    if (isEditing && editor) editor.refreshHighlights()
  }, [editor, isEditing])

  if (scriptPhase && script)
    return (
      <ScriptCodeCompletion
        editor={editor}
        value={value}
        isEditing={isEditing}
        phase={scriptPhase}
        {...script}
      />
    )

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

function ScriptCodeCompletion({
  editor,
  value,
  isEditing,
  phase,
  service,
  context,
  sourceKey,
  shortcut,
}: {
  editor: CodeEditorRenderable | null
  value: string
  isEditing: boolean
  phase: ScriptPhase
  service: ReturnType<typeof createScriptDiagnostics>
  context: ScriptCompletionContext
  sourceKey: string
  shortcut: string
}) {
  const keymap = useKeymap()
  const cursorText = useRef(value)
  const [cursor, setCursor] = useState(editor?.sourceCursorOffset ?? 0)
  const cursorRef = useRef(cursor)
  const [request, setRequest] = useState(0)
  const [dismissed, setDismissed] = useState(true)
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(true)
  const [explicit, setExplicit] = useState(false)
  const [snapshot, setSnapshot] = useState<{
    value: string
    cursor: number
    phase: ScriptPhase
    context: ScriptCompletionContext
    sourceKey: string
    result: ScriptAssistance
  } | null>(null)
  const [selected, setSelected] = useState(0)
  const [detail, setDetail] = useState<{
    key: string
    description?: string
    signature?: string
  } | null>(null)
  const getEditor = useCallback(
    () => (editor && !editor.isDestroyed ? editor : null),
    [editor],
  )
  const trigger = useCallback(() => {
    if (
      !isEditing ||
      !editor?.focused ||
      editor.isDestroyed ||
      keymap.getData("app.jump") === "active" ||
      keymap.getData("app.overlay") !== "none"
    )
      return false
    cursorRef.current = editor.sourceCursorOffset
    setCursor(cursorRef.current)
    setDismissed(false)
    setSuggestionsDismissed(false)
    setExplicit(true)
    setRequest((n) => n + 1)
    return true
  }, [editor, isEditing, keymap])
  useEffect(() => {
    if (!isEditing) return
    const layer = keymap.registerLayer({
      commands: [{ name: "script.complete", run: trigger }],
      bindings:
        shortcut && isScriptCompletionBinding(shortcut)
          ? [{ key: shortcut, cmd: "script.complete" }]
          : [],
    })
    return layer
  }, [isEditing, trigger, keymap, shortcut])
  useEffect(() => {
    setDismissed(true)
    setSuggestionsDismissed(true)
    setSnapshot(null)
    if (!isEditing || !editor) return
    cursorText.current = editor.plainText
    const release = service.retain()
    const change = () => {
      if (editor.isDestroyed || cursorRef.current === editor.sourceCursorOffset)
        return
      cursorRef.current = editor.sourceCursorOffset
      setCursor(cursorRef.current)
      // Native cursor events can precede CodeEditor's source-change notification.
      const text = editor.editBuffer.getText()
      if (text === cursorText.current) setSuggestionsDismissed(true)
      cursorText.current = text
    }
    editor.editBuffer.on("cursor-changed", change)
    return () => {
      editor.editBuffer.off("cursor-changed", change)
      release()
    }
  }, [isEditing, editor, phase, sourceKey, service])
  const previousValue = useRef(value)
  useEffect(() => {
    if (previousValue.current !== value) {
      previousValue.current = value
      setDismissed(false)
      setSuggestionsDismissed(false)
      setExplicit(false)
      cursorRef.current = editor?.sourceCursorOffset ?? 0
      setCursor(cursorRef.current)
    }
  }, [value, editor])
  useEffect(() => {
    if (!isEditing || !editor || dismissed) return
    const controller = new AbortController()
    const actualCursor = editor.sourceCursorOffset
    setSelected(0)
    void service
      .assist(value, phase, actualCursor, context, explicit, controller.signal)
      .then((result) => {
        if (
          !controller.signal.aborted &&
          editor.plainText === value &&
          editor.sourceCursorOffset === actualCursor
        )
          setSnapshot({
            value,
            phase,
            cursor: actualCursor,
            context,
            sourceKey,
            result,
          })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        const fallback = scriptCompletions(value, actualCursor, phase)
        setSnapshot({
          value,
          phase,
          cursor: actualCursor,
          context,
          sourceKey,
          result: {
            query: fallback?.query ?? "",
            items:
              fallback?.items.map((item) => ({
                ...item,
                start: fallback.start,
                end: fallback.end,
              })) ?? [],
          },
        })
      })

    return () => controller.abort()
  }, [
    value,
    phase,
    cursor,
    context,
    sourceKey,
    service,
    isEditing,
    editor,
    dismissed,
    explicit,
    request,
  ])
  const visible =
    snapshot &&
    snapshot.phase === phase &&
    snapshot.sourceKey === sourceKey &&
    snapshot.context === context
      ? snapshot
      : null
  const current =
    visible?.value === value && visible.cursor === editor?.sourceCursorOffset
      ? visible
      : null
  const item =
    isEditing && !dismissed && !suggestionsDismissed
      ? current?.result.items[selected]
      : undefined
  useEffect(() => {
    if (
      !item ||
      item.description ||
      item.key.startsWith("context:") ||
      item.key.startsWith("api:")
    )
      return
    const controller = new AbortController()
    void service
      .details(value, phase, cursor, item.key, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDetail({ ...result, key: item.key })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [item, value, phase, cursor, service])
  if (!isEditing || dismissed || !visible || !editor) return null
  const items = suggestionsDismissed
    ? []
    : visible.result.items.map((item) =>
        item.key === detail?.key ? { ...item, ...detail } : item,
      )
  if (!items.length && !visible.result.signatureHelp) return null
  return (
    <Autocomplete
      id="script-completion-menu"
      compactDetails
      pending={!current}
      items={items}
      query={visible.result.query}
      signatureHelp={visible.result.signatureHelp}
      value={value}
      getEditor={getEditor}
      onHighlight={setSelected}
      onSelect={(index) => {
        // Keep the menu stable during analysis, but never apply an obsolete edit.
        if (!current) return false
        const item = items[index]
        if (
          !item ||
          !editor.focused ||
          editor.isDestroyed ||
          editor.plainText !== current.value ||
          editor.sourceCursorOffset !== current.cursor
        )
          return false
        const next =
          value.slice(0, item.start) + item.insert + value.slice(item.end)
        previousValue.current = next
        editor.unfoldAll()
        editor.replaceText(next)
        editor.cursorOffset = item.start + item.insert.length
        setSuggestionsDismissed(true)
        setDismissed(true)
        return true
      }}
      onDismiss={() => {
        setDismissed(true)
        setSuggestionsDismissed(true)
      }}
    />
  )
}
