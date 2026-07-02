import { useMemo } from "react"
import type { Folder, Environment, Auth } from "../schema"
import type { EditState, FolderFieldKind, FieldKind } from "./editMode"
import { Tabs } from "./Tabs"
import { FolderMetaTab } from "./FolderMetaTab"
import { FolderActivityTab } from "./FolderActivityTab"
import { useFolderActivity } from "./useFolderActivity"
import { KeyValueSection } from "./KeyValueSection"
import { AuthEditor } from "./AuthEditor"
import type { Theme } from "./theme"
import { FullBorder } from "./borders"

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
  onTabChange: (tab: FolderFieldKind) => void
  onAuthTypeChange: (type: Auth["type"]) => void
  onApiKeyPlacementChange: (placement: "header" | "query") => void
  onSelectOpenChange?: (open: boolean) => void
  activeEnv: Environment | null
  theme: Theme
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
  onTabChange: _onTabChange,
  onAuthTypeChange,
  onApiKeyPlacementChange,
  onSelectOpenChange,
  activeEnv,
  theme,
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
        { id: "activity", label: "Activity" },
        { id: "meta", label: "General" },
        { id: "headers", label: "Headers" },
        { id: "auth", label: "Auth" },
      ]
    }
    const hasHeaders = Object.values(
      folder.overrides?.headers ?? {},
    ).some((e) => e.enabled)
    const hasAuth =
      folder.overrides?.auth?.type !== undefined &&
      folder.overrides.auth.type !== "none" &&
      folder.overrides.auth.type !== "inherit"
    return [
      { id: "activity", label: "Activity" },
      { id: "meta", label: "General" },
      { id: "headers", label: hasHeaders ? "Headers \u2022" : "Headers" },
      { id: "auth", label: hasAuth ? "Auth \u2022" : "Auth" },
    ]
  }, [folder])

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
      title="Folder"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      {folder ? (
        <>
          <Tabs tabs={tabs} activeId={activeTab}>
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
                <box style={{ flexDirection: "column", gap: 1 }}>
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
                <box style={{ flexDirection: "column", gap: 1 }}>
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
                    showInherit={true}
                  />
                </box>
              )}
            </scrollbox>
          </Tabs>
        </>
      ) : (
        <text fg={theme.textMuted}>(no folder selected)</text>
      )}
    </box>
  )
}
