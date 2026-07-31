import { useMemo } from "react"
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
import { FOLDER_TAB_HINT_ORDER } from "./useJumpMode"

interface FolderPaneProps {
  collectionDir: string
  folder: Folder | null
  focused: boolean
  editState: EditState
  editKey: string
  editValue: string
  setEditKey: (v: string) => void
  setEditValue: (v: string) => void
  activeTab: FieldKind
  onAuthTypeChange: (type: Auth["type"]) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onSelectOpenChange?: (open: boolean) => void
  activeEnv: Environment | null
  theme: Theme
  jumpMode?: boolean
  onPaneFocus?: () => void
  onTabChange?: (tab: FolderFieldKind) => void
  onAuthFocusRow?: (row: number) => void
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
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onSelectOpenChange,
  activeEnv,
  theme,
  jumpMode = false,
  onPaneFocus,
  onTabChange,
  onAuthFocusRow,
}: FolderPaneProps) {
  const browseActive = editState.mode === "browsing"
  const inEdit = editState.mode === "editing"

  const { stats: activityStats, loading: activityLoading } = useFolderActivity(
    collectionDir,
    folder,
    activeTab === "activity",
  )

  const tabs = useMemo(() => {
    if (!folder) {
      return [
        { id: "meta", label: "General" },
        { id: "headers", label: "Headers" },
        { id: "auth", label: "Auth" },
        { id: "activity", label: "Activity" },
      ].map((tab, i) => ({
        ...tab,
        jumpHint: jumpMode ? FOLDER_TAB_HINT_ORDER[i] : undefined,
      }))
    }
    const hasHeaders = Object.values(folder.overrides?.headers ?? {}).some(
      (e) => e.enabled,
    )
    const hasAuth =
      folder.overrides?.auth?.type !== undefined &&
      folder.overrides.auth.type !== "none"
    return [
      { id: "meta", label: "General" },
      { id: "headers", label: hasHeaders ? "Headers \u2022" : "Headers" },
      { id: "auth", label: hasAuth ? "Auth \u2022" : "Auth" },
      { id: "activity", label: "Activity" },
    ].map((tab, i) => ({
      ...tab,
      jumpHint: jumpMode ? FOLDER_TAB_HINT_ORDER[i] : undefined,
    }))
  }, [folder, jumpMode])

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
    >
      {folder ? (
        <>
          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={(tab) => {
              if (inEdit) return
              onPaneFocus?.()
              onTabChange?.(tab as FolderFieldKind)
            }}
          >
            <scrollbox
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
                    setEditValue={setEditValue}
                    theme={theme}
                    activeEnv={activeEnv}
                    onAuthTypeChange={onAuthTypeChange ?? (() => {})}
                    onApiKeyPlacementChange={
                      onApiKeyPlacementChange ?? (() => {})
                    }
                    onSelectOpenChange={onSelectOpenChange}
                    onFocusRow={onAuthFocusRow}
                    showInherit={false}
                  />
                </box>
              )}
            </scrollbox>
          </Tabs>
        </>
      ) : (
        <text fg={theme.textMuted}>(no folder selected)</text>
      )}
    </Frame>
  )
}
