import type { FormEntry, Environment } from "../schema"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { Checkbox } from "./Checkbox"
import { VarInput } from "./VarInput"

export interface FormEditorProps {
  request: {
    formData?: FormEntry[]
    bodyType?: string
  }
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
}

export function FormEditor({
  request,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  browseActive,
  theme,
  activeEnv,
}: FormEditorProps) {
  const rows = request.formData ?? []

  const panelNum = parseInt(theme.backgroundPanel.slice(1), 16)
  const elemNum = parseInt(theme.backgroundElement.slice(1), 16)
  const stripeR = Math.round(
    (((panelNum >> 16) & 0xff) + ((elemNum >> 16) & 0xff)) / 2,
  )
  const stripeG = Math.round(
    (((panelNum >> 8) & 0xff) + ((elemNum >> 8) & 0xff)) / 2,
  )
  const stripeB = Math.round(((panelNum & 0xff) + (elemNum & 0xff)) / 2)
  const stripeBg = `#${stripeR.toString(16).padStart(2, "0")}${stripeG.toString(16).padStart(2, "0")}${stripeB.toString(16).padStart(2, "0")}`

  const inEdit = editState.mode === "editing"
  const cursorHere = editState.cursor.field === "body"
  const editingRow =
    inEdit &&
    cursorHere &&
    !editState.cursor.addingRow &&
    editState.cursor.row >= 1
      ? editState.cursor.row - 1
      : -1
  const editingAdd = inEdit && cursorHere && editState.cursor.addingRow

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.length === 0 && !editingAdd ? (
        <box
          id="body-add"
          style={{
            flexDirection: "row",
            gap: 0,
            backgroundColor:
              cursorHere && editState.cursor.addingRow
                ? theme.backgroundElement
                : undefined,
          }}
        >
          <Checkbox checked={false} theme={theme} />
          <VarInput
            value=""
            env={activeEnv ?? null}
            isEditing={false}
            baseColor={theme.textMuted}
            style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
          />
          <VarInput
            value=""
            env={activeEnv ?? null}
            isEditing={false}
            baseColor={theme.textMuted}
            style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
          />
        </box>
      ) : (
        <>
          {rows.map((entry, i) => {
            const isEditingThisRow = editingRow === i
            const cursorOnThisRow =
              browseActive &&
              cursorHere &&
              !editState.cursor.addingRow &&
              editState.cursor.row - 1 === i
            const dimmed = (inEdit && !isEditingThisRow) || !entry.enabled

            const displayKey =
              entry.type === "file" ? `[F] ${entry.name}` : entry.name

            const keyBaseColor = dimmed
              ? theme.textMuted
              : entry.type === "file"
                ? theme.primary
                : theme.text

            const valueBaseColor = dimmed
              ? theme.textMuted
              : cursorOnThisRow
                ? theme.text
                : theme.textMuted

            return (
              <box
                key={i}
                id={`body-${i}`}
                style={{
                  flexDirection: "row",
                  gap: 0,
                  backgroundColor:
                    cursorOnThisRow || isEditingThisRow
                      ? theme.backgroundElement
                      : i % 2 !== 0
                        ? stripeBg
                        : undefined,
                }}
              >
                <Checkbox checked={entry.enabled} theme={theme} />
                <VarInput
                  value={isEditingThisRow ? editKey : displayKey}
                  env={activeEnv ?? null}
                  isEditing={isEditingThisRow}
                  onChange={setEditKey}
                  isFocused={editState.cursor.subfield === "key"}
                  baseColor={keyBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
                />
                <VarInput
                  value={isEditingThisRow ? editValue : entry.value}
                  env={activeEnv ?? null}
                  isEditing={isEditingThisRow}
                  onChange={setEditValue}
                  isFocused={editState.cursor.subfield === "value"}
                  baseColor={valueBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
                />
              </box>
            )
          })}
          <box
            id="body-add"
            style={{
              flexDirection: "row",
              gap: 0,
              backgroundColor:
                cursorHere && editState.cursor.addingRow
                  ? theme.backgroundElement
                  : undefined,
            }}
          >
            <Checkbox checked={false} theme={theme} />
            <VarInput
              value={editingAdd ? editKey : ""}
              env={activeEnv ?? null}
              isEditing={editingAdd}
              onChange={setEditKey}
              isFocused={editState.cursor.subfield === "key"}
              baseColor={
                editingAdd || (cursorHere && editState.cursor.addingRow)
                  ? theme.text
                  : theme.textMuted
              }
              backgroundColor={
                editingAdd ? theme.backgroundElement : undefined
              }
              focusedBackgroundColor={theme.borderSubtle}
              style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
            />
            <VarInput
              value={editingAdd ? editValue : ""}
              env={activeEnv ?? null}
              isEditing={editingAdd}
              onChange={setEditValue}
              isFocused={editState.cursor.subfield === "value"}
              baseColor={
                editingAdd || (cursorHere && editState.cursor.addingRow)
                  ? theme.text
                  : theme.textMuted
              }
              backgroundColor={
                editingAdd ? theme.backgroundElement : undefined
              }
              focusedBackgroundColor={theme.borderSubtle}
              style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
            />
          </box>
        </>
      )}
    </box>
  )
}
