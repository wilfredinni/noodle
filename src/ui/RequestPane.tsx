import type {
  ScrollBoxRenderable,
  TextareaRenderable,
  LineNumberRenderable,
} from "@opentui/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Auth, Request, Environment } from "../schema"
import { formatBody } from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"

import { CenterText } from "./CenterText"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import type { Theme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { useJsonHighlight } from "../hooks/useJsonHighlight"
import { JsonBodyViewer } from "./JsonBodyViewer"
import { VarText } from "./VarText"
import { KeyValueSection } from "./KeyValueSection"
import { Checkbox } from "./Checkbox"
import { AuthEditor } from "./AuthEditor"
import { Select, type SelectItem } from "./Select"
import { FormEditor } from "./FormEditor"
import type { BodyType } from "../schema"

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

  useEffect(() => {
    if (editState.mode !== "browsing") return
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
  }, [editState.cursor])

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
    const paramActive = Object.values(request.params).some((e) => e.enabled)
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
        flexGrow: 1,
        flexDirection: "column",
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
            <scrollbox
              ref={scrollRef}
              scrollY
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
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
                  entries={Object.entries(request?.params ?? {}).map(
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
                  onBodyTypeChange={onBodyTypeChange ?? (() => {})}
                  onSelectOpenChange={onSelectOpenChange}
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
  onBodyTypeChange,
  onSelectOpenChange,
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

  const isFormMode = bodyType === "multipart" || bodyType === "urlencoded"
  const isBinaryMode = bodyType === "binary"

  const body = formatBody(request.body)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)

  const { handleContentChange } = useJsonHighlight(
    textareaRef,
    lineNumberRef,
    theme,
    setEditValue,
  )

  const [typeSelectOpen, setTypeSelectOpen] = useState(false)

  const handleBodyTypeSelectOpen = useCallback(
    (open: boolean) => {
      setTypeSelectOpen(open)
      onSelectOpenChange?.(open)
    },
    [onSelectOpenChange],
  )

  const editingBody = inEdit && editState.cursor.field === "body"

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box
        style={{
          zIndex: typeSelectOpen ? 1 : undefined,
          backgroundColor:
            browseActive &&
            editState.cursor.field === "body" &&
            editState.cursor.row === 0
              ? theme.backgroundElement
              : undefined,
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
          <input
            id="body-field"
            value={editValue}
            placeholder="File path..."
            onInput={setEditValue}
            focused
            textColor={theme.text}
            cursorColor={theme.primary}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.borderSubtle}
          />
        ) : (
          <line-number
            ref={lineNumberRef}
            minWidth={3}
            paddingRight={1}
            fg={theme.textMuted}
            bg={theme.backgroundPanel}
            style={{ flexGrow: 1 }}
            width="100%"
          >
            <textarea
              ref={textareaRef}
              id="body-field"
              initialValue={formatBody(editValue)}
              onContentChange={handleContentChange}
              keyBindings={[{ name: "return", shift: true, action: "newline" }]}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
              focused
              style={{ flexGrow: 1 }}
            />
          </line-number>
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
          <text id="body-field" fg={theme.text}>
            {request.filePath || "(no file selected)"}
          </text>
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
            id="body-field"
            activeEnv={activeEnv ?? null}
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
  const textareaRef = useRef<TextareaRenderable | null>(null)

  const handleContentChange = useCallback(() => {
    const ta = textareaRef.current
    if (ta) setEditValue(ta.plainText)
  }, [setEditValue])

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
                  <textarea
                    ref={textareaRef}
                    initialValue={String(row.value)}
                    onContentChange={handleContentChange}
                    backgroundColor={theme.backgroundPanel}
                    focusedBackgroundColor={theme.backgroundPanel}
                    textColor={theme.text}
                    cursorColor={theme.primary}
                    focused
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
                <VarText
                  text={`${row.label}: ${row.display}`}
                  env={activeEnv ?? null}
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
