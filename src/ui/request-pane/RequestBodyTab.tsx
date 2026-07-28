import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LineNumberRenderable, LineSign } from "@opentui/core"
import type { Highlight } from "@opentui/core"
import type { Request, Environment } from "../../schema"
import { formatBody } from "../formatRequest"
import type { EditState } from "../editMode"
import type { BodyType } from "../../schema"
import type { CodeEditorRenderable } from "../editor/CodeEditor"
import { CodeEditorCompletion } from "../editor/CodeEditorCompletion"
import type { Theme } from "../theme"
import { JsonBodyViewer } from "../editor/JsonBodyViewer"
import { VarInput } from "../VarInput"
import { FormEditor } from "../FormEditor"
import { ValidationNotice } from "../editor/ValidationNotice"
import { validateJsonContent } from "../editor/jsonValidation"
import { getEnvVarHighlights } from "../variable-completion/variableCompletion"
import { Select, type SelectItem } from "../Select"

const RESERVED_FOLD_SIGN = new Map<number, LineSign>([[-1, { before: " " }]])

function reserveFoldSigns(signs: Map<number, LineSign>): Map<number, LineSign> {
  return new Map([...RESERVED_FOLD_SIGN, ...signs])
}

export function BodyTypeSelector({
  request,
  editState,
  browseActive,
  onBodyTypeChange,
  onSelectOpenChange,
}: {
  request: Request
  editState: EditState
  browseActive: boolean
  onBodyTypeChange: (t: BodyType) => void
  onSelectOpenChange?: (open: boolean) => void
}) {
  const bodyType = request.bodyType ?? "json"

  const bodyTypeItems: SelectItem[] = [
    { id: "none", label: "None" },
    { id: "json", label: "JSON" },
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
}) {
  const bodyType = request.bodyType ?? "json"

  const isFormMode = bodyType === "multipart" || bodyType === "urlencoded"
  const isBinaryMode = bodyType === "binary"

  const body = useMemo(() => formatBody(request.body), [request.body])
  const editorRef = useRef<CodeEditorRenderable | null>(null)
  const [editorInstance, setEditorInstance] =
    useState<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

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
      validateJsonContent(content, activeEnv ?? null),
    [activeEnv],
  )

  const handleContentChange = useCallback(() => {
    const ed = editorRef.current
    if (ed) setEditValue(ed.plainText)
  }, [setEditValue])

  const handleFoldsChange = useCallback(() => {
    const ed = editorRef.current
    const ln = lineNumberRef.current
    if (ed && ln) {
      ln.setLineSigns(reserveFoldSigns(ed.getFoldSigns()))
      ln.setHideLineNumbers(ed.getHiddenLineNumbers())
    }
  }, [])

  const editingBody = inEdit && editState.cursor.field === "body"

  useEffect(() => {
    if (!editingBody) setValidationError(null)
  }, [editingBody])

  const validationNotice = useMemo(() => {
    if (!editingBody || isFormMode || isBinaryMode) return null
    if (!validationError) return null
    return {
      title: "Invalid JSON",
      detail: validationError.replace(/^Invalid JSON:\s*/, ""),
    }
  }, [editingBody, isBinaryMode, isFormMode, validationError])

  useEffect(() => {
    if (editingBody && editorRef.current) {
      editorRef.current.focus()
    }
  }, [editingBody])

  const contentBg =
    browseActive &&
    editState.cursor.field === "body" &&
    editState.cursor.row >= 1
      ? theme.backgroundElement
      : undefined

  return (
    <box style={{ flexDirection: "column", gap: 1, flexGrow: 1, minHeight: 0 }}>
      {bodyType === "none" ? null : editingBody ? (
        isFormMode ? (
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
          />
        ) : isBinaryMode ? (
          <VarInput
            value={editValue}
            env={activeEnv ?? null}
            isEditing
            onChange={setEditValue}
            isFocused
            placeholder="File path..."
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
          />
        ) : (
          <box
            style={{
              flexDirection: "column",
              gap: 1,
              flexGrow: 1,
              minHeight: 0,
            }}
          >
            <line-number
              ref={lineNumberRef}
              minWidth={3}
              paddingRight={1}
              fg={theme.textMuted}
              bg={theme.backgroundPanel}
              lineSigns={RESERVED_FOLD_SIGN}
              style={{ flexGrow: 1 }}
              width="100%"
            >
              <code-editor
                ref={(editor) => {
                  editorRef.current = editor
                  setEditorInstance(editor)
                }}
                filetype="json"
                theme={theme}
                initialValue={formatBody(editValue)}
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
              env={activeEnv ?? null}
              isEditing={editingBody}
              value={editValue}
            />
            {validationNotice && (
              <ValidationNotice
                title={validationNotice.title}
                detail={validationNotice.detail}
              />
            )}
          </box>
        )
      ) : isFormMode ? (
        <FormEditor
          request={{ formData: request.formData, bodyType: request.bodyType }}
          editState={editState}
          editKey={editKey}
          editValue={editValue}
          setEditKey={setEditKey}
          setEditValue={setEditValue}
          browseActive={browseActive}
          theme={theme}
          activeEnv={activeEnv}
        />
      ) : isBinaryMode ? (
        <box style={{ backgroundColor: contentBg }}>
          <VarInput
            value={request.filePath || "(no file selected)"}
            env={activeEnv ?? null}
            isEditing={false}
          />
        </box>
      ) : body === "" ? (
        <box style={{ backgroundColor: contentBg }}>
          <text id="body-field" fg={theme.textMuted}>
            (none)
          </text>
        </box>
      ) : (
        <box style={{ backgroundColor: contentBg }}>
          <JsonBodyViewer
            body={body}
            theme={theme}
            activeEnv={activeEnv ?? null}
            backgroundColor={contentBg}
          />
        </box>
      )}
    </box>
  )
}
