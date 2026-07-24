import type { RefObject } from "react"
import { HelpOverlay } from "./overlays/HelpOverlay"
import { AboutOverlay } from "./overlays/AboutOverlay"
import { ConfirmOverlay } from "./overlays/ConfirmOverlay"
import {
  CommandPaletteOverlay,
  type CommandItem,
} from "./overlays/CommandPaletteOverlay"
import { CollectionSwitcherOverlay } from "./overlays/CollectionSwitcherOverlay"
import { RequestFinderOverlay } from "./overlays/RequestFinderOverlay"
import { ThemePickerOverlay } from "./theme"
import { YamlEditorOverlay } from "./editor/YamlEditorOverlay"
import {
  NewRequestOverlay,
  type NewRequestOverlayHandle,
} from "./overlays/NewRequestOverlay"
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
import type { Keybinds } from "./keybind"
import type { Focus } from "./focus"
import type { SaveState } from "./saveState"

interface FolderPathOption {
  id: string
  label: string
}

interface YamlEditorState {
  visible: boolean
  filePath: string
  requestName: string
  requestId: string
  kind: "request" | "folder"
  returnFocus: Focus
  folderPath: string
}

interface AppOverlaysProps {
  keybinds: Keybinds
  helpVisible: boolean
  aboutVisible: boolean
  saveState: SaveState
  envDeletePending: string | null
  undoAllPending: boolean
  initPending: boolean
  collectionSwitchPending: string | null
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
  newRequestVisible: boolean
  newRequestRef: RefObject<NewRequestOverlayHandle | null>
  importCurlVisible: boolean
  importCurlRef: RefObject<ImportCurlOverlayHandle | null>
  importCurlInitialFolder: string
  activeEnv: Environment | null
  editRequestVisible: boolean
  selectedRequest: NoodleRequest | null
  folderPaths: FolderPathOption[]
  editRequestInitialFolder: string
  editRequestRef: RefObject<NewRequestOverlayHandle | null>
  cloneRequestVisible: boolean
  cloneRequestRef: RefObject<CloneRequestOverlayHandle | null>
  newFolderVisible: boolean
  newFolderRef: RefObject<NewFolderOverlayHandle | null>
  folderDeletePending: string | null
  requestDeletePending: string | null
  timelineDetailEntry: TimelineEntry | null
  setTimelineDetailEntry: (entry: TimelineEntry | null) => void
  envColors: Record<string, string | undefined>
  onLoadTimelineBody: (
    entry: TimelineEntry,
    ref: TimelineBodyRef,
  ) => Promise<string>
  onCopyTimelineBody: (body: string) => void
  onExportTimelineBody: (
    entry: TimelineEntry,
    kind: "request" | "response",
    body: string,
  ) => Promise<void>
}

export function AppOverlays({
  keybinds,
  helpVisible,
  aboutVisible,
  saveState,
  envDeletePending,
  undoAllPending,
  initPending,
  collectionSwitchPending,
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
  newRequestVisible,
  newRequestRef,
  importCurlVisible,
  importCurlRef,
  importCurlInitialFolder,
  activeEnv,
  editRequestVisible,
  selectedRequest,
  folderPaths,
  editRequestInitialFolder,
  editRequestRef,
  cloneRequestVisible,
  cloneRequestRef,
  newFolderVisible,
  newFolderRef,
  folderDeletePending,
  requestDeletePending,
  timelineDetailEntry,
  setTimelineDetailEntry,
  envColors,
  onLoadTimelineBody,
  onCopyTimelineBody,
  onExportTimelineBody,
}: AppOverlaysProps) {
  return (
    <>
      {helpVisible && <HelpOverlay visible keybinds={keybinds} />}
      {aboutVisible && <AboutOverlay visible />}
      {saveState.kind === "confirming" && (
        <ConfirmOverlay
          visible
          message={`Save changes to ${saveState.requestId}?`}
        />
      )}
      {envDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete environment "${envDeletePending}"?`}
        />
      )}
      {undoAllPending && (
        <ConfirmOverlay visible message="Discard all unsaved changes? (y/n)" />
      )}
      {initPending && (
        <ConfirmOverlay
          visible
          message={`Initialize collection in ${collectionDir}? (y/n)`}
        />
      )}
      {collectionSwitchPending !== null && (
        <ConfirmOverlay
          visible
          message={`Switch to "${collectionSwitchPending}" and discard unsaved changes?`}
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
            setYamlEditor({
              visible: false,
              filePath: "",
              requestName: "",
              requestId: "",
              kind: "request",
              returnFocus: "sidebar",
              folderPath: "",
            })
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
            setYamlEditor({
              visible: false,
              filePath: "",
              requestName: "",
              requestId: "",
              kind: "request",
              returnFocus: "sidebar",
              folderPath: "",
            })
            setFocus(yamlEditor.returnFocus)
          }}
        />
      )}
      {newRequestVisible && (
        <NewRequestOverlay visible ref={newRequestRef} activeEnv={activeEnv} />
      )}
      {importCurlVisible && (
        <ImportCurlOverlay
          visible
          ref={importCurlRef}
          folderPaths={folderPaths}
          initialFolderPath={importCurlInitialFolder}
        />
      )}
      {editRequestVisible && (
        <NewRequestOverlay
          visible
          mode="edit"
          initialName={selectedRequest?.name}
          initialMethod={selectedRequest?.method}
          initialUrl={selectedRequest?.url}
          folderPaths={folderPaths}
          initialFolderPath={editRequestInitialFolder}
          ref={editRequestRef}
          activeEnv={activeEnv}
        />
      )}
      {cloneRequestVisible && (
        <CloneRequestOverlay
          visible
          initialName={selectedRequest ? `${selectedRequest.name} - Copy` : ""}
          ref={cloneRequestRef}
        />
      )}
      {newFolderVisible && <NewFolderOverlay visible ref={newFolderRef} />}
      {folderDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete folder "${folderDeletePending}" and all requests inside?`}
        />
      )}
      {requestDeletePending !== null && (
        <ConfirmOverlay visible message={`Delete "${requestDeletePending}"?`} />
      )}
      {timelineDetailEntry !== null && (
        <TimelineDetailOverlay
          visible
          entry={timelineDetailEntry}
          onClose={() => setTimelineDetailEntry(null)}
          envColors={envColors}
          onLoadBody={(ref) => onLoadTimelineBody(timelineDetailEntry, ref)}
          onCopyBody={onCopyTimelineBody}
          onExportBody={onExportTimelineBody}
        />
      )}
    </>
  )
}
