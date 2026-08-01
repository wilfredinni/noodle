import type { KvEntry, Environment } from "../schema"
import { MouseButton } from "@opentui/core"
import { useState } from "react"
import type { EditState } from "./editMode"
import type { Theme } from "./theme"
import { Checkbox } from "./Checkbox"
import { VarInput } from "./VarInput"

export interface KeyValueSectionProps {
  kind: "headers" | "params" | "pathParams"
  entries: Array<{ key: string; value: KvEntry }>
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  theme: Theme
  activeEnv?: Environment | null
  onActivateRow?: (row: number, addingRow: boolean) => void
  onToggleRow?: (row: number) => void
}

export function KeyValueSection({
  kind,
  entries,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  theme,
  activeEnv,
  onActivateRow,
  onToggleRow,
}: KeyValueSectionProps) {
  const rows = entries
  const [hoveredRow, setHoveredRow] = useState<number | "add" | null>(null)

  const panelNum = parseInt(theme.backgroundPanel.slice(1), 16)
  const prefix = kind === "headers" ? "hdr" : kind === "params" ? "prm" : "ppr"
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
  const cursorHere = editState.cursor.field === kind
  const editingRow =
    inEdit && cursorHere && !editState.cursor.addingRow
      ? editState.cursor.row
      : -1
  const editingAdd = inEdit && cursorHere && editState.cursor.addingRow

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.length === 0 && kind === "pathParams" ? (
        <VarInput
          value="URL has no :path tokens"
          placeholder=""
          env={null}
          isEditing={false}
          baseColor={theme.textMuted}
          paddingX={1}
        />
      ) : rows.length === 0 && editState.mode === "inactive" ? (
        <box
          id={`${prefix}-add`}
          style={{
            flexDirection: "row",
            gap: 0,
            backgroundColor:
              hoveredRow === "add" && onActivateRow
                ? theme.backgroundElement
                : undefined,
          }}
          onMouseDown={
            onActivateRow
              ? (event) => {
                  if (event.button !== MouseButton.LEFT) return
                  onActivateRow(-1, true)
                  event.stopPropagation()
                }
              : undefined
          }
          onMouseOver={onActivateRow ? () => setHoveredRow("add") : undefined}
          onMouseOut={onActivateRow ? () => setHoveredRow(null) : undefined}
        >
          <Checkbox checked={false} theme={theme} />
          <VarInput
            value=""
            placeholder="Key..."
            env={activeEnv ?? null}
            isEditing={false}
            baseColor={theme.textMuted}
            paddingX={1}
            style={{ flexGrow: 4, flexShrink: 1, flexBasis: 0 }}
          />
          <VarInput
            value=""
            placeholder="Value..."
            env={activeEnv ?? null}
            isEditing={false}
            baseColor={theme.textMuted}
            paddingX={1}
            style={{ flexGrow: 6, flexShrink: 1, flexBasis: 0 }}
          />
        </box>
      ) : (
        <>
          {rows.map((entry, i) => {
            const kv = entry.value
            const isEditingThisRow = editingRow === i
            const cursorOnThisRow =
              editState.mode === "browsing" &&
              cursorHere &&
              !editState.cursor.addingRow &&
              editState.cursor.row === i
            const dimmed = (inEdit && !isEditingThisRow) || !kv.enabled
            const canHoverRow =
              !isEditingThisRow &&
              (onActivateRow !== undefined ||
                (kind !== "pathParams" && onToggleRow !== undefined))

            const keyBaseColor = dimmed ? theme.textMuted : theme.primary
            const valueBaseColor = dimmed ? theme.textMuted : theme.text
            const rowBg =
              cursorOnThisRow ||
              isEditingThisRow ||
              (canHoverRow && hoveredRow === i)
                ? theme.backgroundElement
                : i % 2 !== 0
                  ? stripeBg
                  : undefined

            return (
              <box
                key={i}
                id={`${prefix}-${i}`}
                style={{
                  flexDirection: "row",
                  gap: 0,
                  backgroundColor: rowBg,
                }}
                onMouseDown={
                  !isEditingThisRow && onActivateRow
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(i, false)
                        event.stopPropagation()
                      }
                    : undefined
                }
                onMouseOver={canHoverRow ? () => setHoveredRow(i) : undefined}
                onMouseOut={canHoverRow ? () => setHoveredRow(null) : undefined}
              >
                {kind !== "pathParams" ? (
                  <box
                    onMouseDown={
                      onToggleRow
                        ? (event) => {
                            if (event.button !== MouseButton.LEFT) return
                            onToggleRow(i)
                            event.stopPropagation()
                          }
                        : undefined
                    }
                  >
                    <Checkbox checked={kv.enabled} theme={theme} />
                  </box>
                ) : null}
                <VarInput
                  value={isEditingThisRow ? editKey : entry.key}
                  placeholder="Key..."
                  env={activeEnv ?? null}
                  isEditing={kind !== "pathParams" && isEditingThisRow}
                  onChange={setEditKey}
                  isFocused={editState.cursor.subfield === "key"}
                  baseColor={keyBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  stopMousePropagation={isEditingThisRow}
                  style={{ flexGrow: 4, flexShrink: 1, flexBasis: 0 }}
                />
                <VarInput
                  value={isEditingThisRow ? editValue : kv.value}
                  placeholder="Value..."
                  env={activeEnv ?? null}
                  isEditing={isEditingThisRow}
                  onChange={setEditValue}
                  isFocused={editState.cursor.subfield === "value"}
                  baseColor={valueBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  stopMousePropagation={isEditingThisRow}
                  style={{ flexGrow: 6, flexShrink: 1, flexBasis: 0 }}
                />
              </box>
            )
          })}
          {kind !== "pathParams"
            ? (() => {
                const addRowBg =
                  cursorHere && editState.cursor.addingRow
                    ? theme.backgroundElement
                    : hoveredRow === "add" && onActivateRow
                      ? theme.backgroundElement
                      : rows.length % 2 !== 0
                        ? stripeBg
                        : undefined

                return (
                  <box
                    id={`${prefix}-add`}
                    style={{
                      flexDirection: "row",
                      gap: 0,
                      backgroundColor: addRowBg,
                    }}
                    onMouseDown={
                      onActivateRow && !editingAdd
                        ? (event) => {
                            if (event.button !== MouseButton.LEFT) return
                            onActivateRow(-1, true)
                            event.stopPropagation()
                          }
                        : undefined
                    }
                    onMouseOver={
                      onActivateRow && !editingAdd
                        ? () => setHoveredRow("add")
                        : undefined
                    }
                    onMouseOut={
                      onActivateRow && !editingAdd
                        ? () => setHoveredRow(null)
                        : undefined
                    }
                  >
                    <Checkbox checked={false} theme={theme} />
                    <VarInput
                      value={editingAdd ? editKey : ""}
                      placeholder="Key..."
                      env={activeEnv ?? null}
                      isEditing={editingAdd}
                      onChange={setEditKey}
                      isFocused={editState.cursor.subfield === "key"}
                      baseColor={
                        editingAdd || (cursorHere && editState.cursor.addingRow)
                          ? theme.primary
                          : theme.textMuted
                      }
                      backgroundColor={
                        editingAdd ? theme.backgroundElement : undefined
                      }
                      focusedBackgroundColor={theme.borderSubtle}
                      paddingX={1}
                      stopMousePropagation={editingAdd}
                      style={{ flexGrow: 4, flexShrink: 1, flexBasis: 0 }}
                    />
                    <VarInput
                      value={editingAdd ? editValue : ""}
                      placeholder="Value..."
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
                      paddingX={1}
                      stopMousePropagation={editingAdd}
                      style={{ flexGrow: 6, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                )
              })()
            : null}
        </>
      )}
    </box>
  )
}
