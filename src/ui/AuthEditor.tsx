import { useState } from "react"
import { MouseButton } from "@opentui/core"
import type { Auth, Environment } from "../schema"
import type { EditState } from "./editMode"
import { Select, type SelectItem } from "./Select"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarInput } from "./VarInput"
import { Checkbox } from "./Checkbox"
import { authFieldValue, getAuthRows } from "./authRows"

const AUTH_TYPE_ITEMS: SelectItem[] = [
  { id: "none", label: "None" },
  { id: "inherit", label: "Inherit" },
  { id: "bearer", label: "Bearer Token" },
  { id: "basic", label: "Basic Auth" },
  { id: "ntlm", label: "NTLMv2" },
  { id: "api_key", label: "API Key" },
  { id: "aws_sigv4", label: "AWS Signature v4" },
  { id: "oauth1", label: "OAuth 1.0a" },
  { id: "oauth2", label: "OAuth 2.0" },
]

function maskIfSecret(value: string, isSecret: boolean): string {
  if (!isSecret || value === "") return value
  return "••••••••"
}

export interface AuthEditorProps {
  auth: Auth
  editState: EditState
  inEdit: boolean
  browseActive: boolean
  editValue: string
  setEditValue: (v: string) => void
  theme: Theme
  activeEnv?: Environment | null
  onAuthTypeChange: (t: Auth["type"]) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onAuthFieldChange?: (
    authType: Auth["type"],
    field: string,
    value: string | boolean | number,
  ) => void
  onSelectOpenChange?: (open: boolean) => void
  onFocusRow?: (row: number) => void
  onActivateRow?: (row: number) => void
  idPrefix?: string
  showInherit?: boolean
  interactive?: boolean
}

export function AuthEditor({
  auth,
  editState,
  inEdit,
  browseActive,
  editValue,
  setEditValue,
  theme,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onAuthFieldChange,
  onSelectOpenChange,
  onFocusRow,
  onActivateRow,
  idPrefix = "auth",
  showInherit = false,
  interactive = true,
}: AuthEditorProps) {
  const [typeSelectOpen, setTypeSelectOpen] = useState(false)
  const [fieldSelectOpen, setFieldSelectOpen] = useState<string | null>(null)
  const [hoveredField, setHoveredField] = useState<string | null>(null)
  const fieldDefs = getAuthRows(auth)
  const authItems = showInherit
    ? AUTH_TYPE_ITEMS
    : AUTH_TYPE_ITEMS.filter((item) => item.id !== "inherit")
  const isTypeSelectorActive =
    browseActive &&
    editState.cursor.field === "auth" &&
    editState.cursor.row === 0

  const setSelectOpen = (field: string, open: boolean) => {
    setFieldSelectOpen(open ? field : null)
    onSelectOpenChange?.(open)
  }

  const changeField = (field: string, value: string | boolean | number) => {
    if (auth.type === "api_key" && field === "placement") {
      onApiKeyPlacementChange(value as "header" | "query")
    } else {
      onAuthFieldChange?.(auth.type, field, value)
    }
  }

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box
        id={`${idPrefix}-field`}
        style={{ zIndex: typeSelectOpen ? 1 : undefined }}
      >
        <Select
          items={authItems}
          value={auth.type}
          onChange={(id) => {
            if (id !== auth.type) onAuthTypeChange(id as Auth["type"])
          }}
          focused={isTypeSelectorActive}
          badge={false}
          onOpenChange={(open) => {
            setTypeSelectOpen(open)
            onSelectOpenChange?.(open)
          }}
          onActivate={() => onFocusRow?.(0)}
          interactive={interactive}
        />
      </box>

      {fieldDefs.map((definition) => {
        const isActive =
          browseActive &&
          editState.cursor.field === "auth" &&
          editState.cursor.row === definition.row
        const editable =
          definition.kind === "text" || definition.kind === "parameters"
        const isEditingRow =
          editable &&
          inEdit &&
          editState.cursor.field === "auth" &&
          editState.cursor.row === definition.row
        const fieldValue = authFieldValue(auth, definition.field)
        const displayValue = maskIfSecret(fieldValue, definition.isSecret)
        const displayLabel = `${definition.label}${definition.required ? "*" : ""}`
        const canHover =
          !isEditingRow &&
          definition.kind !== "select" &&
          onActivateRow !== undefined

        return (
          <box
            key={definition.field}
            id={`${idPrefix}-${definition.row}`}
            style={{
              flexDirection: "column",
              zIndex: fieldSelectOpen === definition.field ? 1 : undefined,
            }}
          >
            <box
              id={`${idPrefix}-${definition.field}`}
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={
                isActive || isEditingRow ? theme.primary : theme.borderSubtle
              }
              style={{
                flexDirection: isEditingRow ? "row" : undefined,
                gap: isEditingRow ? 1 : undefined,
                backgroundColor:
                  isActive || (canHover && hoveredField === definition.field)
                    ? theme.backgroundElement
                    : undefined,
                paddingLeft: 1,
              }}
              onMouseDown={
                definition.kind === "boolean" && interactive
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      changeField(definition.field, fieldValue !== "true")
                      onFocusRow?.(definition.row)
                      event.stopPropagation()
                    }
                  : canHover && onActivateRow
                    ? (event) => {
                        if (event.button !== MouseButton.LEFT) return
                        onActivateRow(definition.row)
                        event.stopPropagation()
                      }
                    : undefined
              }
              onMouseOver={
                canHover ? () => setHoveredField(definition.field) : undefined
              }
              onMouseOut={canHover ? () => setHoveredField(null) : undefined}
            >
              {isEditingRow ? (
                <>
                  <text fg={theme.textMuted}>{displayLabel}: </text>
                  <VarInput
                    value={editValue}
                    env={activeEnv ?? null}
                    isEditing
                    useTextarea
                    onChange={setEditValue}
                  />
                </>
              ) : definition.kind === "select" ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{displayLabel}: </text>
                  <Select
                    items={definition.items ?? []}
                    value={fieldValue}
                    width={22}
                    onChange={(value) => changeField(definition.field, value)}
                    focused={isActive}
                    badge={false}
                    onOpenChange={(open) =>
                      setSelectOpen(definition.field, open)
                    }
                    onActivate={() => onFocusRow?.(definition.row)}
                    interactive={interactive}
                  />
                </box>
              ) : definition.kind === "boolean" ? (
                <box style={{ flexDirection: "row" }}>
                  <Checkbox checked={fieldValue === "true"} theme={theme} />
                  <text fg={theme.text}>{displayLabel}</text>
                </box>
              ) : (
                <VarInput
                  value={`${displayLabel}: ${displayValue}`}
                  env={activeEnv ?? null}
                  isEditing={false}
                  baseColor={theme.text}
                />
              )}
            </box>
            {definition.description && (
              <text
                fg={theme.textMuted}
                wrapMode="word"
                style={{ paddingLeft: 1 }}
              >
                {definition.description}
              </text>
            )}
          </box>
        )
      })}
    </box>
  )
}
