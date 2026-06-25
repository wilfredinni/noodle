import { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import type { Request } from "../schema"
import {
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme, contrastOnPrimary } from "./theme"
import type { Theme } from "./theme"

interface Props {
  request: Request | null
  editState: EditState
  editValue: string
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
  editValue,
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
        padding: 1,
        gap: 1,
        flexBasis: 0,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
    >
      <text fg={focused ? theme.accent : theme.textMuted}>
        {focused ? `▸ ${title}` : title}
      </text>
      {request ? (
        <>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            <scrollbox ref={scrollRef} scrollY style={{ flexGrow: 1 }}>
              {activeTab === "headers" && (
                <HeadersSection
                  request={request}
                  editState={editState}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
                  browseActive={browseActive}
                  theme={theme}
                />
              )}
              {activeTab === "params" && (
                <ParamsSection
                  request={request}
                  editState={editState}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
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
          <text fg={theme.textMuted}>[s] Send</text>
        </>
      ) : (
        <text fg={theme.textMuted}>(no request selected)</text>
      )}
    </box>
  )
}

function HeadersSection({
  request,
  editState,
  editValue,
  setEditValue,
  inEdit,
  browseActive,
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
  const headers = formatHeaders(request.headers)
  return (
    <>
      {headers.length === 0 &&
      !(browseActive && editState.cursor.field === "headers") ? (
        <text fg={theme.textMuted}>{"  (none)"}</text>
      ) : (
        <>
          {headers.map((line, i) => {
            const cursorHere =
              browseActive &&
              editState.cursor.field === "headers" &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            const editingHere =
              inEdit &&
              editState.cursor.field === "headers" &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            if (editingHere) {
              return (
                <input
                  key={i}
                  id={`hdr-${i}`}
                  value={editValue}
                  onInput={setEditValue}
                  backgroundColor={theme.backgroundElement}
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={theme.text}
                  cursorColor={theme.primary}
                  focused
                />
              )
            }
            return (
              <text
                key={i}
                id={`hdr-${i}`}
                fg={cursorHere ? contrastOnPrimary(theme) : theme.textMuted}
                bg={cursorHere ? theme.primary : undefined}
              >
                {"  " + line}
              </text>
            )
          })}
          {browseActive && editState.cursor.field === "headers" && (
            <text
              id="hdr-add"
              fg={
                editState.cursor.addingRow
                  ? contrastOnPrimary(theme)
                  : theme.textMuted
              }
              bg={editState.cursor.addingRow ? theme.primary : undefined}
            >
              {"  [+] add header"}
            </text>
          )}
        </>
      )}
    </>
  )
}

function ParamsSection({
  request,
  editState,
  editValue,
  setEditValue,
  inEdit,
  browseActive,
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
  const params = formatParams(request.params)
  return (
    <>
      {params.length === 0 &&
      !(browseActive && editState.cursor.field === "params") ? (
        <text fg={theme.textMuted}>{"  (none)"}</text>
      ) : (
        <>
          {params.map((line, i) => {
            const cursorHere =
              browseActive &&
              editState.cursor.field === "params" &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            const editingHere =
              inEdit &&
              editState.cursor.field === "params" &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            if (editingHere) {
              return (
                <input
                  key={i}
                  id={`prm-${i}`}
                  value={editValue}
                  onInput={setEditValue}
                  backgroundColor={theme.backgroundElement}
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={theme.text}
                  cursorColor={theme.primary}
                  focused
                />
              )
            }
            return (
              <text
                key={i}
                id={`prm-${i}`}
                fg={cursorHere ? contrastOnPrimary(theme) : theme.textMuted}
                bg={cursorHere ? theme.primary : undefined}
              >
                {"  " + line}
              </text>
            )
          })}
          {browseActive && editState.cursor.field === "params" && (
            <text
              id="prm-add"
              fg={
                editState.cursor.addingRow
                  ? contrastOnPrimary(theme)
                  : theme.textMuted
              }
              bg={editState.cursor.addingRow ? theme.primary : undefined}
            >
              {"  [+] add param"}
            </text>
          )}
        </>
      )}
    </>
  )
}

function BodySection({
  request,
  editState,
  editValue,
  setEditValue,
  inEdit,
  browseActive,
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
  return (
    <>
      {inEdit && editState.cursor.field === "body" ? (
        <input
          id="body-field"
          value={editValue}
          onInput={setEditValue}
          backgroundColor={theme.backgroundElement}
          focusedBackgroundColor={theme.borderSubtle}
          textColor={theme.text}
          cursorColor={theme.primary}
          focused
        />
      ) : body === "" ? (
        <text id="body-field" fg={theme.textMuted}>
          {"  (none)"}
        </text>
      ) : (
        <text
          id="body-field"
          fg={
            browseActive && editState.cursor.field === "body"
              ? contrastOnPrimary(theme)
              : theme.text
          }
          bg={
            browseActive && editState.cursor.field === "body"
              ? theme.primary
              : undefined
          }
        >
          {body}
        </text>
      )}
    </>
  )
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
    <text
      id="auth-field"
      fg={isActive ? contrastOnPrimary(theme) : theme.textMuted}
      bg={isActive ? theme.primary : undefined}
    >
      {"  " + auth}
    </text>
  )
}
