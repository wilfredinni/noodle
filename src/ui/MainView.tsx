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
import { EmptyState } from "./EmptyState"
import { FullBorder } from "./borders"
import type { RefObject } from "react"
import type { ResponseQueryController } from "./responseQuery"
import { extractFileErrors } from "../filestore/load"
import { CollectionErrorView } from "./CollectionErrorView"

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
  onInitialize: () => void
  onCreateRequest: () => void
  onCollectionErrorDelete?: (file: string) => void
  onCollectionErrorDirtyChange?: (dirty: boolean) => void
  collectionErrorDeleteRef?: RefObject<(() => void) | null>
  collectionErrorSaveRef?: RefObject<(() => void) | null>
  onCollectionErrorSaved: () => void
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
  onInitialize,
  onCreateRequest,
  onCollectionErrorDelete = () => {},
  onCollectionErrorDirtyChange = () => {},
  collectionErrorDeleteRef,
  collectionErrorSaveRef,
  onCollectionErrorSaved,
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

  if (mode === "empty") {
    return (
      <EmptyState
        title="Noodle"
        actionActive
        message="Initialize this collection"
        onAction={onInitialize}
      />
    )
  }

  if (error) {
    return (
      <CollectionErrorView
        collectionDir={collectionDir}
        errors={extractFileErrors(error)}
        focus={focus}
        activeEnv={activeEnv}
        onPaneFocus={onPaneFocus}
        onDelete={onCollectionErrorDelete}
        onDirtyChange={onCollectionErrorDirtyChange}
        deleteActionRef={collectionErrorDeleteRef}
        saveActionRef={collectionErrorSaveRef}
        onSaved={onCollectionErrorSaved}
      />
    )
  }

  if (!loading && !error && items.length === 0) {
    return (
      <EmptyState
        border={FullBorder}
        actionActive
        subtitle="No requests in this collection"
        message="Create request"
        onAction={onCreateRequest}
      />
    )
  }

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
            onAuthFieldChange={folderDraft.setAuthField}
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
