import { useCallback, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Environment } from "../schema"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarText } from "./VarText"

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
  editValue: _editValue,
  setEditValue,
  browseActive,
  theme,
  activeEnv,
}: FolderMetaTabProps) {
  const taRef = useRef<TextareaRenderable | null>(null)

  const inEdit = editState.mode === "editing"
  const cursorHere = editState.cursor.field === "meta"
  const editingRow = inEdit && cursorHere ? editState.cursor.row : -1

  const nameActive = browseActive && cursorHere
  const nameEditing = editingRow === 0

  const handleNameChange = useCallback(() => {
    const ta = taRef.current
    if (ta) setEditValue(ta.plainText)
  }, [setEditValue])

  return (
    <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
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
            <textarea
              ref={taRef}
              initialValue={name}
              onContentChange={handleNameChange}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
              focused
            />
          </>
        ) : (
          <VarText
            text={`Name: ${name}`}
            env={activeEnv ?? null}
            baseColor={theme.text}
          />
        )}
      </box>
    </box>
  )
}
