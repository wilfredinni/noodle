import { TextAttributes } from "@opentui/core"
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
  const title = `Request${draft.isDirty ? "*" : ""}`
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"

  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
        gap: 1,
      }}
      title={focused ? `▸ ${title}` : title}
    >
      {request ? (
        <>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            <scrollbox scrollY style={{ flexGrow: 1 }}>
              {activeTab === "headers" && (
                <HeadersSection
                  request={request}
                  editState={editState}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
                  browseActive={browseActive}
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
                />
              )}
              {activeTab === "auth" && (
                <AuthSection request={request} editState={editState} />
              )}
            </scrollbox>
          </Tabs>
          <text fg="#888">[s] Send</text>
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
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
}: {
  request: Request
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
}) {
  const headers = formatHeaders(request.headers)
  return (
    <>
      {headers.length === 0 &&
      !(browseActive && editState.cursor.field === "headers") ? (
        <text fg="#888">{"  (none)"}</text>
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
                  value={editValue}
                  onInput={setEditValue}
                  backgroundColor="#222"
                  focusedBackgroundColor="#333"
                  textColor="#fff"
                  cursorColor="#0f0"
                  focused
                />
              )
            }
            return (
              <text
                key={i}
                fg="#888"
                attributes={cursorHere ? TextAttributes.INVERSE : 0}
              >
                {"  " + line}
              </text>
            )
          })}
          {browseActive && editState.cursor.field === "headers" && (
            <text
              fg="#888"
              attributes={
                editState.cursor.addingRow ? TextAttributes.INVERSE : 0
              }
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
}: {
  request: Request
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
}) {
  const params = formatParams(request.params)
  return (
    <>
      {params.length === 0 &&
      !(browseActive && editState.cursor.field === "params") ? (
        <text fg="#888">{"  (none)"}</text>
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
                  value={editValue}
                  onInput={setEditValue}
                  backgroundColor="#222"
                  focusedBackgroundColor="#333"
                  textColor="#fff"
                  cursorColor="#0f0"
                  focused
                />
              )
            }
            return (
              <text
                key={i}
                fg="#888"
                attributes={cursorHere ? TextAttributes.INVERSE : 0}
              >
                {"  " + line}
              </text>
            )
          })}
          {browseActive && editState.cursor.field === "params" && (
            <text
              fg="#888"
              attributes={
                editState.cursor.addingRow ? TextAttributes.INVERSE : 0
              }
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
}: {
  request: Request
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
}) {
  const body = formatBody(request.body)
  return (
    <>
      {inEdit && editState.cursor.field === "body" ? (
        <input
          value={editValue}
          onInput={setEditValue}
          backgroundColor="#222"
          focusedBackgroundColor="#333"
          textColor="#fff"
          cursorColor="#0f0"
          focused
        />
      ) : body === "" ? (
        <text fg="#888">{"  (none)"}</text>
      ) : (
        <text
          attributes={
            browseActive && editState.cursor.field === "body"
              ? TextAttributes.INVERSE
              : 0
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
}: {
  request: Request
  editState: EditState
}) {
  const auth = formatAuth(request.auth)
  const isActive = editState.mode === "browsing" && editState.cursor.field === "auth"
  return (
    <text
      fg="#888"
      attributes={isActive ? TextAttributes.INVERSE : 0}
    >
      {"  " + auth}
    </text>
  )
}
