import { MouseButton, type LineNumberRenderable } from "@opentui/core"
import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { basename, dirname } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { useTheme } from "../theme"
import { Overlay } from "../overlays/Overlay"
import { EscapeClose } from "../overlays/EscapeClose"
import type { CodeEditorRenderable } from "./CodeEditor"
import { ValidationNotice } from "./ValidationNotice"
import { lang } from "../../lang"
import type { Environment } from "../../schema"
import { CodeEditorCompletion } from "./CodeEditorCompletion"
import { getEnvVarHighlights } from "../variable-completion/variableCompletion"
import { RESERVED_FOLD_SIGN, syncCodeEditorGutter } from "./codeEditorGutter"

export interface YamlEditorOverlayProps {
  visible: boolean
  filePath: string
  requestName: string
  onSaved: () => void
  onClose: () => void
  activeEnv?: Environment | null
  kind?: "request" | "folder"
}

export function YamlEditorOverlay({
  visible,
  filePath,
  requestName,
  onSaved,
  onClose,
  activeEnv = null,
  kind = "request",
}: YamlEditorOverlayProps) {
  const theme = useTheme()
  const keymap = useKeymap()
  const editorRef = useRef<CodeEditorRenderable | null>(null)
  const [editorInstance, setEditorInstance] =
    useState<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const hoveredFoldLineRef = useRef<number | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hoveredAction, setHoveredAction] = useState<"save" | "close" | null>(
    null,
  )
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!visible) {
      setContent(null)
      setDraftContent(null)
      setValidationError(null)
      return
    }
    setReadError(null)
    setSaveError(null)

    readFile(filePath, "utf8")
      .then((v) => {
        if (mountedRef.current) {
          setContent(v)
          setDraftContent(v)
        }
      })
      .catch((e) => {
        if (!mountedRef.current) return
        if (kind === "folder" && (e as { code?: string }).code === "ENOENT") {
          setContent("")
          setDraftContent("")
        } else {
          setReadError(e instanceof Error ? e.message : String(e))
        }
      })
  }, [visible, filePath])

  const handleSave = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    setSaveError(null)
    const yamlText = editor.plainText
    try {
      if (kind === "folder") {
        lang.parseFolder(yamlText)
      } else {
        lang.parseRequest(basename(filePath, ".yml"), yamlText)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setSaveError(e instanceof Error ? e.message : String(e))
      return
    }

    mkdir(dirname(filePath), { recursive: true })
      .then(() => writeFile(filePath, yamlText, "utf8"))
      .then(() => {
        if (!mountedRef.current) return
        onSaved()
      })
      .catch((e) => {
        if (!mountedRef.current) return
        setSaveError(e instanceof Error ? e.message : String(e))
      })
  }, [filePath, onSaved, kind])

  const validateContent = useCallback(
    (content: string): string | null => {
      try {
        if (kind === "folder") {
          lang.parseFolder(content)
        } else {
          lang.parseRequest(basename(filePath, ".yml"), content)
        }
        return null
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const prefix =
          kind === "folder" ? "Invalid folder YAML" : "Invalid request YAML"
        return `${prefix}: ${message}`
      }
    },
    [filePath, kind],
  )

  const handleContentChange = useCallback(() => {
    const editor = editorRef.current
    if (editor) setDraftContent(editor.plainText)
  }, [])

  const extraHighlights = useCallback(
    (value: string) => {
      const editor = editorRef.current
      if (!editor || !activeEnv) return []
      return getEnvVarHighlights(
        value,
        activeEnv,
        editor.envResolvedStyleId,
        editor.envMissingStyleId,
      )
    },
    [activeEnv],
  )

  const validationNotice = useMemo(() => {
    if (!validationError) return null
    const prefix =
      kind === "folder" ? "Invalid folder YAML" : "Invalid request YAML"
    return {
      title: prefix,
      detail: validationError.replace(
        new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `),
        "",
      ),
    }
  }, [validationError, kind])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!visible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name === "escape") {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          handleClose()
        } else if (ctx.event.name === "s" && ctx.event.ctrl) {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          handleSave()
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [visible, handleSave, handleClose, keymap])

  useEffect(() => {
    if (visible && content !== null && editorRef.current) {
      editorRef.current.focus()
    }
  }, [visible, content])

  const syncFoldSigns = useCallback(
    (hoveredFoldLine?: number) => {
      const ed = editorRef.current
      const ln = lineNumberRef.current
      if (!ed || !ln) return
      syncCodeEditorGutter(ln, ed, hoveredFoldLine, theme.primary)
    },
    [theme.primary],
  )

  const handleFoldsChange = useCallback(() => {
    hoveredFoldLineRef.current = null
    syncFoldSigns()
  }, [syncFoldSigns])

  const updateFoldHover = useCallback(
    (event: { x: number; y: number }) => {
      const editor = editorRef.current
      const lineNumbers = lineNumberRef.current
      const displayLine =
        editor && lineNumbers && event.x === lineNumbers.x
          ? editor.lineInfo.lineSources[event.y - editor.y + editor.scrollY]
          : undefined
      const hoveredFoldLine =
        displayLine !== undefined && editor?.getFoldSigns().has(displayLine)
          ? displayLine
          : null
      if (hoveredFoldLine === hoveredFoldLineRef.current) return
      hoveredFoldLineRef.current = hoveredFoldLine
      syncFoldSigns(hoveredFoldLine ?? undefined)
    },
    [syncFoldSigns],
  )

  if (!visible) return null

  return (
    <Overlay visible={visible} width={90} padding={1} gap={1} overflow="hidden">
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          flexShrink: 0,
          paddingX: 4,
        }}
      >
        <text fg={theme.text}>
          {kind === "folder"
            ? `${requestName}/folder.yml`
            : `${requestName}.yml`}
        </text>
        <EscapeClose onClose={handleClose} />
      </box>
      {readError ? (
        <box
          style={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <text fg={theme.error}>Error: {readError}</text>
        </box>
      ) : content !== null ? (
        <box
          height={20}
          style={{
            paddingLeft: 4,
            paddingRight: 4,
            flexDirection: "column",
            gap: 1,
          }}
        >
          <line-number
            ref={lineNumberRef}
            minWidth={4}
            paddingRight={1}
            fg={theme.textMuted}
            bg={theme.backgroundPanel}
            lineSigns={RESERVED_FOLD_SIGN}
            onMouseMove={updateFoldHover}
            onMouseOut={() => {
              if (hoveredFoldLineRef.current === null) return
              hoveredFoldLineRef.current = null
              syncFoldSigns()
            }}
            onMouseDown={(event) => {
              const editor = editorRef.current
              if (event.button !== MouseButton.LEFT || !editor) return
              if (event.x >= editor.x) return
              const displayLine =
                editor.lineInfo.lineSources[event.y - editor.y + editor.scrollY]
              if (
                displayLine === undefined ||
                !editor.getFoldSigns().has(displayLine)
              )
                return
              editor.toggleFold(displayLine)
              event.preventDefault()
              event.stopPropagation()
            }}
            style={{ flexGrow: 1, minHeight: 0 }}
            width="100%"
          >
            <code-editor
              ref={(editor) => {
                editorRef.current = editor
                setEditorInstance(editor)
              }}
              filetype="yaml"
              theme={theme}
              initialValue={content}
              extraHighlights={activeEnv ? extraHighlights : undefined}
              validateContent={validateContent}
              onValidationChange={setValidationError}
              onContentChange={handleContentChange}
              onFoldsChange={handleFoldsChange}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
            />
          </line-number>
          <CodeEditorCompletion
            editor={editorInstance}
            env={activeEnv}
            isEditing
            value={draftContent ?? content ?? ""}
          />
          {validationNotice && (
            <ValidationNotice
              title={validationNotice.title}
              detail={validationNotice.detail}
            />
          )}
        </box>
      ) : (
        <text fg={theme.textMuted}>Loading...</text>
      )}
      {saveError && <text fg={theme.error}>Save error: {saveError}</text>}
      <box
        style={{
          flexDirection: "row",
          flexShrink: 0,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingX: 2,
            flexGrow: 1,
            gap: 1,
          }}
        >
          <box
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              handleSave()
              event.preventDefault()
              event.stopPropagation()
            }}
            onMouseOver={() => setHoveredAction("save")}
            onMouseOut={() => setHoveredAction(null)}
            style={{
              flexDirection: "row",
              paddingX: 1,
              backgroundColor:
                hoveredAction === "save" ? theme.backgroundElement : undefined,
            }}
          >
            <text fg={theme.text}>^S</text>
            <text fg={theme.textMuted}> save</text>
          </box>
          <box
            onMouseDown={(event) => {
              if (event.button !== MouseButton.LEFT) return
              handleClose()
              event.preventDefault()
              event.stopPropagation()
            }}
            onMouseOver={() => setHoveredAction("close")}
            onMouseOut={() => setHoveredAction(null)}
            style={{
              flexDirection: "row",
              paddingX: 1,
              backgroundColor:
                hoveredAction === "close" ? theme.backgroundElement : undefined,
            }}
          >
            <text fg={theme.text}>esc</text>
            <text fg={theme.textMuted}> close</text>
          </box>
        </box>
      </box>
    </Overlay>
  )
}
