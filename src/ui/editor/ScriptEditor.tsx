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
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "./CodeEditor"
import { CodeEditorCompletion } from "./CodeEditorCompletion"
import { ValidationNotice } from "./ValidationNotice"
import { Select } from "../Select"
import { SettingsField } from "../settings/SettingsField"
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
  onControlFocus,
  onFocus,
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
  onControlFocus?: (id: string) => void
  onFocus?: () => void
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
          const consume = () => {
            event.preventDefault()
            event.stopPropagation()
          }
          if (
            editing &&
            (event.name === "escape" || (event.name === "tab" && event.shift))
          ) {
            consume()
            onExit()
            setControl(kind === "external" ? 1 : 0)
          } else if (editing && kind === "external" && event.name === "tab") {
            consume()
            onExit()
            setControl(2)
          } else if (
            editing &&
            kind === "inline" &&
            (event.name === "return" || event.name === "tab")
          ) {
            consume()
            if (event.name === "tab") editor?.insertText("  ")
            else editor?.handleKeyPress(event)
          } else if (!editing && kind === "external") {
            if (event.name === "return" && control > 0) {
              consume()
              if (control === 2) context?.open({ value, source })
              else onActivate()
            } else if (
              event.name === "up" ||
              event.name === "down" ||
              event.name === "tab"
            ) {
              const direction = event.name === "up" || event.shift ? -1 : 1
              const next = control + direction
              if (next >= 0 && next <= 2) {
                consume()
                setControl(next)
              }
            }
          } else if (
            !editing &&
            !event.shift &&
            (event.name === "down" || event.name === "tab")
          ) {
            consume()
            setControl(0)
            onActivate()
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

  useEffect(() => {
    if (!focused) return
    onControlFocus?.(
      `script-${editing ? (kind === "inline" ? "source" : "path") : kind === "external" && control === 2 ? "open" : kind === "external" && control === 1 ? "path" : "source-field"}`,
    )
  }, [focused, editing, kind, control, onControlFocus])

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
      <box flexShrink={0} marginBottom={1} zIndex={selectOpen ? 1 : undefined}>
        <SettingsField
          id="script-source-field"
          title="Source"
          description="Write JavaScript inline or use a .js file from this collection."
          active={focused && !editing && control === 0}
        >
          <Select
            items={[
              { id: "inline", label: "Inline" },
              { id: "external", label: "External file" },
            ]}
            value={kind}
            fitContent
            focused={focused && !editing && control === 0}
            interactive={interactive}
            onActivate={() => {
              onFocus?.()
              setControl(0)
              onExit()
            }}
            onChange={changeKind}
            onOpenChange={(open) => {
              setSelectOpen(open)
              onSelectOpenChange?.(open)
            }}
          />
        </SettingsField>
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
        <box flexDirection="column" flexShrink={0} minHeight={4} gap={1}>
          <SettingsField
            title="File"
            active={focused && (editing || control === 1)}
            description="Relative to the collection root."
            onMouseDown={
              interactive
                ? () => {
                    setControl(1)
                    onActivate()
                  }
                : undefined
            }
          >
            <input
              id="script-path"
              value={value}
              placeholder="./scripts/example.js"
              flexGrow={1}
              minWidth={0}
              focused={focused && editing}
              onMouseDown={() => {
                if (interactive) {
                  setControl(1)
                  onActivate()
                }
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
          </SettingsField>
          <ActionButton
            id="script-open"
            label="Open in external editor"
            focused={focused && !editing && control === 2}
            disabled={!interactive}
            onAction={() => {
              onFocus?.()
              context?.open({ value, source })
            }}
          />
        </box>
      )}
      {error && <ValidationNotice detail={error} />}
    </box>
  )
}
