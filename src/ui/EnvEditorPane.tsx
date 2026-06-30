import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import type { EnvDraft } from "../hooks/useEnvironmentEditor"
import { Checkbox } from "./Checkbox"

export function EnvEditorPane({
  draft,
  selectedRowIndex,
  editingField,
  saving,
  error,
  onSelectRow: _onSelectRow,
  onUpdateVarKey,
  onUpdateVarValue,
  onToggleVar: _onToggleVar,
  onDeleteVar: _onDeleteVar,
  focused: _focused,
}: {
  draft: EnvDraft | null
  selectedRowIndex: number
  editingField: "key" | "value" | null
  saving: boolean
  error: string | null
  onSelectRow: (index: number) => void
  onUpdateVarKey: (index: number, key: string) => void
  onUpdateVarValue: (index: number, value: string) => void
  onToggleVar: (index: number) => void
  onDeleteVar: (index: number) => void
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
          const isSelected = i === selectedRowIndex
          const editing =
            isSelected && editingField !== null ? editingField : null
          return (
            <box
              key={row.id}
              id={`vrow-${i}`}
              style={{
                flexDirection: "row",
                gap: 0,
                backgroundColor:
                  isSelected && editingField === null
                    ? theme.backgroundElement
                    : i % 2 !== 0
                      ? stripeBg
                      : undefined,
              }}
            >
              <Checkbox checked={row.enabled} theme={theme} />
              <input
                value={editing === "key" ? row.key : row.key}
                placeholder="Key"
                onInput={(v) => onUpdateVarKey(i, v)}
                focused={editing === "key"}
                backgroundColor={
                  isSelected && editing !== null
                    ? theme.backgroundElement
                    : undefined
                }
                focusedBackgroundColor={theme.borderSubtle}
                textColor={
                  isSelected && editingField !== null
                    ? theme.text
                    : row.enabled
                      ? theme.text
                      : theme.textMuted
                }
                cursorColor={theme.primary}
                style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
              />
              <input
                value={editing === "value" ? row.value : row.value}
                placeholder="Value"
                onInput={(v) => onUpdateVarValue(i, v)}
                focused={editing === "value"}
                backgroundColor={
                  isSelected && editing !== null
                    ? theme.backgroundElement
                    : undefined
                }
                focusedBackgroundColor={theme.borderSubtle}
                textColor={
                  isSelected && editingField !== null
                    ? theme.text
                    : row.enabled
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
          key="add"
          style={{
            flexDirection: "row",
            gap: 0,
            backgroundColor:
              selectedRowIndex === rows.length && editingField === null
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
      </scrollbox>
      {error && (
        <text fg={theme.error}>Error: {error}</text>
      )}
      {saving && <text fg={theme.info}>Saving...</text>}
    </box>
  )
}
