import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  MouseButton,
  type Highlight,
  type LineNumberRenderable,
} from "@opentui/core"
import type { Request, Environment } from "../../schema"
import { formatBody } from "../formatRequest"
import type { EditState } from "../editMode"
import type { BodyType } from "../../schema"
import type { CodeEditorRenderable } from "../editor/CodeEditor"
import { CodeEditorCompletion } from "../editor/CodeEditorCompletion"
import type { Theme } from "../theme"
import { VarInput } from "../VarInput"
import { FormEditor } from "../FormEditor"
import { ValidationNotice } from "../editor/ValidationNotice"
import { validateJsonContent } from "../editor/jsonValidation"
import { getEnvVarHighlights } from "../variable-completion/variableCompletion"
import { Select, type SelectItem } from "../Select"
import {
  RESERVED_FOLD_SIGN,
  syncCodeEditorGutter,
} from "../editor/codeEditorGutter"

const FILE_PATH_COMPLETION = { kind: "file" as const }

export function BodyTypeSelector({
  request,
  editState,
  browseActive,
  onBodyTypeChange,
  onSelectOpenChange,
  onActivate,
  interactive = true,
}: {
  request: Request
  editState: EditState
  browseActive: boolean
  onBodyTypeChange: (t: BodyType) => void
  onSelectOpenChange?: (open: boolean) => void
  onActivate?: () => void
  interactive?: boolean
}) {
  const bodyType = request.bodyType ?? "json"

  const bodyTypeItems: SelectItem[] = [
    { id: "none", label: "None" },
    { id: "json", label: "JSON" },
    { id: "xml", label: "XML" },
    { id: "multipart", label: "Multipart Form" },
    { id: "urlencoded", label: "Form URL-Encoded" },
    { id: "binary", label: "Binary" },
  ]

  const [typeSelectOpen, setTypeSelectOpen] = useState(false)

  const handleBodyTypeSelectOpen = useCallback(
    (open: boolean) => {
      setTypeSelectOpen(open)
      onSelectOpenChange?.(open)
    },
    [onSelectOpenChange],
  )

  return (
    <box
      id="body-type"
      style={{
        zIndex: typeSelectOpen ? 1 : undefined,
      }}
    >
      <Select
        items={bodyTypeItems}
        value={bodyType}
        onChange={(v) => {
          if (v === bodyType) return
          onBodyTypeChange(v as BodyType)
        }}
        focused={
          browseActive &&
          editState.cursor.field === "body" &&
          editState.cursor.row === 0
        }
        badge={false}
        onOpenChange={handleBodyTypeSelectOpen}
        onActivate={onActivate}
        interactive={interactive}
      />
    </box>
  )
}

