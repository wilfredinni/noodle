import type { Folder, Environment, Auth } from "../schema"
import type { EditState, FolderFieldKind, FieldKind } from "./editMode"
import { Tabs, type TabDef } from "./Tabs"
import { FolderMetaTab } from "./FolderMetaTab"
import { KeyValueSection } from "./KeyValueSection"
import { AuthEditor } from "./AuthEditor"
import type { Theme } from "./theme"
import { FullBorder } from "./borders"

const FOLDER_TABS: TabDef[] = [
  { id: "meta", label: "Name & Seq" },
  { id: "headers", label: "Headers" },
  { id: "params", label: "Params" },
  { id: "auth", label: "Auth" },
]

interface FolderPaneProps {
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
  activeEnv: Environment | null
  theme: Theme
}

export function FolderPane({
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
  activeEnv,
  theme,
}: FolderPaneProps) {
  const browseActive = editState.mode === "browsing"
  const inEdit = editState.mode === "editing"

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
          <Tabs tabs={FOLDER_TABS} activeId={activeTab}>
            <scrollbox
              scrollY
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
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
                <KeyValueSection
                  kind="headers"
                  entries={Object.entries(
                    folder.overrides?.headers ?? {},
                  ).map(([key, value], i) => ({ key, value, index: i }))}
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
                  entries={Object.entries(
                    folder.overrides?.params ?? {},
                  ).map(([key, value], i) => ({ key, value, index: i }))}
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
                />
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
