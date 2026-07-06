import { Sidebar } from "./Sidebar"
import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { FolderPane } from "./FolderPane"
import { useTheme } from "./theme"
import type { CollectionItem, Environment } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseFolderEditBrowseResult } from "../hooks/useFolderEditBrowse"
import type { Focus } from "./focus"
import type { Keybinds } from "./keybind"
import type { VisibleNode } from "./tree"
import type { ResponseTabKind } from "./tabs/uiState"
import type { SendState } from "./sendState"
import type { TimelineEntry } from "../schema"

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
  responseState: SendState
  timelineEntries: TimelineEntry[]
  initialResponseTab?: ResponseTabKind
  onResponseTabChange: (tab: ResponseTabKind) => void
  setSelectOpen: (open: boolean) => void
  expandHint: string
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
  setSelectOpen,
  expandHint,
}: MainViewProps) {
  const theme = useTheme()

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
            setSelectOpen={setSelectOpen}
            expandHint={expandHint}
          />
        )}
      </box>
    </box>
  )
}

function RequestResponseView({
  draft,
  eb,
  error,
  focus,
  layout,
  expanded,
  activeEnv,
  responseState,
  timelineEntries,
  initialResponseTab,
  onResponseTabChange,
  setSelectOpen,
  expandHint,
}: Pick<
  MainViewProps,
  | "draft"
  | "eb"
  | "error"
  | "focus"
  | "layout"
  | "expanded"
  | "activeEnv"
  | "responseState"
  | "timelineEntries"
  | "initialResponseTab"
  | "onResponseTabChange"
  | "setSelectOpen"
  | "expandHint"
>) {
  const content = (
    <>
      {expanded !== "response" && (
        <RequestPane
          request={draft.draft}
          error={error}
          editState={eb.editState}
          editKey={eb.editKey}
          editValue={eb.editValue}
          setEditKey={eb.setEditKey}
          setEditValue={eb.setEditValue}
          focused={focus === "request"}
          activeTab={eb.activeTab}
          activeEnv={activeEnv}
          onAuthTypeChange={draft.setAuthType}
          onApiKeyPlacementChange={draft.setApiKeyPlacement}
          onBodyTypeChange={draft.setBodyType}
          onSelectOpenChange={setSelectOpen}
          expandHint={expandHint}
        />
      )}
      {expanded !== "request" && (
        <ResponsePane
          state={responseState}
          focused={focus === "response"}
          timelineEntries={timelineEntries}
          initialTab={initialResponseTab}
          onTabChange={onResponseTabChange}
          expandHint={expandHint}
        />
      )}
    </>
  )

  return (
    <>
      <UrlBar
        method={draft.draft?.method ?? ""}
        url={draft.draft?.url ?? ""}
        params={draft.draft?.params ?? {}}
        setUrl={draft.setUrl}
        onDefocus={draft.syncUrlParams}
        focused={focus === "urlbar"}
        activeEnv={activeEnv}
      />
      {layout === "side-by-side" ? (
        <box
          style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}
        >
          {content}
        </box>
      ) : (
        content
      )}
    </>
  )
}
