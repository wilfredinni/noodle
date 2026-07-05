import type { Environment } from "../schema"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarInput } from "./VarInput"

export interface FolderMetaTabProps {
  name: string
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
}

export function FolderMetaTab({
  name,
  editState,
  setEditValue,
  browseActive,
  theme,
  activeEnv,
}: FolderMetaTabProps) {
  const inEdit = editState.mode === "editing"
  const cursorHere = editState.cursor.field === "meta"
  const editingRow = inEdit && cursorHere ? editState.cursor.row : -1

  const nameActive = browseActive && cursorHere
  const nameEditing = editingRow === 0

  return (
    <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
      <text fg={theme.textMuted}>Edit folder metadata.</text>
      <box
        border={[...LeftBar.border]}
        customBorderChars={LeftBar.customBorderChars}
        borderColor={
          nameActive || nameEditing ? theme.primary : theme.borderSubtle
        }
        style={{
          flexDirection: nameEditing ? "row" : undefined,
          gap: nameEditing ? 1 : undefined,
          backgroundColor: nameActive ? theme.backgroundElement : undefined,
          paddingLeft: 1,
        }}
      >
        {nameEditing ? (
          <>
            <text fg={theme.textMuted}>Name: </text>
            <VarInput
              value={name}
              env={activeEnv ?? null}
              isEditing
              useTextarea
              onChange={setEditValue}
            />
          </>
        ) : (
          <VarInput
            value={`Name: ${name}`}
            env={activeEnv ?? null}
            isEditing={false}
            baseColor={theme.text}
          />
        )}
      </box>
    </box>
  )
}
