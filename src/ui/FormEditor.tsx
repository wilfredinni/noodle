import type { FormEntry, Environment } from "../schema"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { Checkbox } from "./Checkbox"
import { varSummaryColor } from "./envHighlight"

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
    inEdit && cursorHere && !editState.cursor.addingRow && editState.cursor.row >= 1
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
                <input
                  value={isEditingThisRow ? editKey : displayKey}
                  placeholder="Key"
                  onInput={isEditingThisRow ? setEditKey : undefined}
                  focused={
                    isEditingThisRow && editState.cursor.subfield === "key"
                  }
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={
                    isEditingThisRow
                      ? theme.text
                      : varSummaryColor(
                          entry.name,
                          activeEnv ?? null,
                          theme,
                          dimmed
                            ? theme.textMuted
                            : entry.type === "file"
                              ? theme.primary
                              : theme.text,
                        )
                  }
                  cursorColor={theme.primary}
                  style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
                />
                <input
                  value={isEditingThisRow ? editValue : entry.value}
                  placeholder="Value"
                  onInput={isEditingThisRow ? setEditValue : undefined}
                  focused={
                    isEditingThisRow && editState.cursor.subfield === "value"
                  }
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  textColor={
                    isEditingThisRow
                      ? theme.text
                      : varSummaryColor(
                          entry.value,
                          activeEnv ?? null,
                          theme,
                          dimmed
                            ? theme.textMuted
                            : cursorOnThisRow
                              ? theme.text
                              : theme.textMuted,
                        )
                  }
                  cursorColor={theme.primary}
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
            <input
              value={editingAdd ? editKey : ""}
              placeholder="Key"
              onInput={editingAdd ? setEditKey : undefined}
              focused={editingAdd && editState.cursor.subfield === "key"}
              backgroundColor={editingAdd ? theme.backgroundElement : undefined}
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
              placeholder="Value"
              onInput={editingAdd ? setEditValue : undefined}
              focused={editingAdd && editState.cursor.subfield === "value"}
              backgroundColor={editingAdd ? theme.backgroundElement : undefined}
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
