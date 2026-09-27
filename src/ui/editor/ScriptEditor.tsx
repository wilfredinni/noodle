import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { extend } from "@opentui/react"
import { MouseButton, type LineNumberRenderable } from "@opentui/core"
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
import { VarInput } from "../VarInput"
import { SettingsField } from "../settings/SettingsField"
import { useTheme } from "../theme"
import type { ScriptOrder } from "../overlays/ScriptOrderOverlay"
import { createScriptDiagnostics } from "./scriptDiagnostics"
import type { ScriptCompletionContext } from "./scriptCompletion"
import { RESERVED_FOLD_SIGN, syncCodeEditorGutter } from "./codeEditorGutter"
import { useFormattingTarget } from "./CodeFormattingContext"

export type ActiveScriptSource = { value: string; source: ScriptSource }
const emptyCompletionContext: ScriptCompletionContext = {
  environmentKeys: [],
  requestIds: [],
}
export type ScriptActions = {
  open?: () => boolean
  order?: () => boolean
}
export const ScriptAuthoringContext = createContext<{
  collectionDir: string
  collection: Collection | null
  overlayActive?: boolean
  diagnostics?: ReturnType<typeof createScriptDiagnostics>
  completionContext?: ScriptCompletionContext
  completionShortcut?: string
  confirm: (action: () => void) => void
  setActive: (source: ActiveScriptSource | null) => void
  setActiveOrder?: (order: ScriptOrder | null) => void
  showOrder?: (order: ScriptOrder) => void
  open?: (source: ActiveScriptSource) => void
  formatOnSave?: boolean
} | null>(null)

function ScriptLink({
  id,
  children,
  onClick,
}: {
  id: string
  children: string
  onClick: () => void
}) {
  const theme = useTheme()
  return (
    <text
      id={id}
      fg={theme.primary}
      flexShrink={0}
      maxWidth="100%"
      wrapMode="word"
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
      <span fg={theme.textMuted}>.</span>
    </text>
  )
}

