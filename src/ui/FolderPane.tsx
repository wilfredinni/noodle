import { SCRIPT_TABS, scriptPhase, scriptText } from "../scriptAuthoring"
import { ScriptEditor } from "./editor/ScriptEditor"
import type { ScriptPhase } from "../preRequestScript"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Folder, Environment, Auth } from "../schema"
import type { EditState, FieldKind, FolderFieldKind } from "./editMode"
import { Tabs } from "./Tabs"
import { FolderMetaTab } from "./FolderMetaTab"
import { FolderActivityTab } from "./FolderActivityTab"
import { useFolderActivity } from "./useFolderActivity"
import { KeyValueSection } from "./KeyValueSection"
import { AuthEditor } from "./AuthEditor"
import type { Theme } from "./theme"
import { FullBorder } from "./borders"
import { Frame } from "./Frame"
import { Badge } from "./Badge"
import {
  FOLDER_TAB_HINTS,
  getVisibleFolderTabs,
  REQUEST_TAB_ADD_HINT,
} from "./useJumpMode"
import { Select } from "./Select"
import { JumpBadge } from "./JumpBadge"

interface FolderPaneProps {
  collectionDir: string
  folder: Folder | null
  focused: boolean
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  onScriptChange?: (phase: ScriptPhase, source: string) => void
  onScriptExit?: () => void
  activeTab: FieldKind
  revealedOptionalTabs?: readonly FieldKind[]
  tabMenuActive?: boolean
  onTabMenuActiveChange?: (active: boolean) => void
  onOptionalTabReveal?: (tab: FieldKind) => void
  onAuthTypeChange: (type: Auth["type"]) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onAuthFieldChange?: (
    authType: Auth["type"],
    field: string,
    value: string | boolean | number,
  ) => void
  onSelectOpenChange?: (open: boolean) => void
  activeEnv: Environment | null
  theme: Theme
  jumpMode?: boolean
  onPaneFocus?: () => void
  onTabChange?: (tab: FolderFieldKind) => void
  onAuthFocusRow?: (row: number) => void
  onFieldActivate?: (
    field: FolderFieldKind,
    row: number,
    addingRow?: boolean,
    subfield?: "key" | "value",
  ) => void
  onFieldToggle?: (field: FolderFieldKind, row: number) => void
  onInteraction?: () => void
  interactive?: boolean
}

