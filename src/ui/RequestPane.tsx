import { type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import { useEffect, useMemo, useRef } from "react"
import type {
  AssertionOperator,
  Auth,
  Request,
  Environment,
  Response,
} from "../schema"
import type { EditState, FieldKind, FieldSubfield } from "./editMode"
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
import { syncPathParamsWithUrl } from "./urlParams"
import type { CodeEditorRenderable } from "./editor/CodeEditor"
import { AutomationTab } from "./request-pane/AutomationTab"

interface Props {
  request: Request | null
  response?: Response
  visible?: boolean
  error?: Error | null
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  editOperator?: AssertionOperator
  setEditOperator?: (operator: AssertionOperator) => void
  editError?: string | null
  focused?: boolean
  activeTab: FieldKind
  activeEnv?: Environment | null
  onAuthTypeChange?: (t: Auth["type"]) => void
  onApiKeyPlacementChange?: (placement: "header" | "query") => void
  onAuthFieldChange?: (
    authType: Auth["type"],
    field: string,
    value: string | boolean | number,
  ) => void
  onBodyTypeChange?: (t: BodyType) => void
  onBodyChange?: (body: string) => void
  onTlsVerifyChange?: (verify?: boolean) => void
  onSelectOpenChange?: (open: boolean) => void
  jumpMode?: boolean
  onPaneFocus?: () => void
  onTabChange?: (tab: FieldKind) => void
  onBodyTypeFocus?: () => void
  onAuthFocusRow?: (row: number) => void
  onBodyEditorFocus?: (bodyType: BodyType) => void
  onFieldActivate?: (
    field: FieldKind,
    row: number,
    addingRow?: boolean,
    subfield?: FieldSubfield,
  ) => void
  onFieldSubfieldFocus?: (subfield: FieldSubfield) => void
  onFieldToggle?: (field: FieldKind, row: number) => void
  onInteraction?: () => boolean | void
  interactive?: boolean
  collectionTlsVerify?: boolean
  insecure?: boolean
}

const BASE_TAB_DEFS: TabDef[] = [
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "pathParams", label: "Path" },
  { id: "body", label: "Body" },
  { id: "auth", label: "Auth" },
  { id: "automation", label: "Automation" },
  { id: "settings", label: "Settings" },
]

