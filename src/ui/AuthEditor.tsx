import { useState } from "react"
import { MouseButton } from "@opentui/core"
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
  { id: "aws_sigv4", label: "AWS Signature v4" },
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
  description?: string
  required?: boolean
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
  if (auth.type === "aws_sigv4") {
    return {
      type: "aws_sigv4",
      fieldDefs: [
        {
          row: 1,
          label: "Access Key",
          field: "access_key",
          isSecret: false,
          required: true,
          description: "AWS access key ID used to identify the signer.",
        },
        {
          row: 2,
          label: "Secret Key",
          field: "secret_key",
          isSecret: true,
          required: true,
          description: "AWS secret access key used to derive the signature.",
        },
        {
          row: 3,
          label: "Region",
          field: "region",
          isSecret: false,
          required: true,
          description: "AWS region where the service request is sent.",
        },
        {
          row: 4,
          label: "Service",
          field: "service",
          isSecret: false,
          required: true,
          description: "AWS service name, such as execute-api or s3.",
        },
        {
          row: 5,
          label: "Session Token",
          field: "session_token",
          isSecret: true,
          description: "Optional token for temporary AWS credentials.",
        },
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
  if (auth.type === "aws_sigv4") {
    if (field === "access_key") return auth.access_key
    if (field === "secret_key") return auth.secret_key
    if (field === "region") return auth.region
    if (field === "service") return auth.service
    if (field === "session_token") return auth.session_token ?? ""
  }
  return ""
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
  onSelectOpenChange,
  onFocusRow,
  onActivateRow,
  idPrefix = "auth",
  showInherit = false,
  interactive = true,
}: AuthEditorProps) {
  const [typeSelectOpen, setTypeSelectOpen] = useState(false)
  const [placementSelectOpen, setPlacementSelectOpen] = useState(false)
  const [hoveredField, setHoveredField] = useState<string | null>(null)

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
          onActivate={() => onFocusRow?.(0)}
          interactive={interactive}
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
        const canHoverField =
          !isEditingRow && !def.isPlacement && onActivateRow !== undefined
        const displayValue = def.isSecret
          ? maskIfSecret(fieldValue, true)
          : fieldValue
        const displayLabel = `${def.label}${def.required ? "*" : ""}`

        return (
          <box
            key={def.field}
            id={`${idPrefix}-${def.row}`}
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
                backgroundColor:
                  isActive || (canHoverField && hoveredField === def.field)
                    ? theme.backgroundElement
                    : undefined,
                paddingLeft: 1,
              }}
              onMouseDown={
                !isEditingRow && !def.isPlacement && onActivateRow
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onActivateRow(def.row)
                      event.stopPropagation()
                    }
                  : undefined
              }
              onMouseOver={
                canHoverField ? () => setHoveredField(def.field) : undefined
              }
              onMouseOut={
                canHoverField ? () => setHoveredField(null) : undefined
              }
            >
              {isEditingRow && !def.isPlacement ? (
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
              ) : def.isPlacement ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{displayLabel}: </text>
                  <Select
                    items={PLACEMENT_ITEMS}
                    value={fieldValue || "header"}
                    width={16}
                    onChange={(id) =>
                      onApiKeyPlacementChange(id as "header" | "query")
                    }
                    focused={isActive}
                    badge={false}
                    onOpenChange={handlePlacementSelectOpen}
                    onActivate={() => onFocusRow?.(def.row)}
                    interactive={interactive}
                  />
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
            {def.description && (
              <text
                fg={theme.textMuted}
                wrapMode="word"
                style={{ paddingLeft: 1 }}
              >
                {def.description}
              </text>
            )}
          </box>
        )
      })}
    </box>
  )
}
