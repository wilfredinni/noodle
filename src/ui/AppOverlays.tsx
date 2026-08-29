import type { RefObject } from "react"
import { basename } from "node:path"
import { HelpOverlay } from "./overlays/HelpOverlay"
import { AboutOverlay } from "./overlays/AboutOverlay"
import { ConfirmOverlay } from "./overlays/ConfirmOverlay"
import {
  CommandPaletteOverlay,
  type CommandItem,
} from "./overlays/CommandPaletteOverlay"
import { CollectionSwitcherOverlay } from "./overlays/CollectionSwitcherOverlay"
import { EnvironmentPickerOverlay } from "./overlays/EnvironmentPickerOverlay"
import { RequestFinderOverlay } from "./overlays/RequestFinderOverlay"
import { ThemePickerOverlay } from "./theme"
import { YamlEditorOverlay } from "./editor/YamlEditorOverlay"
import { NewRequestOverlay } from "./overlays/NewRequestOverlay"
import { NewEnvironmentOverlay } from "./overlays/NewEnvironmentOverlay"
import { CookieFormOverlay } from "./overlays/CookieFormOverlay"
import { CloneRequestOverlay } from "./overlays/CloneRequestOverlay"
import { NewFolderOverlay } from "./overlays/NewFolderOverlay"
import { TagEditorOverlay } from "./overlays/TagEditorOverlay"
import { ImportCurlOverlay } from "./overlays/ImportCurlOverlay"
import { ExportCollectionOverlay } from "./overlays/ExportCollectionOverlay"
import { ImportCollectionOverlay } from "./overlays/ImportCollectionOverlay"
import type {
  Collection,
  CollectionSettings,
  Environment,
  Request as NoodleRequest,
  TimelineEntry,
  TimelineBodyRef,
} from "../schema"
import type { FinderItem } from "./requestFinder"
import { TimelineDetailOverlay } from "./overlays/TimelineDetailOverlay"
import { CodeGeneratorOverlay } from "./overlays/CodeGeneratorOverlay"
import { displayKey, type Keybinds } from "./keybind"
import type { Focus } from "./focus"
import type { SaveState } from "./saveState"
import { initialYamlEditorState, type UpdateFlowState } from "./appState"
import type { OverlayState } from "./useOverlayState"
import { buildDisplayUrl } from "./urlParams"
import { collectionDisplayName } from "./settings/collectionRegistry"

interface FolderPathOption {
  id: string
  label: string
}

interface AppOverlaysProps {
  /**
   * Overlay visibility, pending values, and handles owned by
   * `useOverlayState`. Passed whole so a new overlay only needs declaring
   * there and rendering here.
   */
  overlays: OverlayState
  keybinds: Keybinds
  /** Owned by `useReloadGuard`, not by the overlay state. */
  reloadPending: boolean
  /** Owned by `useCollectionSwitcher`, not by the overlay state. */
  collectionSwitchPending: string | null
  collectionSwitcherVisible: boolean
  requestCollectionSwitch: (nextDir: string) => void
  setCollectionSwitcherVisible: (visible: boolean) => void
  onConfirmDialog: () => void
  onCancelDialog: () => void
  commandPaletteCommands: CommandItem[]
  codeGeneratorRequest: NoodleRequest | null
  codeGeneratorEnv?: Environment | null
  codeGeneratorEnvName?: string
  collection: Collection | null
  requests: NoodleRequest[]
  onFindRequest: (item: FinderItem) => void
  onEditRunnerRequestTab: (
    requestId: string,
    tab: "assertions" | "captures",
  ) => void
  collectionPaths: string[]
  collectionSettingsByPath: Record<string, CollectionSettings>
  collectionDir: string
  environmentNames: string[]
  activeEnvironmentName: string | null
  onSelectEnvironment: (name: string) => void
  onOpenEnvironmentEditor: () => void
  previewIndex: number | null
  activeIndex: number
  setPreviewIndex: (value: number | null) => void
  onThemeChange: (index: number) => void
  setCollectionReloadToken: (fn: (n: number) => number) => void
  resetRequestDraft: (id: string) => void
  resetFolderDraftByPath: (path: string) => void
  setFocus: (focus: Focus) => void
  setSaveState: (state: SaveState) => void
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  newEnvironmentActions: { confirm: () => void; cancel: () => void }
  cookieFormActions: { confirm: () => void; cancel: () => void }
  newRequestActions: { confirm: () => void; cancel: () => void }
  newRequestInitialFolder: string
  importCurlActions: { confirm: () => void; cancel: () => void }
  importCurlInitialFolder: string
  exportCollectionActions: { confirm: () => void; cancel: () => void }
  importCollectionActions: { confirm: () => void; cancel: () => void }
  importCollectionInitialParent: string
  activeEnv: Environment | null
  selectedRequest: NoodleRequest | null
  folderPaths: FolderPathOption[]
  editRequestInitialFolder: string
  editRequestActions: { confirm: () => void; cancel: () => void }
  cloneRequestActions: { confirm: () => void; cancel: () => void }
  newFolderActions: { confirm: () => void; cancel: () => void }
  tagEditorActions: { confirm: () => void; cancel: () => void }
  updateFlow: UpdateFlowState
  envColors: Record<string, string | undefined>
  onLoadTimelineBody: (
    entry: TimelineEntry,
    ref: TimelineBodyRef,
  ) => Promise<string>
  onCopyTimelineHeaders: (headersText: string) => void
  onCopyTimelineBody: (body: string) => void
  onExportTimelineBody: (
    entry: TimelineEntry,
    kind: "request" | "response",
    body?: string,
  ) => Promise<void>
}