export function RequestPane({
  request,
  response,
  visible = true,
  error,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  editOperator = "equals",
  setEditOperator = () => {},
  editError = null,
  focused = false,
  activeTab,
  activeEnv,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onAuthFieldChange,
  onBodyTypeChange,
  onBodyChange,
  onTlsVerifyChange,
  onSelectOpenChange,
  jumpMode = false,
  onPaneFocus,
  onTabChange,
  onBodyTypeFocus,
  onAuthFocusRow,
  onBodyEditorFocus,
  onFieldActivate,
  onFieldSubfieldFocus,
  onFieldToggle,
  onInteraction,
  interactive = true,
  collectionTlsVerify,
  insecure = false,
}: Props) {
  const theme = useTheme()
  const title = "Request"
  const inEdit = editState.mode === "editing"
  const browseActive = editState.mode === "browsing"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const bodyEditorRef = useRef<CodeEditorRenderable | null>(null)
  const keymap = useKeymap()
  const isTextBody =
    activeTab === "body" &&
    (request?.bodyType === undefined ||
      request.bodyType === "json" ||
      request.bodyType === "xml")

  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (keymap.getData("app.overlay") !== "none") return
    if (editState.mode !== "browsing") return
    if (key.name === "pagedown") {
      if (isTextBody) bodyEditorRef.current?.scrollByViewport(1)
      else scrollRef.current?.scrollBy(1, "viewport")
    } else if (key.name === "pageup") {
      if (isTextBody) bodyEditorRef.current?.scrollByViewport(-1)
      else scrollRef.current?.scrollBy(-1, "viewport")
    }
  })

  useEffect(() => {
    if (editState.mode === "inactive") return
    const { field, row, addingRow } = editState.cursor
    if (field === "headers" || field === "params" || field === "pathParams") {
      const prefix =
        field === "headers" ? "hdr" : field === "params" ? "prm" : "ppr"
      scrollRef.current?.scrollChildIntoView(
        addingRow ? `${prefix}-add` : `${prefix}-${row}`,
      )
    } else if (field === "body" && addingRow) {
      scrollRef.current?.scrollChildIntoView("body-add")
    } else if (
      field === "body" &&
      row > 0 &&
      (request?.bodyType === "multipart" || request?.bodyType === "urlencoded")
    ) {
      scrollRef.current?.scrollChildIntoView(`body-${row - 1}`)
    } else if (field === "automation") {
      scrollRef.current?.scrollChildIntoView(`automation-${row}`)
    } else if ((field === "auth" || field === "settings") && row > 0) {
      scrollRef.current?.scrollChildIntoView(`${field}-${row}`)
    } else {
      scrollRef.current?.scrollChildIntoView(`${field}-field`)
    }
  }, [editState.cursor, editState.mode, request?.bodyType])

  const tabs = useMemo(() => {
    const labels = computeRequestTabLabels(request)
    return BASE_TAB_DEFS.map((tab, i) => ({
      ...tab,
      label: labels[i],
      jumpHint: jumpMode ? REQUEST_TAB_HINT_ORDER[i] : undefined,
    }))
  }, [request, jumpMode])
  return (
    <Frame
      visible={visible}
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
      onPaneFocus={onPaneFocus}
      onInteraction={onInteraction}
      onMouseDrag={(event) => {
        if (isTextBody) {
          bodyEditorRef.current?.handleSelectionDrag(event.x, event.y)
        }
      }}
      onMouseUp={() => {
        bodyEditorRef.current?.finishSelectionDrag()
      }}
    >
      {request ? (
        <>
          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={(tab) => {
              if (onInteraction?.() === false) return
              onPaneFocus?.()
              onTabChange?.(tab as FieldKind)
            }}
          >
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
                  interactive={interactive}
                  onActivate={() => {
                    onInteraction?.()
                    onPaneFocus?.()
                    onBodyTypeFocus?.()
                  }}
                />
              )}
              {isTextBody ? (
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
                  onFormRowActivate={
                    onFieldActivate
                      ? (row, addingRow, subfield) => {
                          onPaneFocus?.()
                          onFieldActivate(
                            "body",
                            addingRow ? -1 : row + 1,
                            addingRow,
                            subfield,
                          )
                        }
                      : undefined
                  }
                  onFormSubfieldFocus={onFieldSubfieldFocus}
                  onFormRowToggle={
                    onFieldToggle
                      ? (row) => {
                          onPaneFocus?.()
                          onFieldToggle("body", row + 1)
                        }
                      : undefined
                  }
                  onEditorActivate={() => {
                    if (inEdit) return
                    onInteraction?.()
                    onPaneFocus?.()
                    onBodyEditorFocus?.(request.bodyType ?? "json")
                  }}
                  onEditorRef={(editor) => {
                    bodyEditorRef.current = editor
                  }}
                />
              ) : (
                <scrollbox
                  id="request-tab-scrollbox"
                  ref={scrollRef}
                  scrollY
                  verticalScrollbarOptions={{
                    trackOptions: {
                      backgroundColor: theme.background,
                      foregroundColor: theme.borderActive,
                    },
                  }}
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
                      onFormRowActivate={
                        onFieldActivate
                          ? (row, addingRow, subfield) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate(
                                "body",
                                addingRow ? -1 : row + 1,
                                addingRow,
                                subfield,
                              )
                            }
                          : undefined
                      }
                      onFormSubfieldFocus={onFieldSubfieldFocus}
                      onFormRowToggle={
                        onFieldToggle
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldToggle("body", row + 1)
                            }
                          : undefined
                      }
                      onEditorActivate={() => {
                        if (!inEdit) onInteraction?.()
                        onPaneFocus?.()
                        onBodyEditorFocus?.(request.bodyType ?? "json")
                      }}
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
                      onActivateRow={
                        onFieldActivate
                          ? (row, addingRow, subfield) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate(
                                "headers",
                                row,
                                addingRow,
                                subfield,
                              )
                            }
                          : undefined
                      }
                      onToggleRow={
                        onFieldToggle
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldToggle("headers", row)
                            }
                          : undefined
                      }
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
                      onActivateRow={
                        onFieldActivate
                          ? (row, addingRow, subfield) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate(
                                "params",
                                row,
                                addingRow,
                                subfield,
                              )
                            }
                          : undefined
                      }
                      onToggleRow={
                        onFieldToggle
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldToggle("params", row)
                            }
                          : undefined
                      }
                    />
                  )}
                  {activeTab === "pathParams" && (
                    <KeyValueSection
                      kind="pathParams"
                      entries={syncPathParamsWithUrl(
                        request?.pathParams ?? [],
                        request?.url ?? "",
                      ).map((p) => ({
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
                      onActivateRow={
                        onFieldActivate
                          ? (row, addingRow, subfield) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate(
                                "pathParams",
                                row,
                                addingRow,
                                subfield,
                              )
                            }
                          : undefined
                      }
                    />
                  )}
                  {activeTab === "auth" && (
                    <AuthEditor
                      auth={request?.auth ?? { type: "none" }}
                      editState={editState}
                      inEdit={inEdit}
                      browseActive={browseActive}
                      editValue={editValue}
                      setEditValue={setEditValue}
                      theme={theme}
                      activeEnv={activeEnv}
                      onAuthTypeChange={onAuthTypeChange ?? (() => {})}
                      onApiKeyPlacementChange={
                        onApiKeyPlacementChange ?? (() => {})
                      }
                      onAuthFieldChange={onAuthFieldChange}
                      onSelectOpenChange={onSelectOpenChange}
                      interactive={interactive}
                      onFocusRow={(row) => {
                        onInteraction?.()
                        onPaneFocus?.()
                        onAuthFocusRow?.(row)
                      }}
                      onActivateRow={
                        onFieldActivate
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate("auth", row)
                            }
                          : undefined
                      }
                      showInherit={true}
                    />
                  )}
                  {activeTab === "automation" && (
                    <AutomationTab
                      request={request}
                      response={response}
                      editState={editState}
                      editKey={editKey}
                      editValue={editValue}
                      editOperator={editOperator}
                      editError={editError}
                      setEditKey={setEditKey}
                      setEditValue={setEditValue}
                      setEditOperator={setEditOperator}
                      activeEnv={activeEnv}
                      onActivateRow={
                        onFieldActivate
                          ? (row, subfield) => {
                              if (onInteraction?.() === false) return
                              onPaneFocus?.()
                              onFieldActivate(
                                "automation",
                                row,
                                false,
                                subfield,
                              )
                            }
                          : undefined
                      }
                      onSubfieldFocus={onFieldSubfieldFocus}
                      onSelectOpenChange={onSelectOpenChange}
                      interactive={interactive}
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
                      onActivateRow={
                        onFieldActivate
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldActivate("settings", row)
                            }
                          : undefined
                      }
                      onToggleRow={
                        onFieldToggle
                          ? (row) => {
                              onInteraction?.()
                              onPaneFocus?.()
                              onFieldToggle("settings", row)
                            }
                          : undefined
                      }
                      onTlsVerifyChange={onTlsVerifyChange}
                      onSelectOpenChange={onSelectOpenChange}
                      collectionTlsVerify={collectionTlsVerify}
                      insecure={insecure}
                      interactive={interactive}
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