export function ScriptDescription({
  children,
  onShowOrder,
  onOpenExternal,
}: {
  children: string
  onShowOrder?: () => void
  onOpenExternal?: () => void
}) {
  const theme = useTheme()
  const description = `${children}${onShowOrder ? " See " : onOpenExternal ? " Open in " : ""}`
  const onClick = onShowOrder ?? onOpenExternal
  return (
    <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
      {description.split(/(?<= )/).map((word, index) => (
        <text
          key={index}
          fg={theme.textMuted}
          flexShrink={0}
          maxWidth="100%"
          wrapMode="word"
        >
          {word}
        </text>
      ))}
      {onClick && (
        <ScriptLink
          id={onShowOrder ? "script-order-link" : "script-external-editor-link"}
          onClick={onClick}
        >
          {onShowOrder ? "execution order" : "external editor"}
        </ScriptLink>
      )}
    </box>
  )
}

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
  onShowOrder,
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
  onShowOrder?: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const context = useContext(ScriptAuthoringContext)
  const [localDiagnostics] = useState(createScriptDiagnostics)
  const diagnostics = context?.diagnostics ?? localDiagnostics
  useEffect(() => () => localDiagnostics.dispose(), [localDiagnostics])
  const overlayActive = context?.overlayActive ?? false
  const [editor, setEditor] = useState<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const hoveredFoldLineRef = useRef<number | null>(null)
  const syncFoldSigns = (hoveredFoldLine?: number) => {
    if (editor && lineNumberRef.current)
      syncCodeEditorGutter(
        lineNumberRef.current,
        editor,
        hoveredFoldLine,
        theme.primary,
      )
  }
  const [selectedKind, setKind] = useState(
    value.startsWith("./") ? "external" : "inline",
  )
  const kind =
    value && value !== "."
      ? value.startsWith("./")
        ? "external"
        : "inline"
      : selectedKind
  const [error, setError] = useState<{ title?: string; detail: string } | null>(
    null,
  )
  const [selectOpen, setSelectOpen] = useState(false)
  const [control, setControl] = useState(0)
  const diagnosticsRef = useRef(onDiagnostics)
  diagnosticsRef.current = onDiagnostics
  const sourceKey = JSON.stringify(source)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const externalFocused = kind === "external" && focused
  useFormattingTarget(
    editor,
    focused && interactive && kind === "inline",
    phase,
    source.scope,
  )

  useEffect(
    () => setError(null),
    [sourceKey, phase, kind, context?.collectionDir],
  )

  useEffect(() => {
    if (value) setKind(kind)
  }, [kind, sourceKey, value])

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        if (kind === "external" && !isExternalScriptSource(value))
          throw new Error("Use a collection-relative ./path/to/file.js")
        validateScriptSource(value)
        const resolved = await createScriptSourceResolver(
          context?.collectionDir,
        ).resolve(value, sourceRef.current)
        const diagnostic = await validateScriptSyntax(resolved.text)
        if (!current) return
        if (diagnostic) {
          setError({
            detail: `${diagnostic.name} at ${diagnostic.line ?? 1}:${diagnostic.column ?? 1}: ${diagnostic.message}`,
          })
          return
        }
        const result = await diagnostics.check(
          resolved.text,
          phase,
          controller.signal,
        )
        if (current) {
          const first = result.first
          setError(
            first
              ? {
                  title: `JavaScript at ${first.line}:${first.column}${result.count > 1 ? ` (+${result.count - 1} more)` : ""}`,
                  detail: first.message,
                }
              : null,
          )
        }
      })()
        .catch((reason: unknown) => {
          if (current)
            setError({
              detail:
                reason instanceof Error
                  ? reason.message
                  : "Unable to validate script",
            })
        })
        .finally(() => {
          if (current) {
            diagnosticsRef.current?.()
          }
        })
    }, diagnosticDelayMs)
    return () => {
      current = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [
    value,
    phase,
    diagnostics,
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
      kind === "external" && !selectOpen
        ? { value, source: sourceRef.current }
        : null,
    )
    return () => setActive?.(null)
  }, [focused, kind, value, sourceKey, setActive, selectOpen])

  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          if (
            !focused ||
            !interactive ||
            selectOpen ||
            keymap.getData("app.jump") === "active" ||
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
            setControl(0)
          } else if (editing && event.name === "tab") {
            consume()
            onExit()
            setControl(0)
            keymap.dispatchCommand("focus.next")
          } else if (editing && kind === "inline" && event.name === "return") {
            consume()
            editor?.handleKeyPress(event)
          } else if (!editing && kind === "external") {
            if (event.name === "return" && control > 0) {
              consume()
              onActivate()
            } else if (
              event.name === "up" ||
              event.name === "down" ||
              event.name === "tab"
            ) {
              const direction = event.name === "up" || event.shift ? -1 : 1
              const next = control + direction
              if (next >= 0 && next <= 1) {
                consume()
                setControl(next)
              }
            }
          } else if (
            !editing &&
            !event.shift &&
            (event.name === "up" ||
              event.name === "down" ||
              event.name === "tab")
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
    if (focused && editing && !selectOpen && !overlayActive) editor.focus()
    else editor.blur()
  }, [editor, focused, editing, selectOpen, overlayActive])

  useEffect(() => {
    if (!focused) return
    onControlFocus?.(
      `script-${editing ? (kind === "inline" ? "source" : "path") : kind === "external" && control === 1 ? "path" : "source-field"}`,
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
      minWidth={0}
      overflow="hidden"
    >
      <box flexShrink={0} marginBottom={1} zIndex={selectOpen ? 1 : undefined}>
        <box id="script-source-field">
          <Select
            items={[
              { id: "inline", label: "Inline" },
              {
                id: "external",
                label: "External file",
              },
            ]}
            value={kind}
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
        </box>
        <ScriptDescription onShowOrder={onShowOrder}>
          Write inline or use a .js file.
        </ScriptDescription>
      </box>
      {kind === "inline" ? (
        <box
          flexDirection="column"
          flexGrow={1}
          flexBasis={0}
          minHeight={2}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            event.stopPropagation()
            if (interactive) onActivate()
          }}
        >
          <box flexDirection="row" flexGrow={1} flexBasis={0} minHeight={0}>
            <line-number
              id="script-line-numbers"
              ref={lineNumberRef}
              minWidth={4}
              paddingRight={1}
              fg={theme.textMuted}
              bg={theme.backgroundPanel}
              flexGrow={1}
              flexBasis={0}
              minHeight={0}
              lineSigns={RESERVED_FOLD_SIGN}
              onMouseMove={(event) => {
                const displayLine =
                  editor && event.x === lineNumberRef.current?.x
                    ? editor.lineInfo.lineSources[
                        event.y - editor.y + editor.scrollY
                      ]
                    : undefined
                const hovered =
                  displayLine !== undefined &&
                  editor?.getFoldSigns().has(displayLine)
                    ? displayLine
                    : null
                if (hovered === hoveredFoldLineRef.current) return
                hoveredFoldLineRef.current = hovered
                syncFoldSigns(hovered ?? undefined)
              }}
              onMouseOut={() => {
                if (hoveredFoldLineRef.current === null) return
                hoveredFoldLineRef.current = null
                syncFoldSigns()
              }}
              onMouseDown={(event) => {
                if (
                  event.button !== MouseButton.LEFT ||
                  !editor ||
                  event.x >= editor.x
                )
                  return
                const displayLine =
                  editor.lineInfo.lineSources[
                    event.y - editor.y + editor.scrollY
                  ]
                if (
                  displayLine === undefined ||
                  !editor.getFoldSigns().has(displayLine)
                )
                  return
                editor.toggleFold(displayLine)
                event.preventDefault()
                event.stopPropagation()
              }}
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
                formatContent={(text) => diagnostics.format(text, phase)}
                theme={theme}
                value={value}
                readOnly={!interactive || !editing}
                flexGrow={1}
                flexBasis={0}
                minHeight={0}
                onFoldsChange={() => {
                  hoveredFoldLineRef.current = null
                  syncFoldSigns()
                }}
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
            isEditing={focused && editing && !overlayActive}
            value={value}
            scriptPhase={phase}
            script={{
              service: diagnostics,
              sourceKey,
              context: context?.completionContext ?? emptyCompletionContext,
              shortcut: context?.completionShortcut ?? "ctrl+space",
            }}
          />
        </box>
      ) : (
        <box flexDirection="column" flexShrink={0} minHeight={4}>
          <SettingsField
            title="File"
            active={focused && (editing || control === 1)}
            onMouseDown={
              interactive
                ? () => {
                    setControl(1)
                    onActivate()
                  }
                : undefined
            }
          >
            <VarInput
              id="script-path"
              value={value}
              env={null}
              variableAware={false}
              isEditing
              placeholder="./scripts/example.js"
              style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              paddingX={0}
              isFocused={focused && editing && interactive && !overlayActive}
              pathCompletion={
                context?.collectionDir
                  ? {
                      kind: "file",
                      relativeRoot: context.collectionDir,
                      fileExtension: ".js",
                    }
                  : undefined
              }
              onFocus={() => {
                if (interactive) {
                  setControl(1)
                  onActivate()
                }
              }}
              onChange={(text) => {
                if (interactive)
                  onChange(
                    !text || text === "." || text.startsWith("./")
                      ? text
                      : `./${text}`,
                  )
              }}
            />
          </SettingsField>
          <ScriptDescription
            onOpenExternal={() => {
              if (
                selectOpen ||
                overlayActive ||
                keymap.getData("app.overlay") !== "none" ||
                keymap.getData("app.jump") === "active"
              )
                return
              onFocus?.()
              context?.open?.({ value, source })
            }}
          >
            Relative to the collection root.
          </ScriptDescription>
        </box>
      )}
      {kind === "inline" ? (
        <box
          height={error ? (error.title ? 2 : 1) : 0}
          flexShrink={1}
          minHeight={0}
          overflow="hidden"
          flexDirection="column"
        >
          {error && <ValidationNotice {...error} />}
        </box>
      ) : error ? (
        <ValidationNotice {...error} />
      ) : null}
    </box>
  )
}