export function FolderPane({
  collectionDir,
  folder,
  focused,
  editState,
  editKey,
  editValue,
  setEditKey,
  setEditValue,
  activeTab,
  revealedOptionalTabs,
  tabMenuActive: controlledTabMenuActive,
  onTabMenuActiveChange,
  onOptionalTabReveal,
  onScriptChange,
  onScriptExit,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onAuthFieldChange,
  onSelectOpenChange,
  activeEnv,
  theme,
  jumpMode = false,
  onPaneFocus,
  onTabChange,
  onAuthFocusRow,
  onFieldActivate,
  onFieldToggle,
  onInteraction,
  interactive = true,
}: FolderPaneProps) {
  const browseActive = editState.mode === "browsing"
  const inEdit = editState.mode === "editing"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [localTabMenuActive, setLocalTabMenuActive] = useState(false)
  const tabMenuActive = controlledTabMenuActive ?? localTabMenuActive
  const setTabMenuActive = onTabMenuActiveChange ?? setLocalTabMenuActive

  useEffect(() => {
    if (!focused) setTabMenuActive(false)
  }, [focused, setTabMenuActive])

  useEffect(() => {
    if (editState.mode === "inactive") return
    const { field, row, addingRow } = editState.cursor
    if (field === "headers") {
      scrollRef.current?.scrollChildIntoView(
        addingRow ? "hdr-add" : `hdr-${row}`,
      )
    } else if (field === "auth") {
      scrollRef.current?.scrollChildIntoView(
        row === 0 ? "auth-field" : `auth-${row}`,
      )
    } else if (field === "meta") {
      scrollRef.current?.scrollChildIntoView("folder-meta-field")
    }
  }, [editState.cursor, editState.mode])

  const { stats: activityStats, loading: activityLoading } = useFolderActivity(
    collectionDir,
    folder,
    activeTab === "activity",
  )

  const { tabs, optionalTabMenuItems } = useMemo(() => {
    const visibleTabs = getVisibleFolderTabs(
      folder,
      activeTab,
      revealedOptionalTabs,
    )
    const hasHeaders = Object.values(folder?.overrides?.headers ?? {}).some(
      (e) => e.enabled,
    )
    const hasAuth =
      folder?.overrides?.auth?.type !== undefined &&
      folder.overrides.auth.type !== "none"
    const tabs = [
      { id: "meta", label: "General" },
      { id: "headers", label: hasHeaders ? "Headers \u2022" : "Headers" },
      { id: "auth", label: hasAuth ? "Auth \u2022" : "Auth" },
      ...SCRIPT_TABS.filter((tab) => visibleTabs.includes(tab.id)).map(
        (tab) => ({
          ...tab,
          label: scriptText(folder ?? {}, tab.phase).trim()
            ? `${tab.label} \u2022`
            : tab.label,
        }),
      ),
      { id: "activity", label: "Activity" },
    ].map((tab) => ({
      ...tab,
      jumpHint: jumpMode
        ? FOLDER_TAB_HINTS[tab.id as FolderFieldKind]
        : undefined,
    }))
    return {
      tabs,
      optionalTabMenuItems: SCRIPT_TABS.map((tab) => ({
        ...tab,
        disabled: visibleTabs.includes(tab.id),
      })),
    }
  }, [folder, activeTab, jumpMode, revealedOptionalTabs])

  const changeTab = (tab: string) => {
    onInteraction?.()
    setTabMenuActive(false)
    onPaneFocus?.()
    onTabChange?.(tab as FolderFieldKind)
  }
  const handleTabMenuOpenChange = useCallback(
    (open: boolean) => {
      setTabMenuActive(open)
      onSelectOpenChange?.(open)
    },
    [setTabMenuActive, onSelectOpenChange],
  )

  return (
    <Frame
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
      titleRight={
        jumpMode ? undefined : (
          <Badge
            bg={theme.backgroundPanel}
            fg={focused ? theme.primary : theme.textMuted}
          >
            Folder
          </Badge>
        )
      }
      onPaneFocus={onPaneFocus}
      onInteraction={onInteraction}
    >
      {folder ? (
        <>
          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={changeTab}
            rightChildren={
              interactive ? (
                <box
                  id="folder-tab-add"
                  onMouseDown={(event) => event.stopPropagation()}
                  style={{ position: "relative", overflow: "visible" }}
                >
                  {jumpMode ? (
                    <JumpBadge
                      letter={REQUEST_TAB_ADD_HINT}
                      style={{ top: -1, left: 0 }}
                    />
                  ) : null}
                  <Select
                    items={optionalTabMenuItems}
                    placeholder="+"
                    focused={tabMenuActive}
                    visualFocused={tabMenuActive}
                    triggerColor={theme.primary}
                    fitContent
                    showIndicator={false}
                    dropdownAlign="right"
                    maxDropdownHeight={5}
                    onActivate={() => {
                      onPaneFocus?.()
                      setTabMenuActive(true)
                    }}
                    onChange={(tab) => {
                      changeTab(tab)
                      onOptionalTabReveal?.(tab as FieldKind)
                    }}
                    onOpenChange={handleTabMenuOpenChange}
                  />
                </box>
              ) : undefined
            }
          >
            {scriptPhase(activeTab) ? (
              <ScriptEditor
                key={`${folder.path}:${activeTab}`}
                value={scriptText(folder, scriptPhase(activeTab)!)}
                phase={scriptPhase(activeTab)!}
                source={{
                  scope: "folder",
                  scopeId: folder.path,
                  path: `${folder.path}/folder.yml`,
                }}
                focused={focused && !tabMenuActive}
                onFocus={onPaneFocus}
                editing={inEdit}
                interactive={interactive}
                onChange={(value) =>
                  onScriptChange?.(scriptPhase(activeTab)!, value)
                }
                onActivate={() => {
                  onPaneFocus?.()
                  onFieldActivate?.(activeTab as FolderFieldKind, 0)
                }}
                onExit={() => onScriptExit?.()}
                onSelectOpenChange={onSelectOpenChange}
              />
            ) : (
              <scrollbox
                id="folder-tab-scrollbox"
                ref={scrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
              >
                {activeTab === "activity" && (
                  <FolderActivityTab
                    stats={activityStats}
                    loading={activityLoading}
                    theme={theme}
                  />
                )}
                {activeTab === "meta" && (
                  <FolderMetaTab
                    name={folder.name}
                    editState={editState}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    browseActive={browseActive}
                    theme={theme}
                    activeEnv={activeEnv}
                    onActivate={
                      onFieldActivate
                        ? () => {
                            onPaneFocus?.()
                            onInteraction?.()
                            onFieldActivate("meta", 0)
                          }
                        : undefined
                    }
                  />
                )}
                {activeTab === "headers" && (
                  <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
                    <text fg={theme.textMuted}>
                      Headers sent with every request inside this folder.
                    </text>
                    <KeyValueSection
                      kind="headers"
                      entries={Object.entries(
                        folder.overrides?.headers ?? {},
                      ).map(([key, value]) => ({ key, value }))}
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
                              onPaneFocus?.()
                              onInteraction?.()
                              if (subfield === "persist") return
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
                              onPaneFocus?.()
                              onInteraction?.()
                              onFieldToggle("headers", row)
                            }
                          : undefined
                      }
                    />
                  </box>
                )}
                {activeTab === "auth" && (
                  <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
                    <text fg={theme.textMuted}>
                      Auth applied to every request inside this folder.
                    </text>
                    <AuthEditor
                      auth={folder.overrides?.auth ?? { type: "none" }}
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
                              onPaneFocus?.()
                              onInteraction?.()
                              onFieldActivate("auth", row)
                            }
                          : undefined
                      }
                      showInherit={false}
                    />
                  </box>
                )}
              </scrollbox>
            )}
          </Tabs>
        </>
      ) : (
        <text fg={theme.textMuted}>(no folder selected)</text>
      )}
    </Frame>
  )
}
