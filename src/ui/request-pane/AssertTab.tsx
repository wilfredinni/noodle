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
  const rows = [...(request.assertions ?? []), null]

  return (
    <box style={{ flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}>
      {rows.map((assertion, index) => {
        const selected =
          editState.cursor.field === "assertions" &&
          editState.cursor.row === index
        const editing = selected && editState.mode === "editing"
        const backgroundColor = selected ? theme.backgroundElement : undefined
        const operator = editing ? editOperator : assertion?.operator
        const showExpected =
          operator !== undefined && assertionOperatorRequiresValue(operator)
        const activate = (subfield: FieldSubfield) => {
          if (!interactive || editing) {
            onSubfieldFocus?.(subfield)
            return
          }
          onActivateRow?.(index, subfield)
        }

        return (
          <box key={`assertion-${index}`} style={{ flexDirection: "column" }}>
            <box
              id={`assertions-${index}`}
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
              {!editing && assertion === null ? (
                <text fg={selected ? theme.primary : theme.textMuted}>
                  + Add assertion
                </text>
              ) : (
                <>
                  <box style={{ flexGrow: 5, flexShrink: 1, flexBasis: 0 }}>
                    <VarInput
                      value={editing ? editKey : (assertion?.expression ?? "")}
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
