import type {
  ScrollBoxRenderable,
  TextareaRenderable,
  LineNumberRenderable,
} from "@opentui/core"
import { useEffect, useMemo, useRef } from "react"
import type { Request, Environment } from "../schema"
import { formatBody, formatAuth } from "./formatRequest"
import type { EditState, FieldKind } from "./editMode"

import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import type { Theme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { useJsonHighlight } from "./useJsonHighlight"
import { JsonBodyViewer } from "./JsonBodyViewer"
import { VarText } from "./VarText"
import { KeyValueSection } from "./KeyValueSection"

interface Props {
  request: Request | null
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  focused?: boolean
  activeTab: FieldKind
  activeEnv?: Environment | null
}

const BASE_TAB_DEFS: TabDef[] = [
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
]

export function RequestPane({
  request,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  focused = false,
  activeTab,
  activeEnv,
}: Props) {
  const theme = useTheme()
  const title = "Request"
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useEffect(() => {
    if (editState.mode !== "browsing") return
    const { field, row, addingRow } = editState.cursor
    if (field === "headers" || field === "params") {
      const prefix = field === "headers" ? "hdr" : "prm"
      scrollRef.current?.scrollChildIntoView(
        addingRow ? `${prefix}-add` : `${prefix}-${row}`,
      )
    } else {
      scrollRef.current?.scrollChildIntoView(`${field}-field`)
    }
  }, [editState.cursor])

  const tabs = useMemo(() => {
    if (!request) return BASE_TAB_DEFS
    const headerActive = Object.values(request.headers).some((e) => e.enabled)
    const paramActive = Object.values(request.params).some((e) => e.enabled)
    const hasBody = request.body !== undefined && request.body !== ""
    const hasAuth =
      request.auth?.type !== undefined && request.auth.type !== "none"
    return BASE_TAB_DEFS.map((tab) => {
      if (tab.id === "headers") {
        return {
          ...tab,
          label: headerActive ? "Headers \u2022" : "Headers",
        }
      }
      if (tab.id === "params") {
        return {
          ...tab,
          label: paramActive ? "Params \u2022" : "Params",
        }
      }
      if (tab.id === "body") {
        return { ...tab, label: hasBody ? "Body \u2022" : "Body" }
      }
      if (tab.id === "auth") {
        return { ...tab, label: hasAuth ? "Auth \u2022" : "Auth" }
      }
      return tab
    })
  }, [request])

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        paddingTop: 0,
        paddingBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        flexBasis: 0,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={focused ? theme.primary : theme.borderSubtle}
      title={title}
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      {request ? (
        <>
          <Tabs tabs={tabs} activeId={activeTab}>
            <scrollbox
              ref={scrollRef}
              scrollY
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
              {activeTab === "headers" && (
                <KeyValueSection
                  kind="headers"
                  request={request}
                  editState={editState}
                  editKey={editKey}
                  editValue={editValue}
                  setEditKey={setEditKey}
                  setEditValue={setEditValue}
                  browseActive={browseActive}
                  theme={theme}
                  activeEnv={activeEnv}
                />
              )}
              {activeTab === "params" && (
                <KeyValueSection
                  kind="params"
                  request={request}
                  editState={editState}
                  editKey={editKey}
                  editValue={editValue}
                  setEditKey={setEditKey}
                  setEditValue={setEditValue}
                  browseActive={browseActive}
                  theme={theme}
                  activeEnv={activeEnv}
                />
              )}
              {activeTab === "body" && (
                <BodySection
                  request={request}
                  editState={editState}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
                  browseActive={browseActive}
                  theme={theme}
                  activeEnv={activeEnv}
                />
              )}
              {activeTab === "auth" && (
                <AuthSection
                  request={request}
                  editState={editState}
                  theme={theme}
                  activeEnv={activeEnv}
                />
              )}
            </scrollbox>
          </Tabs>
        </>
      ) : (
        <text fg={theme.textMuted}>(no request selected)</text>
      )}
    </box>
  )
}

function BodySection({
  request,
  editState,
  editValue,
  setEditValue,
  inEdit,
  browseActive: _browseActive,
  theme,
  activeEnv,
}: {
  request: Request
  editState: EditState
  editValue: string
  setEditValue: (v: string) => void
  inEdit: boolean
  browseActive: boolean
  theme: Theme
  activeEnv?: Environment | null
}) {
  const body = formatBody(request.body)
  const textareaRef = useRef<TextareaRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)

  const { handleContentChange } = useJsonHighlight(
    textareaRef,
    lineNumberRef,
    theme,
    setEditValue,
  )

  const editingBody = inEdit && editState.cursor.field === "body"

  if (editingBody) {
    const initialValue = formatBody(editValue)
    return (
      <line-number
        ref={lineNumberRef}
        minWidth={3}
        paddingRight={1}
        fg={theme.textMuted}
        bg={theme.backgroundPanel}
        style={{ flexGrow: 1 }}
        width="100%"
      >
        <textarea
          ref={textareaRef}
          id="body-field"
          initialValue={initialValue}
          onContentChange={handleContentChange}
          keyBindings={[{ name: "return", shift: true, action: "newline" }]}
          backgroundColor={theme.backgroundPanel}
          focusedBackgroundColor={theme.backgroundPanel}
          textColor={theme.text}
          cursorColor={theme.primary}
          focused
        />
      </line-number>
    )
  }

  if (body === "") {
    return (
      <text id="body-field" fg={theme.textMuted}>
        (none)
      </text>
    )
  }

  return (
    <JsonBodyViewer
      body={body}
      theme={theme}
      id="body-field"
      activeEnv={activeEnv ?? null}
    />
  )
}

function AuthSection({
  request,
  editState,
  theme,
  activeEnv,
}: {
  request: Request
  editState: EditState
  theme: Theme
  activeEnv?: Environment | null
}) {
  const auth = formatAuth(request.auth)
  const isActive =
    editState.mode === "browsing" && editState.cursor.field === "auth"
  return (
    <box
      id="auth-field"
      border={[...LeftBar.border]}
      customBorderChars={LeftBar.customBorderChars}
      borderColor={isActive ? theme.primary : theme.borderSubtle}
      style={{
        backgroundColor: isActive ? theme.backgroundElement : undefined,
      }}
    >
      <VarText
        text={` ${auth}`}
        env={activeEnv ?? null}
        baseColor={isActive ? theme.text : theme.textMuted}
      />
    </box>
  )
}
