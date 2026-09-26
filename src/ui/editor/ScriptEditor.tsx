import { ActionButton } from "../ActionButton"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { extend } from "@opentui/react"
import { MouseButton } from "@opentui/core"
import type { Collection } from "../../schema"
import {
  validateScriptSyntax,
  type ScriptPhase,
  type ScriptSource,
} from "../../preRequestScript"
import { createScriptSourceResolver } from "../../scriptSourceResolver"
import {
  isExternalScriptSource,
  validateScriptSource,
} from "../../lang/scriptSource"
import { requestScriptBlocks, scriptSourceLabel } from "../../scriptInheritance"
import { scriptText } from "../../scriptAuthoring"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "./CodeEditor"
import { CodeEditorCompletion } from "./CodeEditorCompletion"
import { ValidationNotice } from "./ValidationNotice"
import { Select } from "../Select"
import { useTheme } from "../theme"

export type ActiveScriptSource = { value: string; source: ScriptSource }
export const ScriptAuthoringContext = createContext<{
  collectionDir: string
  collection: Collection | null
  confirm: (action: () => void) => void
  open: (source: ActiveScriptSource) => void
  setActive: (source: ActiveScriptSource | null) => void
} | null>(null)

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})

export function ScriptEditor({
  value,
  phase,
  source,
  focused,
  editing,
  interactive = true,
  onChange,
  onActivate,
  onExit,
  onSelectOpenChange,
  onDiagnostics,
  diagnosticDelayMs = 200,
}: {
  value: string
  phase: ScriptPhase
  source: ScriptSource
  focused: boolean
  editing: boolean
  interactive?: boolean
  onChange: (value: string) => void
  onActivate: () => void
  onExit: () => void
  diagnosticDelayMs?: number
  onDiagnostics?: () => void
  onSelectOpenChange?: (open: boolean) => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const context = useContext(ScriptAuthoringContext)
  const [editor, setEditor] = useState<CodeEditorRenderable | null>(null)
  const [selectedKind, setKind] = useState(
    value.startsWith("./") ? "external" : "inline",
  )
  const kind =
    value && value !== "."
      ? value.startsWith("./")
        ? "external"
        : "inline"
      : selectedKind
  const [error, setError] = useState<string | null>(null)
  const [selectOpen, setSelectOpen] = useState(false)
  const [control, setControl] = useState(0)
  const diagnosticsRef = useRef(onDiagnostics)
  diagnosticsRef.current = onDiagnostics
  const sourceKey = JSON.stringify(source)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const externalFocused = kind === "external" && focused

  useEffect(() => {
    if (value) setKind(kind)
  }, [kind, sourceKey, value])

  useEffect(() => {
    let current = true
    setError(null)
    const timer = setTimeout(() => {
      void (async () => {
        if (kind === "external" && !isExternalScriptSource(value))
          throw new Error("Use a collection-relative ./path/to/file.js")
        validateScriptSource(value)
        const resolved = await createScriptSourceResolver(
          context?.collectionDir,
        ).resolve(value, sourceRef.current)
        const diagnostic = await validateScriptSyntax(resolved.text)
        if (current)
          setError(
            diagnostic
              ? `${diagnostic.name} at ${diagnostic.line ?? 1}:${diagnostic.column ?? 1}: ${diagnostic.message}`
              : null,
          )
      })()
        .catch((reason: unknown) => {
          if (current)
            setError(
              reason instanceof Error
                ? reason.message
                : "Unable to validate script",
            )
        })
        .finally(() => {
          if (current) {
            diagnosticsRef.current?.()
          }
        })
    }, diagnosticDelayMs)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [
    value,
    kind,
    sourceKey,
    context?.collectionDir,
    externalFocused,
    diagnosticDelayMs,
  ])

  const setActive = context?.setActive
  useEffect(() => {
    if (!focused) return
    setActive?.(
      kind === "external" ? { value, source: sourceRef.current } : null,
    )
    return () => setActive?.(null)
  }, [focused, kind, value, sourceKey, setActive])

  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          if (
            !focused ||
            !interactive ||
            selectOpen ||
            event.ctrl ||
            event.meta ||
            event.option ||
            event.super ||
            event.hyper ||
            keymap.getData("app.overlay") !== "none"
          )
            return
          if (
            editing &&
            (event.name === "escape" || (event.name === "tab" && event.shift))
          ) {
            event.preventDefault()
            event.stopPropagation()
            onExit()
            setControl(0)
          } else if (
            !editing &&
            kind === "external" &&
            control === 1 &&
            event.name === "tab"
          ) {
            setControl(0)
            if (event.shift) {
              event.preventDefault()
              event.stopPropagation()
            }
          } else if (
            !editing &&
            kind === "external" &&
            control === 1 &&
            event.name === "return"
          ) {
            event.preventDefault()
            event.stopPropagation()
            context?.open({ value, source })
          } else if (editing && kind === "external" && event.name === "tab") {
            event.preventDefault()
            event.stopPropagation()
            onExit()
            setControl(1)
          } else if (
            editing &&
            kind === "inline" &&
            (event.name === "return" || event.name === "tab")
          ) {
            event.preventDefault()
            event.stopPropagation()
            if (event.name === "tab") editor?.insertText("  ")
            else editor?.handleKeyPress(event)
          } else if (
            !editing &&
            !event.shift &&
            (event.name === "down" || event.name === "tab")
          ) {
            event.preventDefault()
            event.stopPropagation()
            if (kind === "external" && control === 0 && event.name === "tab")
              setControl(1)
            else {
              setControl(0)
              onActivate()
            }
          }
        },
        { priority: 150 },
      ),
    [
      keymap,
      control,
      context,
      value,
      sourceKey,
      focused,
      interactive,
      editing,
      kind,
      editor,
      selectOpen,
      onActivate,
      onExit,
    ],
  )

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (focused && editing && !selectOpen) editor.focus()
    else editor.blur()
  }, [editor, focused, editing, selectOpen])

  const changeKind = (next: string) => {
    if (next === kind) return
    const change = () => {
      setKind(next)
      onChange("")
      onExit()
    }
    if (value.length) context?.confirm(change)
    else change()
  }
  return (
    <box
      id="script-editor"
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      minHeight={0}
      overflow="hidden"
    >
      <box
        flexDirection="row"
        flexShrink={0}
        zIndex={selectOpen ? 1 : undefined}
      >
        <Select
          items={[
            { id: "inline", label: "Inline" },
            { id: "external", label: "External file" },
          ]}
          value={kind}
          badge={false}
          fitContent
          focused={focused && !editing && control === 0}
          interactive={interactive}
          onActivate={onExit}
          onChange={changeKind}
          onOpenChange={(open) => {
            setSelectOpen(open)
            onSelectOpenChange?.(open)
          }}
        />
        <text
          fg={theme.textMuted}
          truncate
        >{` ${scriptSourceLabel(source)} · ${phase}`}</text>
      </box>
      {kind === "inline" ? (
        <box
          flexDirection="column"
          flexGrow={1}
          flexBasis={0}
          minHeight={0}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            event.stopPropagation()
            if (interactive) onActivate()
          }}
        >
          <box flexDirection="row" flexGrow={1} flexBasis={0} minHeight={0}>
            <line-number
              id="script-line-numbers"
              minWidth={4}
              paddingRight={1}
              fg={theme.textMuted}
              bg={theme.backgroundPanel}
              flexGrow={1}
              flexBasis={0}
              minHeight={0}
              onMouseScroll={(event) => {
                if (!editor || !event.scroll) return
                if (event.scroll.direction === "up")
                  editor.scrollBy(-event.scroll.delta)
                else if (event.scroll.direction === "down")
                  editor.scrollBy(event.scroll.delta)
                else return
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <code-editor
                id="script-source"
                ref={setEditor}
                filetype="javascript"
                theme={theme}
                value={value}
                readOnly={!interactive || !editing}
                flexGrow={1}
                flexBasis={0}
                minHeight={0}
                foldable={false}
                onSourceChange={() => {
                  if (editing && editor) onChange(editor.plainText)
                }}
                backgroundColor={theme.backgroundPanel}
                focusedBackgroundColor={theme.backgroundPanel}
                textColor={theme.text}
                focusedTextColor={theme.text}
                cursorColor={theme.primary}
                scrollMargin={0}
              />
            </line-number>
            <code-editor-scrollbar
              id="script-scrollbar"
              target={editor}
              trackOptions={{
                backgroundColor: theme.background,
                foregroundColor: theme.borderActive,
              }}
              width={1}
              flexShrink={0}
              zIndex={1}
            />
          </box>
          <CodeEditorCompletion
            editor={editor}
            env={null}
            isEditing={focused && editing}
            value={value}
            scriptPhase={phase}
          />
        </box>
      ) : (
        <>
          <input
            id="script-path"
            value={value}
            placeholder="./scripts/example.js"
            focused={focused && editing}
            onMouseDown={() => {
              if (interactive) onActivate()
            }}
            onInput={(text) => {
              if (interactive)
                onChange(
                  !text || text === "." || text.startsWith("./")
                    ? text
                    : `./${text}`,
                )
            }}
            textColor={theme.text}
            focusedTextColor={theme.text}
          />
          <ActionButton
            id="script-open"
            label="Open in external editor"
            focused={focused && !editing && control === 1}
            disabled={!interactive}
            onAction={() => context?.open({ value, source })}
          />
        </>
      )}
      {error && <ValidationNotice detail={error} />}
    </box>
  )
}

export function ScriptInheritance({
  request,
  phase,
}: {
  request: Parameters<typeof requestScriptBlocks>[0]
  phase: ScriptPhase
}) {
  const context = useContext(ScriptAuthoringContext)
  const theme = useTheme()
  const blocks = requestScriptBlocks(request, context?.collection ?? undefined)
  const ordered = (phase === "post" ? [...blocks].reverse() : blocks).filter(
    (block) => scriptText(block, phase),
  )
  if (!ordered.some((block) => block.source.scope !== "request")) return null
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={theme.textMuted} truncate>{`${phase}: ${ordered
        .map((block) => {
          const value = scriptText(block, phase)
          return `${block.source.scope === "request" ? "request (adds)" : scriptSourceLabel(block.source)}${isExternalScriptSource(value) ? ` ${value}` : ""}`
        })
        .join(" → ")}`}</text>
    </box>
  )
}
