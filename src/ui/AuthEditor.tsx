import { useState } from "react"
import type { Auth, Environment } from "../schema"
import type { EditState } from "./editMode"
import { Select, type SelectItem } from "./Select"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarInput } from "./VarInput"

const AUTH_TYPE_ITEMS: SelectItem[] = [
  { id: "none", label: "None" },
  { id: "inherit", label: "Inherit" },
  { id: "bearer", label: "Bearer Token" },
  { id: "basic", label: "Basic Auth" },
  { id: "api_key", label: "API Key" },
]

const PLACEMENT_ITEMS: SelectItem[] = [
  { id: "header", label: "Header" },
  { id: "query", label: "Query Params" },
]

interface FieldDef {
  row: number
  label: string
  field: string
  isSecret: boolean
  isPlacement?: boolean
}

interface AuthRows {
  type: string
  fieldDefs: FieldDef[]
}

function maskIfSecret(value: string, isSecret: boolean): string {
  if (!isSecret || value === "") return value
  return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
}

function getAuthRows(auth: Auth | undefined): AuthRows {
  if (!auth || auth.type === "none") {
    return { type: "none", fieldDefs: [] }
  }
  if (auth.type === "inherit") {
    return { type: "inherit", fieldDefs: [] }
  }
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      fieldDefs: [{ row: 1, label: "Token", field: "token", isSecret: true }],
    }
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      fieldDefs: [
        { row: 1, label: "Username", field: "user", isSecret: false },
        { row: 2, label: "Password", field: "pass", isSecret: true },
      ],
    }
  }
  return {
    type: "api_key",
    fieldDefs: [
      { row: 1, label: "Key", field: "key", isSecret: false },
      { row: 2, label: "Value", field: "value", isSecret: true },
      {
        row: 3,
        label: "Add To",
        field: "placement",
        isSecret: false,
        isPlacement: true,
      },
    ],
  }
}

function getFieldValue(auth: Auth, field: string): string {
  if (auth.type === "none") return ""
  if (auth.type === "inherit") return ""
  if (auth.type === "bearer") return auth.token
  if (auth.type === "basic") {
    if (field === "user") return auth.user
    if (field === "pass") return auth.pass
    return ""
  }
  if (auth.type === "api_key") {
    if (field === "key") return auth.key
    if (field === "value") return auth.value
    if (field === "placement") return auth.placement
    return ""
  }
  return ""
}

export interface AuthEditorProps {
  auth: Auth
  editState: EditState
  inEdit: boolean
  browseActive: boolean
  setEditValue: (v: string) => void
  theme: Theme
  activeEnv?: Environment | null
  onAuthTypeChange: (t: Auth["type"]) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onSelectOpenChange?: (open: boolean) => void
  idPrefix?: string
  showInherit?: boolean
}

export function AuthEditor({
  auth,
  editState,
  inEdit,
  browseActive,
  setEditValue,
  theme,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onSelectOpenChange,
  idPrefix = "auth",
  showInherit = false,
}: AuthEditorProps) {
  const [typeSelectOpen, setTypeSelectOpen] = useState(false)
  const [placementSelectOpen, setPlacementSelectOpen] = useState(false)

  const { type, fieldDefs } = getAuthRows(auth)
  const authItems = showInherit
    ? AUTH_TYPE_ITEMS
    : AUTH_TYPE_ITEMS.filter((item) => item.id !== "inherit")

  const isTypeSelectorActive =
    browseActive &&
    editState.cursor.field === "auth" &&
    editState.cursor.row === 0

  const handleTypeSelectOpen = (open: boolean) => {
    setTypeSelectOpen(open)
    onSelectOpenChange?.(open)
  }

  const handlePlacementSelectOpen = (open: boolean) => {
    setPlacementSelectOpen(open)
    onSelectOpenChange?.(open)
  }

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box
        id={`${idPrefix}-field`}
        style={{
          zIndex: typeSelectOpen ? 1 : undefined,
          backgroundColor: isTypeSelectorActive
            ? theme.backgroundElement
            : undefined,
        }}
      >
        <Select
          items={authItems}
          value={type}
          onChange={(id) => {
            if (id === type) return
            onAuthTypeChange(id as Auth["type"])
          }}
          focused={isTypeSelectorActive}
          badge={false}
          onOpenChange={handleTypeSelectOpen}
        />
      </box>

      {fieldDefs.map((def) => {
        const isActive =
          browseActive &&
          editState.cursor.field === "auth" &&
          editState.cursor.row === def.row
        const isEditingRow =
          inEdit &&
          editState.cursor.field === "auth" &&
          editState.cursor.row === def.row
        const fieldValue = getFieldValue(auth, def.field)
        const displayValue = def.isSecret
          ? maskIfSecret(fieldValue, true)
          : fieldValue

        return (
          <box
            key={def.field}
            style={{
              flexDirection: "column",
              zIndex: def.isPlacement && placementSelectOpen ? 1 : undefined,
            }}
          >
            <box
              id={`${idPrefix}-${def.field}`}
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={
                isActive || isEditingRow ? theme.primary : theme.borderSubtle
              }
              style={{
                flexDirection:
                  isEditingRow && !def.isPlacement ? "row" : undefined,
                gap: isEditingRow && !def.isPlacement ? 1 : undefined,
                backgroundColor: isActive ? theme.backgroundElement : undefined,
                paddingLeft: 1,
              }}
            >
              {isEditingRow && !def.isPlacement ? (
                <>
                  <text fg={theme.textMuted}>{def.label}: </text>
                  <VarInput
                    value={fieldValue}
                    env={activeEnv ?? null}
                    isEditing
                    useTextarea
                    onChange={setEditValue}
                  />
                </>
              ) : def.isPlacement ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{def.label}: </text>
                  <Select
                    items={PLACEMENT_ITEMS}
                    value={fieldValue || "header"}
                    onChange={(id) =>
                      onApiKeyPlacementChange(id as "header" | "query")
                    }
                    focused={isActive}
                    badge={false}
                    onOpenChange={handlePlacementSelectOpen}
                  />
                </box>
              ) : (
                <VarInput
                  value={`${def.label}: ${displayValue}`}
                  env={activeEnv ?? null}
                  isEditing={false}
                  baseColor={theme.text}
                />
              )}
            </box>
          </box>
        )
      })}
    </box>
  )
}
