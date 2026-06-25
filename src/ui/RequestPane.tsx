import { TextAttributes } from "@opentui/core"
import type { Request } from "../schema"
import {
  methodColor,
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"

interface Props {
  request: Request | null
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  draft: UseRequestDraftResult
  focused?: boolean
}

function isFieldActive(editState: EditState, field: FieldKind): boolean {
  return editState.mode !== "inactive" && editState.cursor.field === field
}

function labelActive(
  editState: EditState,
  field: FieldKind,
): { fg: string; attributes?: number } {
  if (!isFieldActive(editState, field)) return { fg: "#888" }
  return { fg: "#000", attributes: TextAttributes.INVERSE }
}

export function RequestPane({
  request,
  editState,
  editValue,
  setEditValue,
  draft,
  focused = false,
}: Props) {
  const methodFg = request ? methodColor(request.method) : ""
  const headers = request ? formatHeaders(request.headers) : []
  const params = request ? formatParams(request.params) : []
  const body = request ? formatBody(request.body) : ""
  const auth = request ? formatAuth(request.auth) : ""
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
          <text fg={methodFg}>{request.method}</text>
          <text {...labelActive(editState, "headers")}>Headers</text>
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

          <text {...labelActive(editState, "params")}>Params</text>
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

          <text {...labelActive(editState, "body")}>Body</text>
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

          <text fg="#888">Auth</text>
          <text fg="#888">{"  " + auth}</text>
          <text fg="#888">[s] Send</text>
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
      )}
    </box>
  )
}
