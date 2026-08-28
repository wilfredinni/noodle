import type { Request, Environment } from "../../schema"
import { MouseButton } from "@opentui/core"
import { useState } from "react"
import type { EditState } from "../editMode"
import type { Theme } from "../theme"
import { VarInput } from "../VarInput"
import { Checkbox } from "../Checkbox"
import { LeftBar } from "../borders"
import { Select } from "../Select"
import { Badge } from "../Badge"

export function SettingsSection({
  request,
  editState,
  editValue,
  editError,
  setEditValue,
  inEdit,
  browseActive,
  theme,
  activeEnv,
  onActivateRow,
  onToggleRow,
  onTlsVerifyChange,
  onSelectOpenChange,
  collectionTlsVerify,
  insecure = false,
  interactive = true,
}: {
  request: Request
  editState: EditState
  editValue: string
  editError?: string | null
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
  onActivateRow?: (row: number) => void
  onToggleRow?: (row: number) => void
  onTlsVerifyChange?: (verify?: boolean) => void
  onSelectOpenChange?: (open: boolean) => void
  collectionTlsVerify?: boolean
  insecure?: boolean
  interactive?: boolean
}) {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const rows = [
    {
      label: "Timeout (ms)",
      value: request.timeout,
      display: `${request.timeout}ms`,
      desc: "Set maximum time to wait before aborting the request",
    },
    {
      label: "Follow Redirects",
      value: request.followRedirects ?? true,
      display: String(request.followRedirects ?? true),
      desc: "Automatically follow HTTP redirects",
    },
    {
      label: "Max Redirects",
      value: request.maxRedirects ?? 5,
      display: String(request.maxRedirects ?? 5),
      desc: "Maximum number of redirects to follow",
    },
    {
      label: "TLS Verification",
      value:
        request.tls?.verify === undefined
          ? "inherit"
          : request.tls.verify
            ? "verify"
            : "insecure",
      display:
        request.tls?.verify === undefined
          ? `Inherit (${collectionTlsVerify === false ? "do not verify" : "verify"})`
          : request.tls.verify
            ? "Verify"
            : "Do not verify",
      desc: insecure
        ? "Disabled for this session by --insecure"
        : "Verify the server certificate, or inherit the collection setting",
    },
    {
      label: "Send Cookies",
      value: request.sendCookies ?? true,
      display: String(request.sendCookies ?? true),
      desc: "Send cookies from the collection cookie jar",
    },
  ]
  const tagsActive =
    (inEdit || browseActive) &&
    editState.cursor.field === "settings" &&
    editState.cursor.row >= rows.length

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <box
        id="settings-tags"
        border={[...LeftBar.border]}
        customBorderChars={LeftBar.customBorderChars}
        borderColor={tagsActive ? theme.primary : theme.borderSubtle}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 1,
          width: "100%",
          minWidth: 0,
        }}
      >
        <text fg={theme.text} style={{ flexShrink: 0 }}>
          Tags:{" "}
        </text>
        <box
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 0,
            flexGrow: 1,
            minWidth: 0,
          }}
        >
          {[...(request.tags ?? []), null].map((tag, index) => {
            const row = rows.length + index
            const editing =
              inEdit &&
              editState.cursor.field === "settings" &&
              editState.cursor.row === row
            const active =
              browseActive &&
              editState.cursor.field === "settings" &&
              editState.cursor.row === row

            return (
              <box
                key={`tag-${index}`}
                id={`settings-${row}`}
                style={{
                  flexDirection: "column",
                  minHeight: 1,
                  marginRight: 1,
                }}
                onMouseDown={(event) => {
                  if (event.button !== MouseButton.LEFT || !interactive) return
                  onActivateRow?.(row)
                  event.stopPropagation()
                }}
              >
                {editing ? (
                  <VarInput
                    value={editValue}
                    placeholder="Tag"
                    env={null}
                    isEditing
                    isFocused
                    onChange={setEditValue}
                    baseColor={theme.primary}
                    backgroundColor={theme.backgroundElement}
                    paddingX={1}
                    stopMousePropagation
                  />
                ) : (
                  <Badge
                    bg={active ? theme.primary : theme.backgroundElement}
                    fg={active ? theme.backgroundPanel : theme.textMuted}
                  >
                    {tag ?? "+ Add tag"}
                  </Badge>
                )}
                {editing && editError ? (
                  <text fg={theme.error}> {editError}</text>
                ) : null}
              </box>
            )
          })}
        </box>
      </box>
      {rows.map((row, idx) => {
        const editingRow =
          inEdit &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx
        const isActive =
          browseActive &&
          editState.cursor.field === "settings" &&
          editState.cursor.row === idx
        const canHoverRow =
          !editingRow &&
          (idx === 1 || idx === 4
            ? onToggleRow !== undefined
            : onActivateRow !== undefined)

        return (
          <box key={row.label} style={{ flexDirection: "column" }}>
            <box
              id={idx === 0 ? "settings-field" : `settings-${idx}`}
              border={[...LeftBar.border]}
              customBorderChars={LeftBar.customBorderChars}
              borderColor={
                isActive || editingRow ? theme.primary : theme.borderSubtle
              }
              style={{
                flexDirection: editingRow ? "row" : undefined,
                gap: editingRow ? 1 : undefined,
                backgroundColor:
                  isActive || (canHoverRow && hoveredRow === idx)
                    ? theme.backgroundElement
                    : undefined,
              }}
              onMouseDown={
                !editingRow &&
                idx !== 1 &&
                idx !== 3 &&
                idx !== 4 &&
                onActivateRow
                  ? (event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onActivateRow(idx)
                      event.stopPropagation()
                    }
                  : undefined
              }
              onMouseOver={canHoverRow ? () => setHoveredRow(idx) : undefined}
              onMouseOut={canHoverRow ? () => setHoveredRow(null) : undefined}
            >
              {editingRow && idx !== 3 && idx !== 4 ? (
                <>
                  <text fg={theme.textMuted}>{row.label}: </text>
                  <VarInput
                    value={editValue}
                    env={activeEnv ?? null}
                    isEditing
                    useTextarea
                    onChange={setEditValue}
                  />
                </>
              ) : idx === 1 || idx === 4 ? (
                <box style={{ flexDirection: "row", gap: 1 }}>
                  <text fg={theme.text}>{row.label}: </text>
                  <box
                    onMouseDown={
                      onToggleRow
                        ? (event) => {
                            if (event.button !== MouseButton.LEFT) return
                            onToggleRow(idx)
                            event.stopPropagation()
                          }
                        : undefined
                    }
                  >
                    <Checkbox
                      checked={
                        idx === 1
                          ? (request.followRedirects ?? true)
                          : (request.sendCookies ?? true)
                      }
                      theme={theme}
                    />
                  </box>
                </box>
              ) : idx === 3 ? (
                <box style={{ flexDirection: "row", alignItems: "center" }}>
                  <text fg={theme.text}>{row.label}: </text>
                  <Select
                    items={[
                      {
                        id: "inherit",
                        label: `Inherit (${collectionTlsVerify === false ? "do not verify" : "verify"})`,
                      },
                      { id: "verify", label: "Verify" },
                      { id: "insecure", label: "Do not verify" },
                    ]}
                    value={String(row.value)}
                    fitContent
                    focused={isActive}
                    interactive={
                      interactive &&
                      onTlsVerifyChange !== undefined &&
                      onToggleRow !== undefined
                    }
                    onActivate={() => onToggleRow?.(idx)}
                    onOpenChange={onSelectOpenChange}
                    onChange={(value) =>
                      onTlsVerifyChange?.(
                        value === "inherit" ? undefined : value === "verify",
                      )
                    }
                  />
                </box>
              ) : (
                <VarInput
                  value={`${row.label}: ${row.display}`}
                  env={activeEnv ?? null}
                  isEditing={false}
                  baseColor={theme.text}
                />
              )}
            </box>
            <text fg={theme.textMuted}>{row.desc}</text>
          </box>
        )
      })}
    </box>
  )
}
