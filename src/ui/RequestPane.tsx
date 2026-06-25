import { TextAttributes } from "@opentui/core"
import type { Request } from "../schema"
import {
  formatHeaders,
  formatParams,
  formatBody,
  formatAuth,
} from "./formatRequest"
import type { EditState } from "./editMode"
import type { UseRequestDraftResult } from "./useRequestDraft"

interface Props {
  request: Request | null
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  draft: UseRequestDraftResult
  focused?: boolean
}

export function RequestPane({
  request,
  editState,
  editValue,
  setEditValue,
  draft,
  focused = false,
}: Props) {
  const headers = request ? formatHeaders(request.headers) : []
  const params = request ? formatParams(request.params) : []
  const body = request ? formatBody(request.body) : ""
  const auth = request ? formatAuth(request.auth) : ""
  const title = `Request${draft.isDirty ? "*" : ""}`
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"

  const activeTab = editState.cursor.field === "url" ? "headers" : editState.cursor.field

  const tabs = [
    { id: "headers", label: "Headers" },
    { id: "params", label: "Params" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
  ] as const

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
          <box style={{ flexDirection: "row", gap: 2 }}>
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.id
              const fg = isSelected ? "#000" : "#888"
              const attributes = isSelected ? TextAttributes.INVERSE : 0
              return (
                <text key={tab.id} fg={fg} attributes={attributes}>
                  {`  ${tab.label}  `}
                </text>
              )
            })}
          </box>

          <box style={{ flexDirection: "column", flexGrow: 1, paddingTop: 1, gap: 1 }}>
            {activeTab === "headers" && (
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
            )}

            {activeTab === "params" && (
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
            )}

            {activeTab === "body" && (
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
            )}

            {activeTab === "auth" && (
              <>
                {auth === "" ? (
                  <text fg="#888">{"  (none)"}</text>
                ) : (
                  <text
                    attributes={
                      browseActive && editState.cursor.field === "auth"
                        ? TextAttributes.INVERSE
                        : 0
                    }
                  >
                    {"  " + auth}
                  </text>
                )}
              </>
            )}
          </box>

          <text fg="#888">[s] Send</text>
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
      )}
    </box>
  )
}