export function AppOverlays({
  overlays,
  keybinds,
  reloadPending,
  collectionSwitchPending,
  onConfirmDialog,
  onCancelDialog,
  commandPaletteCommands,
  codeGeneratorRequest,
  codeGeneratorEnv,
  codeGeneratorEnvName,
  collection,
  requests,
  onFindRequest,
  onEditRunnerRequestTab,
  collectionSwitcherVisible,
  collectionPaths,
  collectionSettingsByPath,
  collectionDir,
  requestCollectionSwitch,
  setCollectionSwitcherVisible,
  environmentNames,
  activeEnvironmentName,
  onSelectEnvironment,
  onOpenEnvironmentEditor,
  previewIndex,
  activeIndex,
  setPreviewIndex,
  onThemeChange,
  setCollectionReloadToken,
  resetRequestDraft,
  resetFolderDraftByPath,
  setFocus,
  setSaveState,
  clearSaveTimer,
  saveTimerRef,
  newEnvironmentActions,
  cookieFormActions,
  newRequestActions,
  newRequestInitialFolder,
  importCurlActions,
  importCurlInitialFolder,
  exportCollectionActions,
  importCollectionActions,
  importCollectionInitialParent,
  activeEnv,
  selectedRequest,
  folderPaths,
  editRequestInitialFolder,
  editRequestActions,
  cloneRequestActions,
  newFolderActions,
  tagEditorActions,
  updateFlow,
  envColors,
  onLoadTimelineBody,
  onCopyTimelineHeaders,
  onCopyTimelineBody,
  onExportTimelineBody,
}: AppOverlaysProps) {
  const {
    activeOverlay,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
    envDeletePending,
    collectionUnregisterPending,
    undoAllPending,
    initPending,
    importOpenPending,
    commandPaletteVisible,
    setCommandPaletteVisible,
    codeGeneratorVisible,
    setCodeGeneratorVisible,
    requestFinderVisible,
    setRequestFinderVisible,
    environmentPickerVisible,
    setEnvironmentPickerVisible,
    yamlEditor,
    setYamlEditor,
    newEnvironmentVisible,
    newEnvironmentRef,
    cookieFormVisible,
    cookieFormRef,
    cookieFormInitial,
    cookieDeletePending,
    newRequestVisible,
    newRequestRef,
    importCurlVisible,
    importCurlRef,
    exportCollectionVisible,
    exportCollectionRef,
    importCollectionVisible,
    importCollectionRef,
    importCollectionPending,
    editRequestVisible,
    editRequestRef,
    cloneRequestVisible,
    cloneRequestRef,
    newFolderVisible,
    newFolderRef,
    tagEditPending,
    tagEditorRef,
    folderDeletePending,
    requestDeletePending,
    runnerDetail,
    setRunnerDetail,
    timelineDetailEntry,
    setTimelineDetailEntry,
  } = overlays

  const detailEntry = runnerDetail?.entry ?? timelineDetailEntry

  return (
    <>
      {helpVisible && (
        <HelpOverlay
          visible
          keybinds={keybinds}
          onClose={() => setHelpVisible(false)}
        />
      )}
      {aboutVisible && (
        <AboutOverlay
          visible
          updateFlow={updateFlow}
          onClose={() => setAboutVisible(false)}
        />
      )}
      {activeOverlay === "env-delete" && envDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete environment "${envDeletePending}"?`}
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {activeOverlay === "collection-unregister" &&
        collectionUnregisterPending !== null && (
          <ConfirmOverlay
            visible
            message={`Unregister collection "${collectionDisplayName(
              collectionUnregisterPending,
              collectionSettingsByPath[collectionUnregisterPending],
            )}"? Files will not be changed.`}
            onConfirm={onConfirmDialog}
            onCancel={onCancelDialog}
          />
        )}
      {activeOverlay === "undo-all" && undoAllPending && (
        <ConfirmOverlay
          visible
          message="Discard all unsaved changes? (y/n)"
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {activeOverlay === "reload-confirm" && reloadPending && (
        <ConfirmOverlay
          visible
          message="Reload collection and discard unsaved changes? (y/n)"
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {activeOverlay === "init-confirm" && initPending && (
        <ConfirmOverlay
          visible
          message={`Initialize collection in ${collectionDir}? (y/n)`}
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {activeOverlay === "collection-switch-confirm" &&
        collectionSwitchPending !== null && (
          <ConfirmOverlay
            visible
            message={`Switch to "${collectionSwitchPending}" and discard unsaved changes?`}
            onConfirm={onConfirmDialog}
            onCancel={onCancelDialog}
          />
        )}
      {activeOverlay === "import-open-confirm" &&
        importOpenPending !== null && (
          <ConfirmOverlay
            visible
            message={`Imported "${importOpenPending.name}". Open it now?`}
            onConfirm={onConfirmDialog}
            onCancel={onCancelDialog}
          />
        )}
      {commandPaletteVisible && (
        <CommandPaletteOverlay
          visible
          commands={commandPaletteCommands}
          onClose={() => setCommandPaletteVisible(false)}
        />
      )}
      {codeGeneratorVisible && codeGeneratorRequest && (
        <CodeGeneratorOverlay
          visible
          request={codeGeneratorRequest}
          collection={collection ?? undefined}
          env={codeGeneratorEnv ?? undefined}
          envName={codeGeneratorEnvName}
          onClose={() => setCodeGeneratorVisible(false)}
        />
      )}
      {requestFinderVisible && (
        <RequestFinderOverlay
          visible
          collectionItems={collection?.items}
          requests={requests}
          activeEnv={activeEnv}
          onSelect={onFindRequest}
          onClose={() => setRequestFinderVisible(false)}
        />
      )}
      {collectionSwitcherVisible && (
        <CollectionSwitcherOverlay
          visible
          collections={collectionPaths}
          collectionSettingsByPath={collectionSettingsByPath}
          activeCollectionDir={collectionDir}
          onSelect={requestCollectionSwitch}
          onClose={() => setCollectionSwitcherVisible(false)}
        />
      )}
      {environmentPickerVisible && (
        <EnvironmentPickerOverlay
          visible
          environments={environmentNames}
          activeEnvironment={activeEnvironmentName}
          editorShortcut={displayKey(keybinds.env_editor)}
          onSelect={onSelectEnvironment}
          onOpenEditor={onOpenEnvironmentEditor}
          onClose={() => setEnvironmentPickerVisible(false)}
        />
      )}
      {previewIndex !== null && (
        <ThemePickerOverlay
          visible
          activeIndex={activeIndex}
          previewIndex={previewIndex}
          setPreviewIndex={setPreviewIndex}
          onThemeChange={onThemeChange}
        />
      )}
      {yamlEditor.visible && (
        <YamlEditorOverlay
          visible
          filePath={yamlEditor.filePath}
          requestName={yamlEditor.requestName}
          saveKey={keybinds.request_save}
          activeEnv={activeEnv}
          kind={yamlEditor.kind}
          onSaved={() => {
            if (yamlEditor.kind === "folder") {
              resetFolderDraftByPath(yamlEditor.folderPath)
            } else {
              resetRequestDraft(yamlEditor.requestId)
            }
            setCollectionReloadToken((n) => n + 1)
            setYamlEditor(initialYamlEditorState)
            setFocus(yamlEditor.returnFocus)
            setSaveState({
              kind: "success",
              message: `Successfully edited ${yamlEditor.filePath.split("/").pop() ?? ""}`,
            })
            clearSaveTimer()
            saveTimerRef.current = setTimeout(() => {
              setSaveState({ kind: "idle" })
            }, 2000)
          }}
          onClose={() => {
            setYamlEditor(initialYamlEditorState)
            setFocus(yamlEditor.returnFocus)
          }}
        />
      )}
      {newEnvironmentVisible && (
        <NewEnvironmentOverlay
          visible
          ref={newEnvironmentRef}
          onConfirm={newEnvironmentActions.confirm}
          onClose={newEnvironmentActions.cancel}
        />
      )}
      {cookieFormVisible && (
        <CookieFormOverlay
          visible
          ref={cookieFormRef}
          initial={cookieFormInitial}
          onConfirm={cookieFormActions.confirm}
          onClose={cookieFormActions.cancel}
        />
      )}
      {activeOverlay === "cookie-delete" && cookieDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={
            cookieDeletePending.kind === "cookie"
              ? `Delete cookie "${cookieDeletePending.name}" from ${cookieDeletePending.domain}?`
              : cookieDeletePending.kind === "domain"
                ? `Delete all cookies for ${cookieDeletePending.domain}?`
                : cookieDeletePending.kind === "reset"
                  ? "Back up unreadable cookie storage and reset the jar? (y/n)"
                  : "Clear the entire cookie jar? (y/n)"
          }
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {newRequestVisible && (
        <NewRequestOverlay
          visible
          ref={newRequestRef}
          activeEnv={activeEnv}
          folderPaths={folderPaths}
          initialFolderPath={newRequestInitialFolder}
          onConfirm={newRequestActions.confirm}
          onClose={newRequestActions.cancel}
        />
      )}
      {importCurlVisible && (
        <ImportCurlOverlay
          visible
          ref={importCurlRef}
          folderPaths={folderPaths}
          initialFolderPath={importCurlInitialFolder}
          onConfirm={importCurlActions.confirm}
          onClose={importCurlActions.cancel}
        />
      )}
      {exportCollectionVisible && (
        <ExportCollectionOverlay
          visible
          ref={exportCollectionRef}
          collectionName={
            collection?.name ?? (basename(collectionDir) || "collection")
          }
          onConfirm={exportCollectionActions.confirm}
          onClose={exportCollectionActions.cancel}
        />
      )}
      {importCollectionVisible && (
        <ImportCollectionOverlay
          visible
          ref={importCollectionRef}
          initialParentDir={importCollectionInitialParent}
          pending={importCollectionPending}
          onConfirm={importCollectionActions.confirm}
          onClose={importCollectionActions.cancel}
        />
      )}
      {editRequestVisible && (
        <NewRequestOverlay
          visible
          mode="edit"
          initialName={selectedRequest?.name}
          initialMethod={selectedRequest?.method}
          initialUrl={
            selectedRequest
              ? buildDisplayUrl(selectedRequest.url, selectedRequest.params)
              : undefined
          }
          initialPathParams={selectedRequest?.pathParams}
          folderPaths={folderPaths}
          initialFolderPath={editRequestInitialFolder}
          ref={editRequestRef}
          activeEnv={activeEnv}
          onConfirm={editRequestActions.confirm}
          onClose={editRequestActions.cancel}
        />
      )}
      {cloneRequestVisible && (
        <CloneRequestOverlay
          visible
          initialName={selectedRequest ? `${selectedRequest.name} - Copy` : ""}
          ref={cloneRequestRef}
          onConfirm={cloneRequestActions.confirm}
          onClose={cloneRequestActions.cancel}
        />
      )}
      {newFolderVisible && (
        <NewFolderOverlay
          visible
          ref={newFolderRef}
          onConfirm={newFolderActions.confirm}
          onClose={newFolderActions.cancel}
        />
      )}
      {tagEditPending !== null && (
        <TagEditorOverlay
          visible
          ref={tagEditorRef}
          initialValue={tagEditPending.value}
          onConfirm={tagEditorActions.confirm}
          onClose={tagEditorActions.cancel}
        />
      )}
      {activeOverlay === "delete-folder" && folderDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete folder "${folderDeletePending}" and all requests inside?`}
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {activeOverlay === "request-delete" && requestDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete "${requestDeletePending}"?`}
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {detailEntry !== null && (
        <TimelineDetailOverlay
          visible
          entry={detailEntry}
          onClose={() => {
            if (runnerDetail) setRunnerDetail(null)
            else setTimelineDetailEntry(null)
          }}
          initialTab={runnerDetail ? "response" : "request"}
          execution={runnerDetail?.execution}
          request={runnerDetail?.request}
          showCaptures={runnerDetail !== null}
          captureLifetimeNote={
            runnerDetail
              ? "Available to later requests in this collection run."
              : undefined
          }
          warnings={runnerDetail?.warnings}
          onEditAssertions={
            runnerDetail
              ? () => {
                  const requestId = runnerDetail.entry.request.id
                  setRunnerDetail(null)
                  onEditRunnerRequestTab(requestId, "assertions")
                }
              : undefined
          }
          onEditCaptures={
            runnerDetail
              ? () => {
                  const requestId = runnerDetail.entry.request.id
                  setRunnerDetail(null)
                  onEditRunnerRequestTab(requestId, "captures")
                }
              : undefined
          }
          envColors={envColors}
          onLoadBody={(ref) => onLoadTimelineBody(detailEntry, ref)}
          onCopyHeaders={onCopyTimelineHeaders}
          onCopyBody={onCopyTimelineBody}
          onExportBody={onExportTimelineBody}
        />
      )}
    </>
  )
}