export function BodySection({
  request,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  inEdit,
  browseActive,
  theme,
  activeEnv,
  onBodyChange,
  onEditorActivate,
  onEditorRef,
  onFormRowActivate,
  onFormSubfieldFocus,
  onFormRowToggle,
}: {
  request: Request
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
  onBodyChange: (body: string) => void
  onEditorActivate?: () => void
  onEditorRef?: (editor: CodeEditorRenderable | null) => void
  onFormRowActivate?: (
    row: number,
    addingRow: boolean,
    subfield?: "key" | "value",
  ) => void
  onFormSubfieldFocus?: (subfield: "key" | "value") => void
  onFormRowToggle?: (row: number) => void
}) {
  const bodyType = request.bodyType ?? "json"

  const isFormMode = bodyType === "multipart" || bodyType === "urlencoded"
  const isBinaryMode = bodyType === "binary"

  const formattedBody = useMemo(
    () => formatBody(request.body, bodyType),
    [bodyType, request.body],
  )
  const editorRef = useRef<CodeEditorRenderable | null>(null)
  const [editorInstance, setEditorInstance] =
    useState<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const hoveredFoldLineRef = useRef<number | null>(null)

  const extraHighlights = useCallback(
    (content: string): Highlight[] => {
      const ed = editorRef.current
      if (!activeEnv?.vars || !ed) return []
      return getEnvVarHighlights(
        content,
        activeEnv,
        ed.envResolvedStyleId,
        ed.envMissingStyleId,
      )
    },
    [activeEnv],
  )

  const validateContent = useCallback(
    (content: string): string | null =>
      bodyType === "json"
        ? validateJsonContent(content, activeEnv ?? null)
        : null,
    [activeEnv, bodyType],
  )

  const editingBody = inEdit && editState.cursor.field === "body"

  const handleContentChange = useCallback(() => {
    if (!editingBody) return
    const ed = editorRef.current
    if (!ed) return
    setEditValue(ed.plainText)
    onBodyChange(ed.plainText)
  }, [editingBody, onBodyChange, setEditValue])

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

  useEffect(() => {
    if (!editingBody) setValidationError(null)
  }, [editingBody])

  const validationDetail = useMemo(() => {
    if (!editingBody || isFormMode || isBinaryMode) return null
    if (!validationError) return null
    return validationError.replace(/^Invalid JSON:\s*/, "")
  }, [editingBody, isBinaryMode, isFormMode, validationError])

  useEffect(() => {
    if (editingBody && editorRef.current) {
      editorRef.current.focus()
    } else {
      editorRef.current?.blur()
    }
  }, [editingBody])

  useEffect(() => {
    if (!editingBody && editorRef.current) {
      editorRef.current.value = formattedBody
    }
  }, [editingBody, formattedBody])

  return (
    <box
      style={{
        flexDirection: "column",
        gap: 1,
        flexGrow: isFormMode ? undefined : 1,
        flexShrink: isFormMode ? 0 : 1,
        flexBasis: isFormMode ? undefined : 0,
        minHeight: 0,
        overflow: isFormMode ? undefined : "hidden",
      }}
    >
      {bodyType === "none" ? null : isFormMode ? (
        <FormEditor
          request={{
            formData: request.formData,
            bodyType: request.bodyType,
          }}
          editState={editState}
          editKey={editKey}
          editValue={editValue}
          setEditKey={setEditKey}
          setEditValue={setEditValue}
          browseActive={browseActive}
          theme={theme}
          activeEnv={activeEnv}
          onActivateRow={onFormRowActivate}
          onFocusSubfield={onFormSubfieldFocus}
          onToggleRow={onFormRowToggle}
        />
      ) : isBinaryMode ? (
        editingBody ? (
          <VarInput
            value={editValue}
            env={activeEnv ?? null}
            isEditing
            onChange={setEditValue}
            isFocused
            placeholder="File path..."
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
            pathCompletion={FILE_PATH_COMPLETION}
          />
        ) : (
          <box
            onMouseDown={
              onEditorActivate
                ? (event) => {
                    if (event.button !== MouseButton.LEFT) return
                    onEditorActivate()
                    event.stopPropagation()
                  }
                : undefined
            }
          >
            <VarInput
              value={request.filePath || "(no file selected)"}
              env={activeEnv ?? null}
              isEditing={false}
            />
          </box>
        )
      ) : (
        <box
          id="body-field"
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            onEditorActivate?.()
            event.stopPropagation()
          }}
          style={{
            flexDirection: "column",
            gap: 1,
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <box
            style={{
              flexDirection: "row",
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
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
              onMouseScroll={(event) => {
                const editor = editorRef.current
                if (!editor || !event.scroll) return
                if (event.scroll.direction === "up") {
                  editor.scrollBy(-event.scroll.delta)
                } else if (event.scroll.direction === "down") {
                  editor.scrollBy(event.scroll.delta)
                } else {
                  return
                }
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseDown={(event) => {
                const editor = editorRef.current
                if (event.button !== MouseButton.LEFT || !editor) return
                if (event.x >= editor.x) return
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
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <code-editor
                id="request-body-editor"
                ref={(editor) => {
                  editorRef.current = editor
                  setEditorInstance(editor)
                  onEditorRef?.(editor)
                }}
                filetype={bodyType}
                theme={theme}
                initialValue={editingBody ? editValue : formattedBody}
                extraHighlights={activeEnv ? extraHighlights : undefined}
                validateContent={validateContent}
                onValidationChange={setValidationError}
                onSourceChange={handleContentChange}
                onFoldsChange={handleFoldsChange}
                backgroundColor={theme.backgroundPanel}
                focusedBackgroundColor={theme.backgroundPanel}
                textColor={theme.text}
                cursorColor={theme.primary}
                scrollMargin={0}
                style={{ flexGrow: 1 }}
              />
            </line-number>
            <code-editor-scrollbar
              id="request-body-scrollbar"
              target={editorInstance}
              trackOptions={{
                backgroundColor: theme.background,
                foregroundColor: theme.borderActive,
              }}
              style={{ width: 1, flexShrink: 0, zIndex: 1 }}
            />
          </box>
          <CodeEditorCompletion
            editor={editorInstance}
            env={activeEnv ?? null}
            isEditing={editingBody}
            value={editingBody ? editValue : formattedBody}
          />
          {validationDetail && <ValidationNotice detail={validationDetail} />}
        </box>
      )}
    </box>
  )
}
