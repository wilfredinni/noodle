import type { Environment } from "../schema"
import type { EnvDraft, EnvEditState } from "../hooks/useEnvironmentEditor"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import { Checkbox } from "./Checkbox"
import { VarInput } from "./VarInput"

export function EnvEditorPane({
  draft,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  saving,
  error,
  activeEnv,
  focused: _focused,
}: {
  draft: EnvDraft | null
  editState: EnvEditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  saving: boolean
  error: string | null
  activeEnv: Environment | null
  focused: boolean
}) {
  const theme = useTheme()

  if (!draft) {
    return (
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          padding: 1,
          backgroundColor: theme.backgroundPanel,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={theme.borderSubtle}
        title="Variables"
        titleColor={theme.textMuted}
        titleAlignment="left"
      >
        <text fg={theme.textMuted}>Select an environment to edit</text>
      </box>
    )
  }

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

  const rows = draft.varRows
  const inEdit = editState.mode === "editing"
  const inBrowse = editState.mode === "browsing"
  const editingRow = inEdit && !editState.addingRow ? editState.editingRow : -1
  const editingAdd = inEdit && editState.addingRow

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        padding: 1,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={_focused ? theme.primary : theme.borderSubtle}
      title="Variables"
      titleColor={_focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      <scrollbox
        scrollY
        style={{ flexGrow: 1, minHeight: 0 }}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        {rows.map((row, i) => {
          const isEditingThisRow = editingRow === i
          const cursorOnThisRow =
            inBrowse && !editState.addingRow && editState.row === i
          const dimmed = (inEdit && !isEditingThisRow) || !row.enabled

          const keyBaseColor = dimmed ? theme.textMuted : theme.text
          const valueBaseColor = dimmed ? theme.textMuted : theme.text

          return (
            <box
              key={row.id}
              id={`vrow-${i}`}
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
              <Checkbox checked={row.enabled} theme={theme} />
              <VarInput
                value={isEditingThisRow ? editKey : row.key}
                env={activeEnv}
                isEditing={isEditingThisRow}
                onChange={setEditKey}
                isFocused={isEditingThisRow && editState.subfield === "key"}
                baseColor={keyBaseColor}
                backgroundColor={
                  isEditingThisRow ? theme.backgroundElement : undefined
                }
                focusedBackgroundColor={theme.borderSubtle}
                style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
              />
              <VarInput
                value={isEditingThisRow ? editValue : row.value}
                env={activeEnv}
                isEditing={isEditingThisRow}
                onChange={setEditValue}
                isFocused={isEditingThisRow && editState.subfield === "value"}
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
          key="add"
          style={{
            flexDirection: "row",
            gap: 0,
            backgroundColor:
              inBrowse && editState.addingRow
                ? theme.backgroundElement
                : editingAdd
                  ? theme.backgroundElement
                  : undefined,
          }}
        >
          <Checkbox checked={false} theme={theme} />
          <VarInput
            value={editingAdd ? editKey : ""}
            env={activeEnv}
            isEditing={editingAdd}
            onChange={setEditKey}
            isFocused={editingAdd && editState.subfield === "key"}
            baseColor={
              editingAdd || (inBrowse && editState.addingRow)
                ? theme.text
                : theme.textMuted
            }
            backgroundColor={editingAdd ? theme.backgroundElement : undefined}
            focusedBackgroundColor={theme.borderSubtle}
            style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
          />
          <VarInput
            value={editingAdd ? editValue : ""}
            env={activeEnv}
            isEditing={editingAdd}
            onChange={setEditValue}
            isFocused={editingAdd && editState.subfield === "value"}
            baseColor={
              editingAdd || (inBrowse && editState.addingRow)
                ? theme.text
                : theme.textMuted
            }
            backgroundColor={editingAdd ? theme.backgroundElement : undefined}
            focusedBackgroundColor={theme.borderSubtle}
            style={{ flexGrow: 7, flexShrink: 1, flexBasis: 0 }}
          />
        </box>
      </scrollbox>
      {error && <text fg={theme.error}>Error: {error}</text>}
      {saving && <text fg={theme.info}>Saving...</text>}
    </box>
  )
}
