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
import {
  NewRequestOverlay,
  type NewRequestOverlayHandle,
} from "./overlays/NewRequestOverlay"
import {
  NewEnvironmentOverlay,
  type NewEnvironmentOverlayHandle,
} from "./overlays/NewEnvironmentOverlay"
import {
  CloneRequestOverlay,
  type CloneRequestOverlayHandle,
} from "./overlays/CloneRequestOverlay"
import {
  NewFolderOverlay,
  type NewFolderOverlayHandle,
} from "./overlays/NewFolderOverlay"
import {
  ImportCurlOverlay,
  type ImportCurlOverlayHandle,
} from "./overlays/ImportCurlOverlay"
import {
  ExportCollectionOverlay,
  type ExportCollectionOverlayHandle,
} from "./overlays/ExportCollectionOverlay"
import {
  ImportCollectionOverlay,
  type ImportCollectionOverlayHandle,
} from "./overlays/ImportCollectionOverlay"
import type {
  Collection,
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
import { initialYamlEditorState, type YamlEditorState } from "./appState"
import type { ActiveOverlay } from "./useOverlayState"
import { buildDisplayUrl } from "./urlParams"

interface FolderPathOption {
  id: string
  label: string
}

interface AppOverlaysProps {
  keybinds: Keybinds
  helpVisible: boolean
  setHelpVisible: (visible: boolean) => void
  aboutVisible: boolean
  setAboutVisible: (visible: boolean) => void
  activeOverlay: ActiveOverlay
  envDeletePending: string | null
  collectionUnregisterPending: string | null
  undoAllPending: boolean
  reloadPending: boolean
  initPending: boolean
  collectionSwitchPending: string | null
  onConfirmDialog: () => void
  onCancelDialog: () => void
  commandPaletteVisible: boolean
  commandPaletteCommands: CommandItem[]
  setCommandPaletteVisible: (visible: boolean) => void
  codeGeneratorVisible: boolean
  setCodeGeneratorVisible: (visible: boolean) => void
  codeGeneratorRequest: NoodleRequest | null
  codeGeneratorEnv?: Environment | null
  codeGeneratorEnvName?: string
  collection: Collection | null
  requestFinderVisible: boolean
  requests: NoodleRequest[]
  onFindRequest: (item: FinderItem) => void
  setRequestFinderVisible: (visible: boolean) => void
  collectionSwitcherVisible: boolean
  collectionPaths: string[]
  collectionDir: string
  requestCollectionSwitch: (nextDir: string) => void
  setCollectionSwitcherVisible: (visible: boolean) => void
  environmentPickerVisible: boolean
  environmentNames: string[]
  activeEnvironmentName: string | null
  onSelectEnvironment: (name: string) => void
  onOpenEnvironmentEditor: () => void
  setEnvironmentPickerVisible: (visible: boolean) => void
  previewIndex: number | null
  activeIndex: number
  setPreviewIndex: (value: number | null) => void
  onThemeChange: (index: number) => void
  yamlEditor: YamlEditorState
  setYamlEditor: (state: YamlEditorState) => void
  setCollectionReloadToken: (fn: (n: number) => number) => void
  resetRequestDraft: (id: string) => void
  resetFolderDraftByPath: (path: string) => void
  setFocus: (focus: Focus) => void
  setSaveState: (state: SaveState) => void
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  newEnvironmentVisible: boolean
  newEnvironmentRef: RefObject<NewEnvironmentOverlayHandle | null>
  newEnvironmentActions: { confirm: () => void; cancel: () => void }
  newRequestVisible: boolean
  newRequestRef: RefObject<NewRequestOverlayHandle | null>
  newRequestActions: { confirm: () => void; cancel: () => void }
  newRequestInitialFolder: string
  importCurlVisible: boolean
  importCurlRef: RefObject<ImportCurlOverlayHandle | null>
  importCurlActions: { confirm: () => void; cancel: () => void }
  importCurlInitialFolder: string
  exportCollectionVisible: boolean
  exportCollectionRef: RefObject<ExportCollectionOverlayHandle | null>
  exportCollectionActions: { confirm: () => void; cancel: () => void }
  importCollectionVisible: boolean
  importCollectionRef: RefObject<ImportCollectionOverlayHandle | null>
  importCollectionPending: boolean
  importCollectionActions: { confirm: () => void; cancel: () => void }
  importCollectionInitialParent: string
  importOpenPending: { path: string; name: string } | null
  activeEnv: Environment | null
  editRequestVisible: boolean
  selectedRequest: NoodleRequest | null
  folderPaths: FolderPathOption[]
  editRequestInitialFolder: string
  editRequestRef: RefObject<NewRequestOverlayHandle | null>
  editRequestActions: { confirm: () => void; cancel: () => void }
  cloneRequestVisible: boolean
  cloneRequestRef: RefObject<CloneRequestOverlayHandle | null>
  cloneRequestActions: { confirm: () => void; cancel: () => void }
  newFolderVisible: boolean
  newFolderRef: RefObject<NewFolderOverlayHandle | null>
  newFolderActions: { confirm: () => void; cancel: () => void }
  folderDeletePending: string | null
  requestDeletePending: string | null
  timelineDetailEntry: TimelineEntry | null
  setTimelineDetailEntry: (entry: TimelineEntry | null) => void
  updateConfirm: {
    version: string
    installType: "brew" | "binary"
  } | null
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
  keybinds,
  helpVisible,
  setHelpVisible,
  aboutVisible,
  setAboutVisible,
  activeOverlay,
  envDeletePending,
  collectionUnregisterPending,
  undoAllPending,
  reloadPending,
  initPending,
  collectionSwitchPending,
  onConfirmDialog,
  onCancelDialog,
  commandPaletteVisible,
  commandPaletteCommands,
  setCommandPaletteVisible,
  codeGeneratorVisible,
  setCodeGeneratorVisible,
  codeGeneratorRequest,
  codeGeneratorEnv,
  codeGeneratorEnvName,
  collection,
  requestFinderVisible,
  requests,
  onFindRequest,
  setRequestFinderVisible,
  collectionSwitcherVisible,
  collectionPaths,
  collectionDir,
  requestCollectionSwitch,
  setCollectionSwitcherVisible,
  environmentPickerVisible,
  environmentNames,
  activeEnvironmentName,
  onSelectEnvironment,
  onOpenEnvironmentEditor,
  setEnvironmentPickerVisible,
  previewIndex,
  activeIndex,
  setPreviewIndex,
  onThemeChange,
  yamlEditor,
  setYamlEditor,
  setCollectionReloadToken,
  resetRequestDraft,
  resetFolderDraftByPath,
  setFocus,
  setSaveState,
  clearSaveTimer,
  saveTimerRef,
  newEnvironmentVisible,
  newEnvironmentRef,
  newEnvironmentActions,
  newRequestVisible,
  newRequestRef,
  newRequestActions,
  newRequestInitialFolder,
  importCurlVisible,
  importCurlRef,
  importCurlActions,
  importCurlInitialFolder,
  exportCollectionVisible,
  exportCollectionRef,
  exportCollectionActions,
  importCollectionVisible,
  importCollectionRef,
  importCollectionPending,
  importCollectionActions,
  importCollectionInitialParent,
  importOpenPending,
  activeEnv,
  editRequestVisible,
  selectedRequest,
  folderPaths,
  editRequestInitialFolder,
  editRequestRef,
  editRequestActions,
  cloneRequestVisible,
  cloneRequestRef,
  cloneRequestActions,
  newFolderVisible,
  newFolderRef,
  newFolderActions,
  folderDeletePending,
  requestDeletePending,
  timelineDetailEntry,
  setTimelineDetailEntry,
  updateConfirm,
  envColors,
  onLoadTimelineBody,
  onCopyTimelineHeaders,
  onCopyTimelineBody,
  onExportTimelineBody,
}: AppOverlaysProps) {
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
        <AboutOverlay visible onClose={() => setAboutVisible(false)} />
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
            message={`Unregister collection "${collectionUnregisterPending}"? Files will not be changed.`}
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
      {activeOverlay === "update-confirm" && updateConfirm !== null && (
        <ConfirmOverlay
          visible
          message={
            updateConfirm.installType === "brew"
              ? "Update Noodle via Homebrew?"
              : `Update Noodle to ${updateConfirm.version}?`
          }
          onConfirm={onConfirmDialog}
          onCancel={onCancelDialog}
        />
      )}
      {timelineDetailEntry !== null && (
        <TimelineDetailOverlay
          visible
          entry={timelineDetailEntry}
          onClose={() => setTimelineDetailEntry(null)}
          envColors={envColors}
          onLoadBody={(ref) => onLoadTimelineBody(timelineDetailEntry, ref)}
          onCopyHeaders={onCopyTimelineHeaders}
          onCopyBody={onCopyTimelineBody}
          onExportBody={onExportTimelineBody}
        />
      )}
    </>
  )
}
