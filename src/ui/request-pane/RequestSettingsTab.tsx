import type { Request, Environment } from "../../schema"
import { MouseButton } from "@opentui/core"
import type { EditState } from "../editMode"
import type { Theme } from "../theme"
import { VarInput } from "../VarInput"
import { Checkbox } from "../Checkbox"
import { LeftBar } from "../borders"

export function SettingsSection({
  request,
  editState,
  setEditValue,
  inEdit,
  browseActive,
  theme,
  activeEnv,
  onActivateRow,
  onToggleRow,
}: {
  request: Request
  editState: EditState
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
  onActivateRow?: (row: number) => void
  onToggleRow?: (row: number) => void
}) {
  const rows = [
    {
      label: "Timeout (ms)",
      value: request.timeout,
      display: `${request.timeout}ms`,
      desc: "Set maximum time to wait before aborting the request",
    },
    {
      label: "Follow Redirects",
      value: request.followRedirects ?? true,
      display: String(request.followRedirects ?? true),
      desc: "Automatically follow HTTP redirects",
    },
    {
      label: "Max Redirects",
      value: request.maxRedirects ?? 5,
      display: String(request.maxRedirects ?? 5),
      desc: "Maximum number of redirects to follow",
    },
  ]

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {rows.map((row, idx) => {
        const editingRow =
          inEdit &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx
        const isActive =
          browseActive &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx

        return (
          <box key={row.label} style={{ flexDirection: "column" }}>
            <box
              id={idx === 0 ? "settings-field" : `settings-${idx}`}
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={
                isActive || editingRow ? theme.primary : theme.borderSubtle
              }
              style={{
                flexDirection: editingRow ? "row" : undefined,
                gap: editingRow ? 1 : undefined,
                backgroundColor: isActive ? theme.backgroundElement : undefined,
              }}
              onMouseDown={
                !editingRow && idx !== 1 && onActivateRow
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onActivateRow(idx)
                      event.stopPropagation()
                    }
                  : undefined
              }
            >
              {editingRow ? (
                <>
                  <text fg={theme.textMuted}>{row.label}: </text>
                  <VarInput
                    value={String(row.value)}
                    env={activeEnv ?? null}
                    isEditing
                    useTextarea
                    onChange={setEditValue}
                  />
                </>
              ) : idx === 1 ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{row.label}: </text>
                  <box
                    onMouseDown={
                      onToggleRow
                        ? (event) => {
                            if (event.button !== MouseButton.LEFT) return
                            onToggleRow(idx)
                            event.stopPropagation()
                          }
                        : undefined
                    }
                  >
                    <Checkbox
                      checked={request.followRedirects ?? true}
                      theme={theme}
                    />
                  </box>
                </box>
              ) : (
                <VarInput
                  value={`${row.label}: ${row.display}`}
                  env={activeEnv ?? null}
                  isEditing={false}
                  baseColor={theme.text}
                />
              )}
            </box>
            <text fg={theme.textMuted}>{row.desc}</text>
          </box>
        )
      })}
    </box>
  )
}
