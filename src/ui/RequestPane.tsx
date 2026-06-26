import type { ScrollBoxRenderable, TextareaRenderable, LineNumberRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Request } from "../schema"
import { formatBody, formatAuth } from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import type { Theme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { useJsonHighlight } from "./useJsonHighlight"
import { JsonBodyViewer } from "./JsonBodyViewer"

interface Props {
  request: Request | null
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  draft: UseRequestDraftResult
  focused?: boolean
  activeTab: FieldKind
}

const TAB_DEFS: TabDef[] = [
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
]

export function RequestPane({
  request,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  draft,
  focused = false,
  activeTab,
}: Props) {
  const theme = useTheme()
  const title = `Request${draft.isDirty ? "*" : ""}`
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
    } else {
      scrollRef.current?.scrollChildIntoView(`${field}-field`)
    }
  }, [editState.cursor])

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        paddingTop: 0,
        paddingBottom: 1,
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
    >
      {request ? (
        <>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            <scrollbox
              ref={scrollRef}
              scrollY
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
              {activeTab === "headers" && (
                <KeyValueSection
                  kind="headers"
                  request={request}
                  editState={editState}
                  editKey={editKey}
                  editValue={editValue}
                  setEditKey={setEditKey}
                  setEditValue={setEditValue}
                  browseActive={browseActive}
                  theme={theme}
                />
              )}
              {activeTab === "params" && (
                <KeyValueSection
                  kind="params"
                  request={request}
                  editState={editState}
                  editKey={editKey}
                  editValue={editValue}
                  setEditKey={setEditKey}
                  setEditValue={setEditValue}
                  browseActive={browseActive}
                  theme={theme}
                />
              )}
              {activeTab === "body" && (
                <BodySection
                  request={request}
                  editState={editState}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
                  browseActive={browseActive}
                  theme={theme}
                />
              )}
              {activeTab === "auth" && (
                <AuthSection
                  request={request}
                  editState={editState}
                  theme={theme}
                />
              )}
            </scrollbox>
          </Tabs>
        </>
      ) : (
        <text fg={theme.textMuted}>(no request selected)</text>
      )}
    </box>
  )
}

interface KeyValueSectionProps {
  kind: "headers" | "params"
  request: Request
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  browseActive: boolean
  theme: Theme
}

