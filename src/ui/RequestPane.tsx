import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import type { Auth, Request, Environment } from "../schema"
import type { EditState, FieldKind } from "./editMode"
import type { BodyType } from "../schema"

import { CenterText } from "./CenterText"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { FullBorder } from "./borders"
import { KeyValueSection } from "./KeyValueSection"
import { AuthEditor } from "./AuthEditor"
import { computeRequestTabLabels, REQUEST_TAB_HINT_ORDER } from "./useJumpMode"
import { Frame } from "./Frame"
import { Badge } from "./Badge"
import { BodyTypeSelector, BodySection } from "./request-pane/RequestBodyTab"
import { SettingsSection } from "./request-pane/RequestSettingsTab"

interface Props {
  request: Request | null
  error?: Error | null
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  focused?: boolean
  activeTab: FieldKind
  activeEnv?: Environment | null
  onAuthTypeChange?: (t: Auth["type"]) => void
  onApiKeyPlacementChange?: (placement: "header" | "query") => void
  onBodyTypeChange?: (t: BodyType) => void
  onBodyChange?: (body: string) => void
  onSelectOpenChange?: (open: boolean) => void
  jumpMode?: boolean
}

const BASE_TAB_DEFS: TabDef[] = [
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
  { id: "settings", label: "Settings" },
]

export function RequestPane({
  request,
  error,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  focused = false,
  activeTab,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onBodyTypeChange,
  onBodyChange,
  onSelectOpenChange,
  jumpMode = false,
}: Props) {
  const theme = useTheme()
  const title = "Request"
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const keymap = useKeymap()

  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (keymap.getData("app.overlay") !== "none") return
    if (editState.mode !== "browsing") return
    if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
  })

  useEffect(() => {
    if (editState.mode === "inactive") return
    const { field, row, addingRow } = editState.cursor
    if (field === "headers" || field === "params") {
      const prefix = field === "headers" ? "hdr" : "prm"
      scrollRef.current?.scrollChildIntoView(
        addingRow ? `${prefix}-add` : `${prefix}-${row}`,
      )
    } else if (field === "body" && addingRow) {
      scrollRef.current?.scrollChildIntoView("body-add")
    } else {
      scrollRef.current?.scrollChildIntoView(`${field}-field`)
    }
  }, [editState.cursor, editState.mode])

  const handleSelectOpenChange = useCallback(
    (open: boolean) => {
      onSelectOpenChange?.(open)
      if (open) {
        scrollRef.current?.scrollChildIntoView("auth-field")
      }
    },
    [onSelectOpenChange],
  )

  const tabs = useMemo(() => {
    const labels = computeRequestTabLabels(request)
    return BASE_TAB_DEFS.map((tab, i) => ({
      ...tab,
      label: labels[i],
      jumpHint: jumpMode ? REQUEST_TAB_HINT_ORDER[i] : undefined,
    }))
  }, [request, jumpMode])
  const isJsonBody =
    activeTab === "body" && (request?.bodyType ?? "json") === "json"

  return (
    <Frame
      style={{
        flexDirection: "column",
        flexGrow: 1,
        paddingTop: 0,
        paddingBottom: 0,
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
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={focused ? theme.primary : theme.textMuted}
          >
            {title}
          </Badge>
        )
      }
    >
      {request ? (
        <>
          <Tabs tabs={tabs} activeId={activeTab}>
            <box
              style={{
                flexDirection: "column",
                flexGrow: 1,
                minHeight: 0,
                gap: 1,
              }}
            >
              {activeTab === "body" && (
                <BodyTypeSelector
                  request={request}
                  editState={editState}
                  browseActive={browseActive}
                  onBodyTypeChange={onBodyTypeChange ?? (() => {})}
                  onSelectOpenChange={onSelectOpenChange}
                />
              )}
              {isJsonBody ? (
                <BodySection
                  request={request}
                  editState={editState}
                  editKey={editKey}
                  editValue={editValue}
                  setEditKey={setEditKey}
                  setEditValue={setEditValue}
                  inEdit={inEdit}
                  browseActive={browseActive}
                  theme={theme}
                  activeEnv={activeEnv}
                  onBodyChange={onBodyChange ?? (() => {})}
                />
              ) : (
                <scrollbox
                  ref={scrollRef}
                  scrollY
                  style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
                >
                  {activeTab === "body" && (
                    <BodySection
                      request={request}
                      editState={editState}
                      editKey={editKey}
                      editValue={editValue}
                      setEditKey={setEditKey}
                      setEditValue={setEditValue}
                      inEdit={inEdit}
                      browseActive={browseActive}
                      theme={theme}
                      activeEnv={activeEnv}
                      onBodyChange={onBodyChange ?? (() => {})}
                    />
                  )}
                  {activeTab === "headers" && (
                    <KeyValueSection
                      kind="headers"
                      entries={Object.entries(request?.headers ?? {}).map(
                        ([key, value]) => ({ key, value }),
                      )}
                      editState={editState}
                      editKey={editKey}
                      editValue={editValue}
                      setEditKey={setEditKey}
                      setEditValue={setEditValue}
                      theme={theme}
                      activeEnv={activeEnv}
                    />
                  )}
                  {activeTab === "params" && (
                    <KeyValueSection
                      kind="params"
                      entries={(request?.params ?? []).map((p) => ({
                        key: p.name,
                        value: { value: p.value, enabled: p.enabled },
                      }))}
                      editState={editState}
                      editKey={editKey}
                      editValue={editValue}
                      setEditKey={setEditKey}
                      setEditValue={setEditValue}
                      theme={theme}
                      activeEnv={activeEnv}
                    />
                  )}
                  {activeTab === "auth" && (
                    <AuthEditor
                      auth={request?.auth ?? { type: "none" }}
                      editState={editState}
                      inEdit={inEdit}
                      browseActive={browseActive}
                      setEditValue={setEditValue}
                      theme={theme}
                      activeEnv={activeEnv}
                      onAuthTypeChange={onAuthTypeChange ?? (() => {})}
                      onApiKeyPlacementChange={
                        onApiKeyPlacementChange ?? (() => {})
                      }
                      onSelectOpenChange={handleSelectOpenChange}
                      showInherit={true}
                    />
                  )}
                  {activeTab === "settings" && (
                    <SettingsSection
                      request={request}
                      editState={editState}
                      setEditValue={setEditValue}
                      inEdit={inEdit}
                      browseActive={browseActive}
                      theme={theme}
                      activeEnv={activeEnv}
                    />
                  )}
                </scrollbox>
              )}
            </box>
          </Tabs>
        </>
      ) : error ? (
        <box
          style={{
            flexGrow: 1,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <CenterText
            segments={[
              { text: "No collection found", color: theme.text },
              { text: " ", color: theme.textMuted },
              {
                text: "use --collection <dir> or create the default directory",
                color: theme.textMuted,
              },
            ]}
          />
        </box>
      ) : (
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <text fg={theme.textMuted}>empty</text>
        </box>
      )}
    </Frame>
  )
}
