import { useCallback, useRef } from "react"
import type { TextareaRenderable } from "@opentui/core"
import type { Environment } from "../schema"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarText } from "./VarText"

export interface FolderMetaTabProps {
  name: string
  seq: number | undefined
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
}

export function FolderMetaTab({
  name,
  seq,
  editState,
  editValue: _editValue,
  setEditValue,
  browseActive,
  theme,
  activeEnv,
}: FolderMetaTabProps) {
  const taRef0 = useRef<TextareaRenderable | null>(null)
  const taRef1 = useRef<TextareaRenderable | null>(null)

  const inEdit = editState.mode === "editing"
  const cursorHere = editState.cursor.field === "meta"
  const editingRow = inEdit && cursorHere ? editState.cursor.row : -1

  const cursorRow = editState.cursor.row

  const nameActive = browseActive && cursorHere && cursorRow === 0
  const seqActive = browseActive && cursorHere && cursorRow === 1
  const nameEditing = editingRow === 0
  const seqEditing = editingRow === 1

  const handleNameChange = useCallback(() => {
    const ta = taRef0.current
    if (ta) setEditValue(ta.plainText)
  }, [setEditValue])

  const handleSeqChange = useCallback(() => {
    const ta = taRef1.current
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
              ref={taRef0}
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

      <box
        border={[...LeftBar.border]}
        customBorderChars={LeftBar.customBorderChars}
        borderColor={
          seqActive || seqEditing ? theme.primary : theme.borderSubtle
        }
        style={{
          flexDirection: seqEditing ? "row" : undefined,
          gap: seqEditing ? 1 : undefined,
          backgroundColor: seqActive ? theme.backgroundElement : undefined,
          paddingLeft: 1,
        }}
      >
        {seqEditing ? (
          <>
            <text fg={theme.textMuted}>Seq: </text>
            <textarea
              ref={taRef1}
              initialValue={seq !== undefined ? String(seq) : ""}
              onContentChange={handleSeqChange}
              backgroundColor={theme.backgroundPanel}
              focusedBackgroundColor={theme.backgroundPanel}
              textColor={theme.text}
              cursorColor={theme.primary}
              focused
            />
          </>
        ) : (
          <VarText
            text={`Seq: ${seq !== undefined ? String(seq) : ""}`}
            env={activeEnv ?? null}
            baseColor={theme.text}
          />
        )}
      </box>
    </box>
  )
}
