import { Sidebar } from "./Sidebar"
import { FolderPane } from "./FolderPane"
import { useTheme } from "./theme"
import type { BodyType, CollectionItem, Environment } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseFolderEditBrowseResult } from "../hooks/useFolderEditBrowse"
import type { Focus } from "./focus"
import type { UrlBarSubFocus } from "./focus"
import type { Keybinds } from "./keybind"
import type { VisibleNode } from "./tree"
import { RequestResponseView } from "./RequestResponseView"
import type { RefObject } from "react"
import type { ResponseQueryController } from "./responseQuery"

interface MainViewProps {
  items: CollectionItem[]
  collectionDir: string
  loading: boolean
  error: Error | null
  visibleItems: VisibleNode[]
  cursorIndex: number
  selectedId: string | null
  expandedFolders: Set<string>
  focusedFolderPresent: boolean
  focus: Focus
  keybinds: Keybinds
  draft: UseRequestDraftResult
  folderDraft: UseFolderDraftResult
  folderEb: UseFolderEditBrowseResult
  eb: UseEditBrowseResult
  layout: "stacked" | "side-by-side"
  expanded: "request" | "response" | null
  activeEnv: Environment | null
  collectionTlsVerify?: boolean
  insecure?: boolean
  responseState: import("./sendState").SendState
  timelineEntries: import("../schema").TimelineEntry[]
  initialResponseTab?: import("./tabs/uiState").ResponseTabKind
  onResponseTabChange: (tab: import("./tabs/uiState").ResponseTabKind) => void
  onOpenTimelineEntry?: (entry: import("../schema").TimelineEntry) => void
  setSelectOpen: (open: boolean) => void
  urlbarSubFocus: UrlBarSubFocus
  urlbarInteractive: boolean
  responseQueryRef?: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef?: RefObject<string | null>
  mode?: "collection" | "browse" | "empty" | "invalid"
  jumpMode?: boolean
  onQueryVisibleChange?: (v: boolean) => void
  onResponseBodyEditorAvailableChange?: (available: boolean) => void
  onPaneFocus?: (focus: Focus) => void
  onUrlbarFocus?: (subFocus: UrlBarSubFocus) => void
  onSend?: () => void
  onRequestSelect?: (id: string) => void
  onFolderSelect?: (path: string) => void
  onFolderToggle?: (path: string) => void
  onRequestContextMenu?: (id: string) => void
  onFolderContextMenu?: (path: string) => void
}

