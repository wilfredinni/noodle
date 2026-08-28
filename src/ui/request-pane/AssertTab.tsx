import { MouseButton } from "@opentui/core"
import { Fragment, useState } from "react"
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
import type { EditState, FieldSubfield } from "../editMode"
import { Select } from "../Select"
import { useTheme } from "../theme"
import { VarInput } from "../VarInput"

const OPERATOR_ITEMS = ASSERTION_OPERATORS.map((value) => ({
  id: value,
  label: value,
}))
const OPERATOR_WIDTH =
  Math.max(...ASSERTION_OPERATORS.map((operator) => operator.length)) + 4

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
  onActivateRow?: (
    row: number,
    addingRow: boolean,
    subfield?: FieldSubfield,
  ) => void
  onSubfieldFocus?: (subfield: FieldSubfield) => void
  onSelectOpenChange?: (open: boolean) => void
  interactive?: boolean
}

export function AssertTab({
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
  const suggestions = responseExpressionSuggestions(response)
  const assertions = request.assertions ?? []
  const [hoveredRow, setHoveredRow] = useState<number | "add" | null>(null)

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

  const rows = [
    ...assertions.map((assertion, index) => ({
      assertion,
      row: index,
      addingRow: false,
    })),
    { assertion: null, row: -1, addingRow: true },
  ]
  const cursorHere = editState.cursor.field === "assertions"
  const inEdit = editState.mode === "editing"

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.map(({ assertion, row, addingRow }, index) => {
        const selected =
          cursorHere &&
          editState.cursor.addingRow === addingRow &&
          (addingRow || editState.cursor.row === row)
        const editing = selected && inEdit
        const dimmed = inEdit && !editing
        const hoverKey = addingRow ? "add" : row
        const canHover = !editing && onActivateRow !== undefined
        const backgroundColor =
          selected || (canHover && hoveredRow === hoverKey)
            ? theme.backgroundElement
            : index % 2 !== 0
              ? stripeBg
              : undefined
        const operator = editing
          ? editOperator
          : (assertion?.operator ?? "equals")
        const showExpected = assertionOperatorRequiresValue(operator)
        const activate = (subfield: FieldSubfield) => {
          if (!interactive || editing) {
            onSubfieldFocus?.(subfield)
            return
          }
          onActivateRow?.(row, addingRow, subfield)
        }
        const expression = editing ? editKey : (assertion?.expression ?? "")
        const expected = editing
          ? editValue
          : assertion && Object.hasOwn(assertion, "value")
            ? typeof assertion.value === "string"
              ? assertion.value
              : JSON.stringify(assertion.value)
            : ""

        return (
          <Fragment key={addingRow ? "assertion-add" : `assertion-${row}`}>
            <box
              id={addingRow ? "assertions-add" : `assertions-${row}`}
              style={{
                flexDirection: "row",
                height: 1,
                minWidth: 0,
                backgroundColor,
              }}
              onMouseDown={
                !editing
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      activate("key")
                      event.stopPropagation()
                    }
                  : undefined
              }
              onMouseOver={canHover ? () => setHoveredRow(hoverKey) : undefined}
              onMouseOut={canHover ? () => setHoveredRow(null) : undefined}
            >
              <box
                onMouseDown={
                  !editing
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        activate("key")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}
              >
                <VarInput
                  value={expression}
                  placeholder="Response expression..."
                  env={activeEnv ?? null}
                  isEditing={editing}
                  isFocused={editState.cursor.subfield === "key"}
                  onChange={setEditKey}
                  onFocus={() => onSubfieldFocus?.("key")}
                  completionValues={suggestions}
                  baseColor={
                    dimmed || (addingRow && !selected)
                      ? theme.textMuted
                      : theme.primary
                  }
                  backgroundColor={
                    editing ? theme.backgroundElement : undefined
                  }
                  focusedBackgroundColor={theme.borderSubtle}
                  paddingX={1}
                  stopMousePropagation={editing}
                  style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                />
              </box>
              <box
                onMouseDown={
                  !editing
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        activate("operator")
                        event.stopPropagation()
                      }
                    : undefined
                }
                width={OPERATOR_WIDTH}
              >
                <Select
                  items={OPERATOR_ITEMS}
                  value={operator}
                  focused={editing && editState.cursor.subfield === "operator"}
                  visualFocused={
                    selected && editState.cursor.subfield === "operator"
                  }
                  onActivate={() => activate("operator")}
                  onChange={(value) =>
                    setEditOperator(value as AssertionOperator)
                  }
                  onOpenChange={onSelectOpenChange}
                  interactive={interactive && editing}
                  width={OPERATOR_WIDTH}
                />
              </box>
              <box
                onMouseDown={
                  !editing && showExpected
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        activate("value")
                        event.stopPropagation()
                      }
                    : undefined
                }
                style={{ flexGrow: 3, flexShrink: 1, flexBasis: 0 }}
              >
                {showExpected ? (
                  <VarInput
                    value={expected}
                    placeholder="Expected..."
                    env={activeEnv ?? null}
                    isEditing={editing}
                    isFocused={editState.cursor.subfield === "value"}
                    onChange={setEditValue}
                    onFocus={() => onSubfieldFocus?.("value")}
                    baseColor={
                      dimmed || (addingRow && !selected)
                        ? theme.textMuted
                        : theme.text
                    }
                    backgroundColor={
                      editing ? theme.backgroundElement : undefined
                    }
                    focusedBackgroundColor={theme.borderSubtle}
                    paddingX={1}
                    stopMousePropagation={editing}
                    style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
                  />
                ) : null}
              </box>
            </box>
            {editing && editError ? (
              <text fg={theme.error}> {editError}</text>
            ) : null}
          </Fragment>
        )
      })}
    </box>
  )
}
