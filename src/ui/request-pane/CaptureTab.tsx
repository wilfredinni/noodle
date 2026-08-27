import { MouseButton } from "@opentui/core"
import type { Environment, Request, Response } from "../../schema"
import { responseExpressionSuggestions } from "../../response"
import type { EditState, FieldSubfield } from "../editMode"
import { useTheme } from "../theme"
import { VarInput } from "../VarInput"

interface Props {
  request: Request
  response?: Response
  editState: EditState
  editKey: string
  editValue: string
  editError: string | null
  setEditKey: (value: string) => void
  setEditValue: (value: string) => void
  activeEnv?: Environment | null
  onActivateRow?: (row: number, subfield?: FieldSubfield) => void
  onSubfieldFocus?: (subfield: FieldSubfield) => void
  interactive?: boolean
}

export function CaptureTab({
  request,
  response,
  editState,
  editKey,
  editValue,
  editError,
  setEditKey,
  setEditValue,
  activeEnv,
  onActivateRow,
  onSubfieldFocus,
  interactive = true,
}: Props) {
  const theme = useTheme()
  const suggestions = responseExpressionSuggestions(response)
  const rows = [...Object.entries(request.captures ?? {}), null]

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      <text fg={theme.textMuted}>
        Extract response values for later requests in a collection run.
      </text>
      {rows.map((capture, index) => {
        const selected =
          editState.cursor.field === "captures" &&
          editState.cursor.row === index
        const editing = selected && editState.mode === "editing"
        const backgroundColor = selected ? theme.backgroundElement : undefined
        const activate = (subfield: FieldSubfield) => {
          if (!interactive || editing) {
            onSubfieldFocus?.(subfield)
            return
          }
          onActivateRow?.(index, subfield)
        }

        return (
          <box key={`capture-${index}`} style={{ flexDirection: "column" }}>
            <box
              id={`captures-${index}`}
              style={{
                flexDirection: "row",
                minHeight: 1,
                minWidth: 0,
                backgroundColor,
              }}
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                activate("key")
                event.stopPropagation()
              }}
            >
              {!editing && capture === null ? (
                <text fg={selected ? theme.primary : theme.textMuted}>
                  + Add capture
                </text>
              ) : (
                <>
                  <box style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}>
                    <VarInput
                      value={editing ? editKey : (capture?.[0] ?? "")}
                      placeholder="Variable"
                      env={activeEnv ?? null}
                      isEditing={editing}
                      isFocused={editState.cursor.subfield === "key"}
                      onChange={setEditKey}
                      onFocus={() => onSubfieldFocus?.("key")}
                      baseColor={theme.primary}
                      backgroundColor={backgroundColor}
                      paddingX={1}
                      stopMousePropagation={editing}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                  <text fg={theme.textMuted}>←</text>
                  <box
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      activate("value")
                      event.stopPropagation()
                    }}
                    style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}
                  >
                    <VarInput
                      value={editing ? editValue : (capture?.[1] ?? "")}
                      placeholder="Response expression"
                      env={activeEnv ?? null}
                      isEditing={editing}
                      isFocused={editState.cursor.subfield === "value"}
                      onChange={setEditValue}
                      onFocus={() => onSubfieldFocus?.("value")}
                      completionValues={suggestions}
                      backgroundColor={backgroundColor}
                      paddingX={1}
                      stopMousePropagation={editing}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                </>
              )}
            </box>
            {editing && editError ? (
              <text fg={theme.error}> {editError}</text>
            ) : null}
          </box>
        )
      })}
    </box>
  )
}