export function MainView({
  items,
  collectionDir,
  loading,
  error,
  visibleItems,
  cursorIndex,
  selectedId,
  expandedFolders,
  focusedFolderPresent,
  focus,
  keybinds,
  draft,
  folderDraft,
  folderEb,
  eb,
  layout,
  expanded,
  activeEnv,
  collectionTlsVerify,
  insecure = false,
  responseState,
  timelineEntries,
  initialResponseTab,
  onResponseTabChange,
  onOpenTimelineEntry,
  setSelectOpen,
  urlbarSubFocus,
  urlbarInteractive,
  responseQueryRef,
  responseBodyForCopyRef,
  mode = "collection",
  jumpMode = false,
  onQueryVisibleChange,
  onResponseBodyEditorAvailableChange,
  onPaneFocus = () => {},
  onUrlbarFocus,
  onSend,
  onRequestSelect,
  onFolderSelect,
  onFolderToggle,
  onRequestContextMenu,
  onFolderContextMenu,
}: MainViewProps) {
  const theme = useTheme()

  return (
    <box
      style={{
        flexDirection: "row",
        flexGrow: 1,
        gap: 1,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
    >
      <Sidebar
        items={items}
        loading={loading}
        error={error}
        visibleItems={visibleItems}
        cursorIndex={cursorIndex}
        selectedId={selectedId}
        expanded={expandedFolders}
        focused={focus === "sidebar"}
        keybinds={keybinds}
        dirtyRequestIds={draft.dirtyRequestIds}
        dirtyFolderPaths={folderDraft.dirtyPaths}
        jumpMode={jumpMode}
        onPaneFocus={() => onPaneFocus("sidebar")}
        onRequestSelect={onRequestSelect}
        onFolderSelect={onFolderSelect}
        onFolderToggle={onFolderToggle}
        onRequestContextMenu={onRequestContextMenu}
        onFolderContextMenu={onFolderContextMenu}
      />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          gap: 0,
          minHeight: 0,
        }}
      >
        {mode !== "collection" && (
          <box style={{ paddingLeft: 1, paddingRight: 1 }}>
            <text fg={theme.warning}>
              Read-only folder. Initialize collection to edit or send requests.
            </text>
          </box>
        )}
        {focusedFolderPresent ? (
          <FolderPane
            collectionDir={collectionDir}
            folder={folderDraft.folderDraft}
            focused={focus === "folder"}
            editState={folderEb.editState}
            editKey={folderEb.editKey}
            editValue={folderEb.editValue}
            setEditKey={folderEb.setEditKey}
            setEditValue={folderEb.setEditValue}
            activeTab={folderEb.activeTab}
            onAuthTypeChange={folderDraft.setAuthType}
            onApiKeyPlacementChange={folderDraft.setApiKeyPlacement}
            onSelectOpenChange={setSelectOpen}
            activeEnv={activeEnv}
            theme={theme}
            jumpMode={jumpMode}
            onPaneFocus={() => onPaneFocus("folder")}
            onTabChange={folderEb.enterBrowseAt}
            onAuthFocusRow={(row) => folderEb.enterBrowseAt("auth", row)}
            onInteraction={folderEb.commitEdit}
            onFieldActivate={
              mode === "collection" ? folderEb.activateAt : undefined
            }
            onFieldToggle={
              mode === "collection" ? folderEb.toggleAt : undefined
            }
            interactive={mode === "collection"}
          />
        ) : (
          <RequestResponseView
            draft={draft}
            eb={eb}
            error={error}
            focus={focus}
            layout={layout}
            expanded={expanded}
            activeEnv={activeEnv}
            collectionTlsVerify={collectionTlsVerify}
            insecure={insecure}
            responseState={responseState}
            timelineEntries={timelineEntries}
            initialResponseTab={initialResponseTab}
            onResponseTabChange={onResponseTabChange}
            onOpenTimelineEntry={onOpenTimelineEntry}
            setSelectOpen={setSelectOpen}
            urlbarSubFocus={urlbarSubFocus}
            urlbarInteractive={urlbarInteractive}
            responseKey={selectedId}
            responseQueryRef={responseQueryRef}
            responseBodyForCopyRef={responseBodyForCopyRef}
            jumpMode={jumpMode}
            onQueryVisibleChange={onQueryVisibleChange}
            onResponseBodyEditorAvailableChange={
              onResponseBodyEditorAvailableChange
            }
            onPaneFocus={onPaneFocus}
            onUrlbarFocus={onUrlbarFocus}
            onSend={onSend}
            onRequestTabChange={eb.enterBrowseAt}
            onRequestBodyTypeFocus={() => eb.enterBrowseAt("body")}
            onRequestAuthFocusRow={(row) => eb.enterBrowseAt("auth", row)}
            onRequestInteraction={eb.commitEdit}
            onRequestBodyEditorFocus={
              mode === "collection"
                ? (bodyType: BodyType) => {
                    if (bodyType === "json") {
                      if (eb.isEditingJsonBody) return
                      eb.enterBrowseAt("body")
                      eb.enterJsonBodyEditor()
                    } else {
                      eb.activateAt("body", 1)
                    }
                  }
                : undefined
            }
            onRequestFieldActivate={
              mode === "collection" ? eb.activateAt : undefined
            }
            onRequestFieldToggle={
              mode === "collection" ? eb.toggleAt : undefined
            }
          />
        )}
      </box>
    </box>
  )
}
