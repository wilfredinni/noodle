import { MouseButton, type LineNumberRenderable } from "@opentui/core"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { basename, dirname } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import type { Environment } from "../../schema"
import { lang } from "../../lang"
import { useTheme } from "../theme"
import { CodeEditorCompletion } from "./CodeEditorCompletion"
import type { CodeEditorRenderable } from "./CodeEditor"
import { ValidationNotice } from "./ValidationNotice"
import {
  formatYamlValidationNotice,
  type YamlValidationNotice,
} from "./yamlValidation"
import { getEnvVarHighlights } from "../variable-completion/variableCompletion"
import { RESERVED_FOLD_SIGN, syncCodeEditorGutter } from "./codeEditorGutter"

export interface YamlFileEditorHandle {
  save: () => void
}

export interface YamlFileEditorProps {
  filePath: string
  displayName?: string
  onSaved: () => void
  onDirtyChange?: (dirty: boolean) => void
  activeEnv?: Environment | null
  kind?: "request" | "folder"
  active?: boolean
  height?: number
  initialDraft?: string
  onDraftChange?: (content: string) => void
  editorId?: string
}

export const YamlFileEditor = forwardRef<
  YamlFileEditorHandle,
  YamlFileEditorProps
>(function YamlFileEditor(
  {
    filePath,
    displayName,
    onSaved,
    onDirtyChange,
    activeEnv = null,
    kind = "request",
    active = true,
    height,
    initialDraft,
    onDraftChange,
    editorId,
  },
  ref,
) {
  const theme = useTheme()
  const editorRef = useRef<CodeEditorRenderable | null>(null)
  const [editorInstance, setEditorInstance] =
    useState<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const hoveredFoldLineRef = useRef<number | null>(null)
  const initialDraftRef = useRef(initialDraft)
  const [content, setContent] = useState<string | null>(null)
  const [originalContent, setOriginalContent] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveValidationNotice, setSaveValidationNotice] =
    useState<YamlValidationNotice | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setContent(null)
    setOriginalContent(null)
    setDraftContent(null)
    setValidationError(null)
    setSaveValidationNotice(null)
    setReadError(null)
    setSaveError(null)

    readFile(filePath, "utf8")
      .then((value) => {
        if (!mountedRef.current) return
        const next = initialDraftRef.current ?? value
        setOriginalContent(value)
        setContent(next)
        setDraftContent(next)
        onDirtyChange?.(next !== value)
      })
      .catch((error) => {
        if (!mountedRef.current) return
        if (
          kind === "folder" &&
          (error as { code?: string }).code === "ENOENT"
        ) {
          const next = initialDraftRef.current ?? ""
          setOriginalContent("")
          setContent(next)
          setDraftContent(next)
          onDirtyChange?.(next !== "")
        } else {
          setReadError(error instanceof Error ? error.message : String(error))
        }
      })
  }, [filePath, kind, onDirtyChange])

  const validateContent = useCallback(
    (value: string): string | null => {
      try {
        if (kind === "folder") lang.parseFolder(value)
        else lang.parseRequest(basename(filePath, ".yml"), value)
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    [filePath, kind],
  )

  const handleSave = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    setSaveError(null)
    setSaveValidationNotice(null)
    const yamlText = editor.plainText

    try {
      if (kind === "folder") lang.parseFolder(yamlText)
      else lang.parseRequest(basename(filePath, ".yml"), yamlText)
    } catch (error) {
      if (!mountedRef.current) return
      setSaveValidationNotice(
        formatYamlValidationNotice({
          kind,
          fileName: displayName ?? basename(filePath),
          source: yamlText,
          error,
        }),
      )
      return
    }

    mkdir(dirname(filePath), { recursive: true })
      .then(() => writeFile(filePath, yamlText, "utf8"))
      .then(() => {
        if (!mountedRef.current) return
        setOriginalContent(yamlText)
        setContent(yamlText)
        setDraftContent(yamlText)
        onDraftChange?.(yamlText)
        onDirtyChange?.(false)
        onSaved()
      })
      .catch((error) => {
        if (!mountedRef.current) return
        setSaveError(error instanceof Error ? error.message : String(error))
      })
  }, [displayName, filePath, kind, onDirtyChange, onDraftChange, onSaved])

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave])

  useEffect(() => {
    if (active && content !== null) editorRef.current?.focus()
  }, [active, content])

  const handleContentChange = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const next = editor.plainText
    setDraftContent(next)
    setSaveValidationNotice(null)
    onDraftChange?.(next)
    onDirtyChange?.(originalContent !== null && next !== originalContent)
  }, [onDraftChange, onDirtyChange, originalContent])

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
    return formatYamlValidationNotice({
      kind,
      fileName: displayName ?? basename(filePath),
      source: draftContent ?? content ?? "",
      error: validationError,
    })
  }, [content, displayName, draftContent, filePath, kind, validationError])

  const activeValidationNotice = saveValidationNotice ?? validationNotice

  const syncFoldSigns = useCallback(
    (hoveredFoldLine?: number) => {
      const editor = editorRef.current
      const lineNumbers = lineNumberRef.current
      if (!editor || !lineNumbers) return
      syncCodeEditorGutter(lineNumbers, editor, hoveredFoldLine, theme.primary)
    },
    [theme.primary],
  )

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

  return (
    <box
      style={{
        flexDirection: "column",
        gap: 1,
        minHeight: 0,
        paddingLeft: 1,
        paddingRight: 1,
        ...(height === undefined ? { flexGrow: 1 } : { height }),
      }}
    >
      {readError ? (
        <box
          style={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <text fg={theme.error}>{readError}</text>
        </box>
      ) : content !== null ? (
        <>
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
              id={editorId}
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
              onSourceChange={handleContentChange}
              onFoldsChange={() => {
                hoveredFoldLineRef.current = null
                syncFoldSigns()
              }}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
            />
          </line-number>
          <CodeEditorCompletion
            editor={editorInstance}
            env={activeEnv}
            isEditing={active}
            value={draftContent ?? content}
          />
          {activeValidationNotice && (
            <ValidationNotice notice={activeValidationNotice} />
          )}
        </>
      ) : (
        <text fg={theme.textMuted}>Loading...</text>
      )}
      {saveError && <text fg={theme.error}>Save error: {saveError}</text>}
    </box>
  )
})
