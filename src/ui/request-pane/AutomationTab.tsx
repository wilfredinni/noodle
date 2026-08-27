import { MouseButton } from "@opentui/core"
import type {
  AssertionOperator,
  Environment,
  Request,
  Response,
} from "../../schema"
import {
  ASSERTION_OPERATORS,
  assertionOperatorRequiresValue,
} from "../../assertions"
import { responseExpressionSuggestions } from "../../response"
import { automationRows, type AutomationRow } from "../automationRows"
import type { EditState, FieldSubfield } from "../editMode"
import { Select } from "../Select"
import { useTheme } from "../theme"
import { VarInput } from "../VarInput"

interface Props {
  request: Request
  response?: Response
  editState: EditState
  editKey: string
  editValue: string
  editOperator: AssertionOperator
  editError: string | null
  setEditKey: (value: string) => void
  setEditValue: (value: string) => void
  setEditOperator: (operator: AssertionOperator) => void
  activeEnv?: Environment | null
  onActivateRow?: (row: number, subfield?: FieldSubfield) => void
  onSubfieldFocus?: (subfield: FieldSubfield) => void
  onSelectOpenChange?: (open: boolean) => void
  interactive?: boolean
}

function isAddRow(row: AutomationRow): boolean {
  return (
    row.kind === "add-tag" ||
    row.kind === "add-capture" ||
    row.kind === "add-assertion"
  )
}

function rowLabel(row: AutomationRow): string {
  if (row.kind === "add-tag") return "+ Add tag"
  if (row.kind === "add-capture") return "+ Add capture"
  if (row.kind === "add-assertion") return "+ Add assertion"
  return ""
}

