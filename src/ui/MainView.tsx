import { Sidebar } from "./Sidebar"
import { FolderPane } from "./FolderPane"
import { useTheme } from "./theme"
import type { CollectionItem, Environment } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseFolderEditBrowseResult } from "../hooks/useFolderEditBrowse"
import type { Focus } from "./focus"
import type { UrlBarSubFocus } from "./focus"
import type { Keybinds } from "./keybind"
import type { VisibleNode } from "./tree"
import { RequestResponseView } from "./RequestResponseView"

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
  responseState: import("./sendState").SendState
  timelineEntries: import("../schema").TimelineEntry[]
  initialResponseTab?: import("./tabs/uiState").ResponseTabKind
  onResponseTabChange: (tab: import("./tabs/uiState").ResponseTabKind) => void
  onOpenTimelineEntry?: (entry: import("../schema").TimelineEntry) => void
  setSelectOpen: (open: boolean) => void
  urlbarSubFocus: UrlBarSubFocus
  urlbarInteractive: boolean
  expandHint: string
  mode?: "collection" | "browse" | "empty" | "invalid"
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
  responseState,
  timelineEntries,
  initialResponseTab,
  onResponseTabChange,
  onOpenTimelineEntry,
  setSelectOpen,
  urlbarSubFocus,
  urlbarInteractive,
  expandHint,
  mode = "collection",
}: MainViewProps) {
  const theme = useTheme()

  if (mode === "empty") {
    return (
      <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <text fg={theme.textMuted}>No collection here.</text>
          <text fg={theme.textMuted}>Ctrl+N to create a request.</text>
        </box>
      </box>
    )
  }

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
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
      />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          gap: 1,
          minHeight: 0,
        }}
      >
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
            responseState={responseState}
            timelineEntries={timelineEntries}
            initialResponseTab={initialResponseTab}
            onResponseTabChange={onResponseTabChange}
            onOpenTimelineEntry={onOpenTimelineEntry}
            setSelectOpen={setSelectOpen}
            urlbarSubFocus={urlbarSubFocus}
            urlbarInteractive={urlbarInteractive}
            expandHint={expandHint}
          />
        )}
      </box>
    </box>
  )
}
