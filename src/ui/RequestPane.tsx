import type {
  ScrollBoxRenderable,
  LineNumberRenderable,
  LineSign,
} from "@opentui/core"
import type { Highlight } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Auth, Request, Environment } from "../schema"
import { formatBody } from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"
import type { CodeEditorRenderable } from "./editor/CodeEditor"
import { CodeEditorCompletion } from "./editor/CodeEditorCompletion"

import { CenterText } from "./CenterText"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import type { Theme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { JsonBodyViewer } from "./editor/JsonBodyViewer"
import { VarInput } from "./VarInput"
import { KeyValueSection } from "./KeyValueSection"
import { Checkbox } from "./Checkbox"
import { AuthEditor } from "./AuthEditor"
import { Select, type SelectItem } from "./Select"
import { FormEditor } from "./FormEditor"
import { ValidationNotice } from "./editor/ValidationNotice"
import type { BodyType } from "../schema"
import { validateJsonContent } from "./editor/jsonValidation"
import { getEnvVarHighlights } from "./variable-completion/variableCompletion"

interface Props {
  request: Request | null
  error?: Error | null
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  focused?: boolean
  activeTab: FieldKind
  activeEnv?: Environment | null
  onAuthTypeChange?: (t: Auth["type"]) => void
  onApiKeyPlacementChange?: (placement: "header" | "query") => void
  onBodyTypeChange?: (t: BodyType) => void
  onSelectOpenChange?: (open: boolean) => void
  expandHint?: string
}

const BASE_TAB_DEFS: TabDef[] = [
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
  { id: "settings", label: "Settings" },
]

const RESERVED_FOLD_SIGN = new Map<number, LineSign>([[-1, { before: " " }]])

function reserveFoldSigns(signs: Map<number, LineSign>): Map<number, LineSign> {
  return new Map([...RESERVED_FOLD_SIGN, ...signs])
}

export function RequestPane({
  request,
  error,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  focused = false,
  activeTab,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onBodyTypeChange,
  onSelectOpenChange,
  expandHint,
}: Props) {
  const theme = useTheme()
  const title = "Request"
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const keymap = useKeymap()

  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (keymap.getData("app.overlay") !== "none") return
    if (editState.mode !== "browsing") return
    if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
  })

  useEffect(() => {
    if (editState.mode === "inactive") return
    const { field, row, addingRow } = editState.cursor
    if (field === "headers" || field === "params") {
      const prefix = field === "headers" ? "hdr" : "prm"
      scrollRef.current?.scrollChildIntoView(
        addingRow ? `${prefix}-add` : `${prefix}-${row}`,
      )
    } else if (field === "body" && addingRow) {
      scrollRef.current?.scrollChildIntoView("body-add")
    } else {
      scrollRef.current?.scrollChildIntoView(`${field}-field`)
    }
  }, [editState.cursor, editState.mode])

  const handleSelectOpenChange = useCallback(
    (open: boolean) => {
      onSelectOpenChange?.(open)
      if (open) {
        scrollRef.current?.scrollChildIntoView("auth-field")
      }
    },
    [onSelectOpenChange],
  )

  const tabs = useMemo(() => {
    if (!request) return BASE_TAB_DEFS
    const headerActive = Object.values(request.headers).some((e) => e.enabled)
    const paramActive = request.params.some((e) => e.enabled)
    const hasBody =
      (request.body !== undefined && request.body !== "") ||
      (request.formData !== undefined && request.formData.length > 0) ||
      (request.filePath !== undefined && request.filePath !== "")
    const hasAuth =
      request.auth?.type !== undefined && request.auth.type !== "none"
    const hasTimeout = request.timeout > 0
    return BASE_TAB_DEFS.map((tab) => {
      if (tab.id === "headers") {
        return {
          ...tab,
          label: headerActive ? "Headers \u2022" : "Headers",
        }
      }
      if (tab.id === "params") {
        return {
          ...tab,
          label: paramActive ? "Params \u2022" : "Params",
        }
      }
      if (tab.id === "body") {
        return { ...tab, label: hasBody ? "Body \u2022" : "Body" }
      }
      if (tab.id === "auth") {
        return { ...tab, label: hasAuth ? "Auth \u2022" : "Auth" }
      }
      if (tab.id === "settings") {
        return { ...tab, label: hasTimeout ? "Settings \u2022" : "Settings" }
      }
      return tab
    })
  }, [request])

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        flexBasis: 0,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title={title}
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
      bottomTitle={focused ? expandHint : undefined}
      bottomTitleAlignment="left"
    >
      {request ? (
        <>
          <Tabs tabs={tabs} activeId={activeTab}>
            <box
              style={{
                flexDirection: "column",
                flexGrow: 1,
                minHeight: 0,
                gap: 1,
              }}
            >
              {activeTab === "body" && (
                <BodyTypeSelector
                  request={request}
                  editState={editState}
                  browseActive={browseActive}
                  onBodyTypeChange={onBodyTypeChange ?? (() => {})}
                  onSelectOpenChange={onSelectOpenChange}
                />
              )}
              <scrollbox
                ref={scrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
              >
                {activeTab === "body" && (
                  <BodySection
                    request={request}
                    editState={editState}
                    editKey={editKey}
                    editValue={editValue}
                    setEditKey={setEditKey}
                    setEditValue={setEditValue}
                    inEdit={inEdit}
                    browseActive={browseActive}
                    theme={theme}
                    activeEnv={activeEnv}
                  />
                )}
                {activeTab === "headers" && (
                  <KeyValueSection
                    kind="headers"
                    entries={Object.entries(request?.headers ?? {}).map(
                      ([key, value]) => ({ key, value }),
                    )}
                    editState={editState}
                    editKey={editKey}
                    editValue={editValue}
                    setEditKey={setEditKey}
                    setEditValue={setEditValue}
                    theme={theme}
                    activeEnv={activeEnv}
                  />
                )}
                {activeTab === "params" && (
                  <KeyValueSection
                    kind="params"
                    entries={(request?.params ?? []).map((p) => ({
                      key: p.name,
                      value: { value: p.value, enabled: p.enabled },
                    }))}
                    editState={editState}
                    editKey={editKey}
                    editValue={editValue}
                    setEditKey={setEditKey}
                    setEditValue={setEditValue}
                    theme={theme}
                    activeEnv={activeEnv}
                  />
                )}
                {activeTab === "auth" && (
                  <AuthEditor
                    auth={request?.auth ?? { type: "none" }}
                    editState={editState}
                    inEdit={inEdit}
                    browseActive={browseActive}
                    setEditValue={setEditValue}
                    theme={theme}
                    activeEnv={activeEnv}
                    onAuthTypeChange={onAuthTypeChange ?? (() => {})}
                    onApiKeyPlacementChange={
                      onApiKeyPlacementChange ?? (() => {})
                    }
                    onSelectOpenChange={handleSelectOpenChange}
                    showInherit={true}
                  />
                )}
                {activeTab === "settings" && (
                  <SettingsSection
                    request={request}
                    editState={editState}
                    setEditValue={setEditValue}
                    inEdit={inEdit}
                    browseActive={browseActive}
                    theme={theme}
                    activeEnv={activeEnv}
                  />
                )}
              </scrollbox>
            </box>
          </Tabs>
        </>
      ) : error ? (
        <box
          style={{
            flexGrow: 1,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <CenterText
            segments={[
              { text: "No collection found", color: theme.text },
              { text: " ", color: theme.textMuted },
              {
                text: "use --collection <dir> or create the default directory",
                color: theme.textMuted,
              },
            ]}
          />
        </box>
      ) : (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text fg={theme.textMuted}>empty</text>
        </box>
      )}
    </box>
  )
}

function BodyTypeSelector({
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

function BodySection({
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

  const validationNotice = useMemo(() => {
    if (!editingBody || isFormMode || isBinaryMode) return null
    const error = validateJsonContent(editValue, activeEnv ?? null)
    if (!error) return null
    return {
      title: "Invalid JSON",
      detail: error.replace(/^Invalid JSON:\s*/, ""),
    }
  }, [activeEnv, editingBody, editValue, isBinaryMode, isFormMode])

  useEffect(() => {
    if (editingBody && editorRef.current) {
      editorRef.current.focus()
    }
  }, [editingBody])

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
        <box
          style={{
            backgroundColor:
              browseActive &&
              editState.cursor.field === "body" &&
              editState.cursor.row >= 1
                ? theme.backgroundElement
                : undefined,
          }}
        >
          <VarInput
            value={request.filePath || "(no file selected)"}
            env={activeEnv ?? null}
            isEditing={false}
          />
        </box>
      ) : body === "" ? (
        <box
          style={{
            backgroundColor:
              browseActive &&
              editState.cursor.field === "body" &&
              editState.cursor.row >= 1
                ? theme.backgroundElement
                : undefined,
          }}
        >
          <text id="body-field" fg={theme.textMuted}>
            (none)
          </text>
        </box>
      ) : (
        <box
          style={{
            backgroundColor:
              browseActive &&
              editState.cursor.field === "body" &&
              editState.cursor.row >= 1
                ? theme.backgroundElement
                : undefined,
          }}
        >
          <JsonBodyViewer
            body={body}
            theme={theme}
            activeEnv={activeEnv ?? null}
            backgroundColor={
              browseActive &&
              editState.cursor.field === "body" &&
              editState.cursor.row >= 1
                ? theme.backgroundElement
                : undefined
            }
          />
        </box>
      )}
    </box>
  )
}

function SettingsSection({
  request,
  editState,
  setEditValue,
  inEdit,
  browseActive,
  theme,
  activeEnv,
}: {
  request: Request
  editState: EditState
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
}) {
  const rows = [
    {
      label: "Timeout (ms)",
      value: request.timeout,
      display: `${request.timeout}ms`,
      desc: "Set maximum time to wait before aborting the request",
    },
    {
      label: "Follow Redirects",
      value: request.followRedirects ?? true,
      display: String(request.followRedirects ?? true),
      desc: "Automatically follow HTTP redirects",
    },
    {
      label: "Max Redirects",
      value: request.maxRedirects ?? 5,
      display: String(request.maxRedirects ?? 5),
      desc: "Maximum number of redirects to follow",
    },
  ]

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {rows.map((row, idx) => {
        const editingRow =
          inEdit &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx
        const isActive =
          browseActive &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx

        return (
          <box key={row.label} style={{ flexDirection: "column" }}>
            <box
              id={idx === 0 ? "settings-field" : `settings-${idx}`}
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={
                isActive || editingRow ? theme.primary : theme.borderSubtle
              }
              style={{
                flexDirection: editingRow ? "row" : undefined,
                gap: editingRow ? 1 : undefined,
                backgroundColor: isActive ? theme.backgroundElement : undefined,
              }}
            >
              {editingRow ? (
                <>
                  <text fg={theme.textMuted}>{row.label}: </text>
                  <VarInput
                    value={String(row.value)}
                    env={activeEnv ?? null}
                    isEditing
                    useTextarea
                    onChange={setEditValue}
                  />
                </>
              ) : idx === 1 ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{row.label}: </text>
                  <Checkbox
                    checked={request.followRedirects ?? true}
                    theme={theme}
                  />
                </box>
              ) : (
                <VarInput
                  value={`${row.label}: ${row.display}`}
                  env={activeEnv ?? null}
                  isEditing={false}
                  baseColor={theme.text}
                />
              )}
            </box>
            <text fg={theme.textMuted}>{row.desc}</text>
          </box>
        )
      })}
    </box>
  )
}