export function AutomationTab({
  request,
  response,
  editState,
  editKey,
  editValue,
  editOperator,
  editError,
  setEditKey,
  setEditValue,
  setEditOperator,
  activeEnv,
  onActivateRow,
  onSubfieldFocus,
  onSelectOpenChange,
  interactive = true,
}: Props) {
  const theme = useTheme()
  const rows = automationRows(request)
  const suggestions = responseExpressionSuggestions(response)

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.map((row, index) => {
        const previous = rows[index - 1]
        const heading =
          index === 0
            ? "Tags"
            : previous?.kind === "add-tag"
              ? "Captures"
              : previous?.kind === "add-capture"
                ? "Assertions"
                : null
        const selected =
          editState.cursor.field === "automation" &&
          editState.cursor.row === index
        const editing = selected && editState.mode === "editing"
        const backgroundColor = selected ? theme.backgroundElement : undefined
        const activate = (subfield?: FieldSubfield) => {
          if (!interactive || editing) {
            if (subfield) onSubfieldFocus?.(subfield)
            return
          }
          const editingRow = rows[editState.cursor.row]
          const activationRow =
            editState.mode === "editing" &&
            editState.cursor.field === "automation" &&
            editingRow !== undefined &&
            isAddRow(editingRow) &&
            index > editState.cursor.row
              ? index + 1
              : index
          onActivateRow?.(activationRow, subfield)
        }
        const key =
          row.kind === "tag"
            ? row.value
            : row.kind === "capture"
              ? row.variable
              : row.kind === "assertion"
                ? row.assertion.expression
                : ""
        const expression = row.kind === "capture" ? row.expression : ""
        const assertion = row.kind === "assertion" ? row.assertion : undefined
        const operator = editing ? editOperator : assertion?.operator
        const showExpected =
          operator !== undefined && assertionOperatorRequiresValue(operator)

        return (
          <box key={`${row.kind}-${index}`} style={{ flexDirection: "column" }}>
            {heading ? (
              <text fg={theme.textMuted} attributes={1}>
                {heading}
              </text>
            ) : null}
            <box
              id={`automation-${index}`}
              style={{
                flexDirection: "row",
                minHeight: 1,
                minWidth: 0,
                backgroundColor,
              }}
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                activate("key")
                event.stopPropagation()
              }}
            >
              {!editing && isAddRow(row) ? (
                <text fg={selected ? theme.primary : theme.textMuted}>
                  {rowLabel(row)}
                </text>
              ) : row.kind === "tag" || row.kind === "add-tag" ? (
                <VarInput
                  value={editing ? editKey : key}
                  placeholder="Tag"
                  env={activeEnv ?? null}
                  isEditing={editing}
                  isFocused={editState.cursor.subfield !== "value"}
                  onChange={setEditKey}
                  onFocus={() => onSubfieldFocus?.("key")}
                  baseColor={theme.primary}
                  backgroundColor={backgroundColor}
                  paddingX={1}
                  stopMousePropagation={editing}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                />
              ) : row.kind === "capture" || row.kind === "add-capture" ? (
                <>
                  <box
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      activate("key")
                      event.stopPropagation()
                    }}
                    style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
                  >
                    <VarInput
                      value={editing ? editKey : key}
                      placeholder="Variable"
                      env={activeEnv ?? null}
                      isEditing={editing}
                      isFocused={editState.cursor.subfield === "key"}
                      onChange={setEditKey}
                      onFocus={() => onSubfieldFocus?.("key")}
                      baseColor={theme.primary}
                      backgroundColor={backgroundColor}
                      paddingX={1}
                      stopMousePropagation={editing}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                  <text fg={theme.textMuted}>←</text>
                  <box
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      activate("value")
                      event.stopPropagation()
                    }}
                    style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}
                  >
                    <VarInput
                      value={editing ? editValue : expression}
                      placeholder="Response expression"
                      env={activeEnv ?? null}
                      isEditing={editing}
                      isFocused={editState.cursor.subfield === "value"}
                      onChange={setEditValue}
                      onFocus={() => onSubfieldFocus?.("value")}
                      completionValues={suggestions}
                      backgroundColor={backgroundColor}
                      paddingX={1}
                      stopMousePropagation={editing}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                </>
              ) : (
                <>
                  <box
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      activate("key")
                      event.stopPropagation()
                    }}
                    style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}
                  >
                    <VarInput
                      value={editing ? editKey : key}
                      placeholder="Response expression"
                      env={activeEnv ?? null}
                      isEditing={editing}
                      isFocused={editState.cursor.subfield === "key"}
                      onChange={setEditKey}
                      onFocus={() => onSubfieldFocus?.("key")}
                      completionValues={suggestions}
                      backgroundColor={backgroundColor}
                      paddingX={1}
                      stopMousePropagation={editing}
                      style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                    />
                  </box>
                  <Select
                    items={ASSERTION_OPERATORS.map((value) => ({
                      id: value,
                      label: value,
                    }))}
                    value={operator}
                    focused={
                      editing && editState.cursor.subfield === "operator"
                    }
                    visualFocused={
                      selected && editState.cursor.subfield === "operator"
                    }
                    onActivate={() => activate("operator")}
                    onChange={(value) =>
                      setEditOperator(value as AssertionOperator)
                    }
                    onOpenChange={onSelectOpenChange}
                    interactive={interactive && editing}
                    fitContent
                  />
                  {showExpected ? (
                    <box
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        activate("value")
                        event.stopPropagation()
                      }}
                      style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
                    >
                      <VarInput
                        value={
                          editing
                            ? editValue
                            : assertion && Object.hasOwn(assertion, "value")
                              ? typeof assertion.value === "string"
                                ? assertion.value
                                : JSON.stringify(assertion.value)
                              : ""
                        }
                        placeholder="Expected"
                        env={activeEnv ?? null}
                        isEditing={editing}
                        isFocused={editState.cursor.subfield === "value"}
                        onChange={setEditValue}
                        onFocus={() => onSubfieldFocus?.("value")}
                        backgroundColor={backgroundColor}
                        paddingX={1}
                        stopMousePropagation={editing}
                        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                      />
                    </box>
                  ) : null}
                </>
              )}
            </box>
            {editing && editError ? (
              <text fg={theme.error}> {editError}</text>
            ) : null}
          </box>
        )
      })}
    </box>
  )
}
