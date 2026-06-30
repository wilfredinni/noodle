import type { TextareaRenderable } from "@opentui/core"
import { useCallback, useRef, useState } from "react"
import type { Auth, Environment } from "../schema"
import type { EditState } from "./editMode"
import { Select, type SelectItem } from "./Select"
import type { Theme } from "./theme"
import { LeftBar } from "./borders"
import { VarText } from "./VarText"

const AUTH_TYPE_ITEMS: SelectItem[] = [
  { id: "none", label: "None" },
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
      { row: 2, label: "Value", field: "value", isSecret: false },
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
  return ((auth as Record<string, unknown>)[field] as string) ?? ""
}

export interface AuthEditorProps {
  request: { auth?: Auth }
  editState: EditState
  inEdit: boolean
  browseActive: boolean
  editValue: string
  setEditValue: (v: string) => void
  theme: Theme
  activeEnv?: Environment | null
  onAuthTypeChange: (t: "none" | "bearer" | "basic" | "api_key") => void
  onAuthFieldChange: (authType: string, field: string, value: string) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onSelectOpenChange?: (open: boolean) => void
}

export function AuthEditor({
  request,
  editState,
  inEdit,
  browseActive,
  setEditValue,
  theme,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onSelectOpenChange,
}: AuthEditorProps) {
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const [typeSelectOpen, setTypeSelectOpen] = useState(false)
  const [placementSelectOpen, setPlacementSelectOpen] = useState(false)

  const handleContentChange = useCallback(() => {
    const ta = textareaRef.current
    if (ta) setEditValue(ta.plainText)
  }, [setEditValue])

  const { type, fieldDefs } = getAuthRows(request.auth)

  const isTypeSelectorActive =
    browseActive &&
    editState.cursor.field === "auth" &&
    editState.cursor.row === 0

  const handleTypeSelectOpen = useCallback(
    (open: boolean) => {
      setTypeSelectOpen(open)
      onSelectOpenChange?.(open)
    },
    [onSelectOpenChange],
  )

  const handlePlacementSelectOpen = useCallback(
    (open: boolean) => {
      setPlacementSelectOpen(open)
      onSelectOpenChange?.(open)
    },
    [onSelectOpenChange],
  )

  const descFor = (field: string): string => {
    if (field === "token") return "(bearer token)"
    if (field === "user") return "(basic username)"
    if (field === "pass") return "(basic password)"
    if (field === "key") return "(api key name/custom header)"
    if (field === "value") return "(api key value)"
    if (field === "placement") return "(api key placement)"
    return ""
  }

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box
        style={{
          flexDirection: "column",
          zIndex: typeSelectOpen ? 1 : undefined,
        }}
      >
        <box
          id="auth-field"
          border={[...LeftBar.border]}
          customBorderChars={LeftBar.customBorderChars}
          borderColor={
            isTypeSelectorActive ? theme.primary : theme.borderSubtle
          }
          style={{
            zIndex: typeSelectOpen ? 1 : undefined,
            backgroundColor: isTypeSelectorActive
              ? theme.backgroundElement
              : undefined,
            paddingLeft: 1,
          }}
        >
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.text}>Type:</text>
            <Select
              items={AUTH_TYPE_ITEMS}
              value={type}
              onChange={(id) => {
                if (id === type) return
                onAuthTypeChange(id as "none" | "bearer" | "basic" | "api_key")
              }}
              focused={isTypeSelectorActive}
              badge={false}
              onOpenChange={handleTypeSelectOpen}
            />
          </box>
        </box>
        <text fg={theme.textMuted}>Authentication method</text>
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
        const fieldValue = request.auth
          ? getFieldValue(request.auth, def.field)
          : ""
        const displayValue = def.isSecret
          ? maskIfSecret(fieldValue, true)
          : fieldValue

        return (
          <box
            key={def.field}
            style={{
              flexDirection: "column",
              zIndex:
                def.isPlacement && placementSelectOpen ? 1 : undefined,
            }}
          >
            <box
              id={`auth-${def.field}`}
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
                  <textarea
                    ref={textareaRef}
                    initialValue={fieldValue}
                    onContentChange={handleContentChange}
                    backgroundColor={theme.backgroundPanel}
                    focusedBackgroundColor={theme.backgroundPanel}
                    textColor={theme.text}
                    cursorColor={theme.primary}
                    focused
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
                <VarText
                  text={`${def.label}: ${displayValue}`}
                  env={activeEnv ?? null}
                  baseColor={theme.text}
                />
              )}
            </box>
            <text fg={theme.textMuted}>{descFor(def.field)}</text>
          </box>
        )
      })}
    </box>
  )
}
