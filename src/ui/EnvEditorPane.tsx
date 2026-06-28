import { useTheme } from "./theme"
import type { EnvDraft } from "./useEnvironmentEditor"

export function EnvEditorPane({
  draft,
  selectedRowIndex,
  editingField,
  dirty,
  saving,
  error,
  onNameChange,
  onColorChange,
  onSelectRow: _onSelectRow,
  onUpdateVarKey,
  onUpdateVarValue,
  onToggleVar: _onToggleVar,
  onDeleteVar: _onDeleteVar,
  onAddVar: _onAddVar,
  focused: _focused,
}: {
  draft: EnvDraft | null
  selectedRowIndex: number
  editingField: "key" | "value" | null
  dirty: boolean
  saving: boolean
  error: string | null
  onNameChange: (name: string) => void
  onColorChange: (color: string | undefined) => void
  onSelectRow: (index: number) => void
  onUpdateVarKey: (index: number, key: string) => void
  onUpdateVarValue: (index: number, value: string) => void
  onToggleVar: (index: number) => void
  onDeleteVar: (index: number) => void
  onAddVar: () => void
  focused: boolean
}) {
  const theme = useTheme()

  if (!draft) {
    return (
      <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
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
  const activeCount = rows.filter((r) => r.enabled).length
  const colorValue =
    draft.color !== undefined
      ? ((theme as unknown as Record<string, string>)[draft.color] ??
          theme.textMuted)
      : theme.textMuted

  return (
    <box
      style={{
        flexDirection: "column",
        flexGrow: 1,
        padding: 1,
        gap: 1,
      }}
    >
      <box style={{ flexDirection: "column", gap: 0 }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <input
            value={draft.name}
            placeholder="Environment name"
            onInput={onNameChange}
            textColor={theme.text}
            cursorColor={theme.primary}
            style={{ flexGrow: 1 }}
          />
          <input
            value={draft.color ?? ""}
            placeholder="Color"
            onInput={(v) => onColorChange(v || undefined)}
            textColor={colorValue}
            cursorColor={theme.primary}
            style={{ width: 18 }}
          />
        </box>
      </box>
      <text fg={theme.textMuted}>
        ── Variables ─────────────────────────────
      </text>
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
              <text fg={row.enabled ? theme.primary : theme.textMuted}>
                {row.enabled ? "[x] " : "[ ] "}
              </text>
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
              <text fg={theme.error}>
                {" "}[x]{" "}
              </text>
            </box>
          )
        })}
      </scrollbox>
      <box style={{ flexDirection: "row", gap: 1 }}>
        <text fg={theme.primary}>
          [+ Add Variable]
        </text>
        <box style={{ flexGrow: 1 }} />
        <text
          fg={
            draft.varRows.length === 0
              ? theme.textMuted
              : dirty
                ? theme.warning
                : theme.success
          }
        >
          {saving
            ? "Saving..."
            : error
              ? `Error: ${error}`
              : `${activeCount} active · ${rows.length} var${rows.length !== 1 ? "s" : ""}${dirty ? " · modified" : ""}`}
        </text>
      </box>
    </box>
  )
}
