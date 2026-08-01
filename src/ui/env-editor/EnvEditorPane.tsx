import type { Environment } from "../../schema"
import type { EnvDraft, EnvEditState } from "../../hooks/useEnvironmentEditor"
import { useTheme } from "../theme"
import { FullBorder } from "../borders"
import { Checkbox } from "../Checkbox"
import { VarInput } from "../VarInput"
import { MouseButton, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, useState } from "react"
import { Frame } from "../Frame"
import { Badge } from "../Badge"
import { JumpBadge, JUMP_BADGE_TOP_INDENT } from "../JumpBadge"

export function EnvEditorPane({
  draft,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  saving,
  error,
  focused: _focused,
  jumpMode = false,
  onPaneFocus,
  onActivateRow,
  onToggleRow,
}: {
  draft: EnvDraft | null
  editState: EnvEditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  saving: boolean
  error: string | null
  focused: boolean
  jumpMode?: boolean
  onPaneFocus?: () => void
  onActivateRow?: (
    row: number,
    addingRow: boolean,
    subfield?: "key" | "value",
  ) => void
  onToggleRow?: (row: number) => void
}) {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | "add" | null>(null)

  const inEdit = editState?.mode === "editing"
  const inBrowse = editState?.mode === "browsing"
  const editingRow = inEdit && !editState.addingRow ? editState.editingRow : -1
  const editingAdd = inEdit && editState.addingRow

  const targetRowId = editState
    ? editState.addingRow
      ? "vrow-add"
      : editingRow >= 0
        ? `vrow-${editingRow}`
        : inBrowse && editState.row >= 0
          ? `vrow-${editState.row}`
          : null
    : null

  useEffect(() => {
    if (targetRowId) {
      scrollRef.current?.scrollChildIntoView(targetRowId)
    }
  }, [targetRowId])

  if (!draft) {
    return (
      <Frame
        style={{
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
          padding: 1,
          backgroundColor: theme.backgroundPanel,
        }}
        border={[...FullBorder.border]}
        customBorderChars={FullBorder.customBorderChars}
        borderColor={theme.borderSubtle}
        titleRight={
          jumpMode ? undefined : (
            <Badge bg={theme.backgroundPanel} fg={theme.textMuted}>
              Variables
            </Badge>
          )
        }
        onPaneFocus={onPaneFocus}
      >
        {jumpMode && <JumpBadge letter="v" style={JUMP_BADGE_TOP_INDENT} />}
        <text fg={theme.textMuted}>Select an environment to edit</text>
      </Frame>
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
  const variableNames = rows
    .filter((row) => row.enabled && row.key !== "")
    .map((row) => row.key)
  const draftEnv: Environment = {
    name: draft.name,
    vars: Object.fromEntries(
      rows
        .filter((row) => row.enabled && row.key !== "")
        .map((row) => [row.key, row.value]),
    ),
  }

  return (
    <Frame
      style={{
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        padding: 1,
        gap: 1,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={_focused ? theme.primary : theme.borderSubtle}
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={_focused ? theme.primary : theme.textMuted}
          >
            Variables
          </Badge>
        )
      }
      onPaneFocus={onPaneFocus}
    >
      {jumpMode && <JumpBadge letter="v" style={JUMP_BADGE_TOP_INDENT} />}
      <scrollbox
        ref={scrollRef}
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
          const canHoverRow =
            !isEditingThisRow &&
            (onActivateRow !== undefined || onToggleRow !== undefined)
          const canActivateRow =
            !isEditingThisRow && onActivateRow !== undefined

          const keyBaseColor = dimmed ? theme.textMuted : theme.primary
          const valueBaseColor = dimmed ? theme.textMuted : theme.text
          const rowBg =
            cursorOnThisRow || isEditingThisRow
              ? theme.backgroundElement
              : canHoverRow && hoveredRow === i
                ? theme.backgroundElement
                : i % 2 !== 0
                  ? stripeBg
                  : undefined

          return (
            <box
              key={row.id}
              id={`vrow-${i}`}
              style={{
                flexDirection: "row",
                gap: 0,
                backgroundColor: rowBg,
              }}
              onMouseDown={
                canActivateRow
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onActivateRow?.(i, false)
                      event.stopPropagation()
                    }
                  : undefined
              }
              onMouseOver={canHoverRow ? () => setHoveredRow(i) : undefined}
              onMouseOut={canHoverRow ? () => setHoveredRow(null) : undefined}
            >
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
                <Checkbox checked={row.enabled} theme={theme} />
              </box>
              <box
                onMouseDown={
                  canActivateRow
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(i, false, "key")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 4, flexShrink: 1, flexBasis: 0 }}
              >
                <VarInput
                  value={isEditingThisRow ? editKey : row.key}
                  placeholder="Key..."
                  env={draftEnv}
                  isEditing={isEditingThisRow}
                  onChange={setEditKey}
                  isFocused={isEditingThisRow && editState.subfield === "key"}
                  baseColor={keyBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  variableNames={variableNames}
                />
              </box>
              <box
                onMouseDown={
                  canActivateRow
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(i, false, "value")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 6, flexShrink: 1, flexBasis: 0 }}
              >
                <VarInput
                  value={isEditingThisRow ? editValue : row.value}
                  placeholder="Value..."
                  env={draftEnv}
                  isEditing={isEditingThisRow}
                  onChange={setEditValue}
                  isFocused={isEditingThisRow && editState.subfield === "value"}
                  baseColor={valueBaseColor}
                  backgroundColor={
                    isEditingThisRow ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  variableNames={variableNames}
                />
              </box>
            </box>
          )
        })}
        {(() => {
          const addRowBg =
            (inBrowse && editState.addingRow) || editingAdd
              ? theme.backgroundElement
              : hoveredRow === "add" && onActivateRow
                ? theme.backgroundElement
                : rows.length % 2 !== 0
                  ? stripeBg
                  : undefined

          return (
            <box
              key="add"
              id="vrow-add"
              style={{
                flexDirection: "row",
                gap: 0,
                backgroundColor: addRowBg,
              }}
              onMouseDown={
                !editingAdd && onActivateRow
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onActivateRow(-1, true)
                      event.stopPropagation()
                    }
                  : undefined
              }
              onMouseOver={
                !editingAdd && onActivateRow
                  ? () => setHoveredRow("add")
                  : undefined
              }
              onMouseOut={
                !editingAdd && onActivateRow
                  ? () => setHoveredRow(null)
                  : undefined
              }
            >
              <Checkbox checked={false} theme={theme} />
              <box
                onMouseDown={
                  onActivateRow && !editingAdd
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(-1, true, "key")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 4, flexShrink: 1, flexBasis: 0 }}
              >
                <VarInput
                  value={editingAdd ? editKey : ""}
                  placeholder="Key..."
                  env={draftEnv}
                  isEditing={editingAdd}
                  onChange={setEditKey}
                  isFocused={editingAdd && editState.subfield === "key"}
                  baseColor={
                    editingAdd || (inBrowse && editState.addingRow)
                      ? theme.primary
                      : theme.textMuted
                  }
                  backgroundColor={
                    editingAdd ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  variableNames={variableNames}
                />
              </box>
              <box
                onMouseDown={
                  onActivateRow && !editingAdd
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(-1, true, "value")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 6, flexShrink: 1, flexBasis: 0 }}
              >
                <VarInput
                  value={editingAdd ? editValue : ""}
                  placeholder="Value..."
                  env={draftEnv}
                  isEditing={editingAdd}
                  onChange={setEditValue}
                  isFocused={editingAdd && editState.subfield === "value"}
                  baseColor={
                    editingAdd || (inBrowse && editState.addingRow)
                      ? theme.text
                      : theme.textMuted
                  }
                  backgroundColor={
                    editingAdd ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  variableNames={variableNames}
                />
              </box>
            </box>
          )
        })()}
      </scrollbox>
      {error && <text fg={theme.error}>Error: {error}</text>}
      {saving && <text fg={theme.info}>Saving...</text>}
    </Frame>
  )
}