function KeyValueSection({
  kind,
  request,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  browseActive,
  theme,
}: KeyValueSectionProps) {
  const rec = kind === "headers" ? request.headers : request.params
  const rows = Object.entries(rec).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  const inEdit = editState.mode === "editing"
  const cursorHere = editState.cursor.field === kind
  const editingRow =
    inEdit && cursorHere && !editState.cursor.addingRow
      ? editState.cursor.row
      : -1
  const editingAdd = inEdit && cursorHere && editState.cursor.addingRow

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.length === 0 && editState.mode === "inactive" ? (
        <box
          id={`${kind === "headers" ? "hdr" : "prm"}-add`}
          style={{
            flexDirection: "row",
            gap: 0,
          }}
        >
          <input
            value=""
            placeholder="Key"
            textColor={theme.textMuted}
            cursorColor={theme.primary}
            style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
          />
          <input
            value=""
            placeholder="Value"
            textColor={theme.textMuted}
            cursorColor={theme.primary}
            style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
          />
        </box>
      ) : (
        <>
          {rows.map(([k, v], i) => {
            const isEditingThisRow = editingRow === i
            const cursorOnThisRow =
              browseActive &&
              cursorHere &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            const dimmed = inEdit && !isEditingThisRow

            return (
              <box
                key={i}
                id={`${kind === "headers" ? "hdr" : "prm"}-${i}`}
                style={{
                  flexDirection: "row",
                  gap: 0,
                  backgroundColor:
                    cursorOnThisRow || isEditingThisRow
                      ? theme.backgroundElement
                      : undefined,
                }}
              >
                <input
                  value={isEditingThisRow ? editKey : k}
                  onInput={isEditingThisRow ? setEditKey : undefined}
                  focused={
                    isEditingThisRow && editState.cursor.subfield === "key"
                  }
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={dimmed ? theme.textMuted : theme.text}
                  cursorColor={theme.primary}
                  style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
                />
                <input
                  value={isEditingThisRow ? editValue : v}
                  onInput={isEditingThisRow ? setEditValue : undefined}
                  focused={
                    isEditingThisRow && editState.cursor.subfield === "value"
                  }
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={
                    dimmed
                      ? theme.textMuted
                      : cursorOnThisRow || isEditingThisRow
                        ? theme.text
                        : theme.textMuted
                  }
                  cursorColor={theme.primary}
                  style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
                />
              </box>
            )
          })}
          <box
            id={`${kind === "headers" ? "hdr" : "prm"}-add`}
            style={{
              flexDirection: "row",
              gap: 0,
              backgroundColor:
                cursorHere && editState.cursor.addingRow
                  ? theme.backgroundElement
                  : undefined,
            }}
          >
            <input
              value={editingAdd ? editKey : ""}
              onInput={editingAdd ? setEditKey : undefined}
              focused={editingAdd && editState.cursor.subfield === "key"}
              backgroundColor={
                editingAdd ? theme.backgroundElement : undefined
              }
              focusedBackgroundColor={theme.borderSubtle}
              textColor={
                editingAdd || (cursorHere && editState.cursor.addingRow)
                  ? theme.text
                  : theme.textMuted
              }
              cursorColor={theme.primary}
              style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
            />
            <input
              value={editingAdd ? editValue : ""}
              onInput={editingAdd ? setEditValue : undefined}
              focused={
                editingAdd && editState.cursor.subfield === "value"
              }
              backgroundColor={
                editingAdd ? theme.backgroundElement : undefined
              }
              focusedBackgroundColor={theme.borderSubtle}
              textColor={
                editingAdd || (cursorHere && editState.cursor.addingRow)
                  ? theme.text
                  : theme.textMuted
              }
              cursorColor={theme.primary}
              style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
            />
          </box>
        </>
      )}
    </box>
  )
}

function BodySection({
  request,
  editState,
  editValue,
  setEditValue,
  inEdit,
  browseActive: _browseActive,
  theme,
}: {
  request: Request
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
}) {
  const body = formatBody(request.body)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)

  const { handleContentChange } = useJsonHighlight(
    textareaRef,
    lineNumberRef,
    theme,
    setEditValue,
  )

  const editingBody = inEdit && editState.cursor.field === "body"

  if (editingBody) {
    const initialValue = formatBody(editValue)
    return (
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
          initialValue={initialValue}
          onContentChange={handleContentChange}
          keyBindings={[{ name: "return", shift: true, action: "newline" }]}
          backgroundColor={theme.backgroundPanel}
          focusedBackgroundColor={theme.backgroundPanel}
          textColor={theme.text}
          cursorColor={theme.primary}
          focused
        />
      </line-number>
    )
  }

  if (body === "") {
    return (
      <text id="body-field" fg={theme.textMuted}>
        (none)
      </text>
    )
  }

  return <JsonBodyViewer body={body} theme={theme} id="body-field" />
}

function AuthSection({
  request,
  editState,
  theme,
}: {
  request: Request
  editState: EditState
  theme: Theme
}) {
  const auth = formatAuth(request.auth)
  const isActive =
    editState.mode === "browsing" && editState.cursor.field === "auth"
  return (
    <box
      id="auth-field"
      border={[...LeftBar.border]}
      customBorderChars={LeftBar.customBorderChars}
      borderColor={isActive ? theme.primary : theme.borderSubtle}
      style={{
        backgroundColor: isActive ? theme.backgroundElement : undefined,
      }}
    >
      <text fg={isActive ? theme.text : theme.textMuted}>{" " + auth}</text>
    </box>
  )
}
