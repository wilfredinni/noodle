import { TextAttributes } from "@opentui/core"
import type { Request } from "../schema"
import { methodColor } from "./formatRequest"
import type { EditState } from "./editMode"

interface Props {
  request: Request | null
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  focused?: boolean
}

export function UrlPane({
  request,
  editState,
  editValue,
  setEditValue,
  focused = false,
}: Props) {
  const methodFg = request ? methodColor(request.method) : ""
  const inEdit = editState.mode === "editing" && editState.cursor.field === "url"
  const browseActive = editState.mode === "browsing" && editState.cursor.field === "url"

  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        flexDirection: "row",
        padding: 1,
        height: 3,
      }}
      title={focused ? "▸ URL" : "URL"}
    >
      {request ? (
        <>
          <text
            fg={methodFg}
            attributes={browseActive ? TextAttributes.INVERSE : 0}
          >
            {request.method}{" "}
          </text>
          {inEdit ? (
            <input
              value={editValue}
              onInput={setEditValue}
              backgroundColor="#222"
              focusedBackgroundColor="#333"
              textColor="#fff"
              cursorColor="#0f0"
              focused
            />
          ) : (
            <text
              fg={methodFg}
              attributes={browseActive ? TextAttributes.INVERSE : 0}
            >
              {request.url}
            </text>
          )}
        </>
      ) : (
        <text fg="#888">(no request selected)</text>
      )}
    </box>
  )
}
