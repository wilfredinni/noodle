import type { RefObject } from "react"
import { HelpOverlay } from "./HelpOverlay"
import { ConfirmOverlay } from "./ConfirmOverlay"
import {
  CommandPaletteOverlay,
  type CommandItem,
} from "./CommandPaletteOverlay"
import { CollectionSwitcherOverlay } from "./CollectionSwitcherOverlay"
import { ThemePickerOverlay } from "./theme"
import { YamlEditorOverlay } from "./YamlEditorOverlay"
import {
  NewRequestOverlay,
  type NewRequestOverlayHandle,
} from "./NewRequestOverlay"
import {
  CloneRequestOverlay,
  type CloneRequestOverlayHandle,
} from "./CloneRequestOverlay"
import {
  NewFolderOverlay,
  type NewFolderOverlayHandle,
} from "./NewFolderOverlay"
import type { Environment, Request as NoodleRequest } from "../schema"
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
  returnFocus: Focus
}

interface AppOverlaysProps {
  keybinds: Keybinds
  helpVisible: boolean
  saveState: SaveState
  confirmSelection: number
  envDeletePending: string | null
  deleteConfirmSelection: number
  undoAllPending: boolean
  collectionSwitchPending: string | null
  collectionSwitchSelection: number
  commandPaletteVisible: boolean
  commandPaletteCommands: CommandItem[]
  setCommandPaletteVisible: (visible: boolean) => void
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
  setFocus: (focus: Focus) => void
  setSaveState: (state: SaveState) => void
  clearSaveTimer: () => void
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
  newRequestVisible: boolean
  newRequestRef: RefObject<NewRequestOverlayHandle | null>
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
}

export function AppOverlays({
  keybinds,
  helpVisible,
  saveState,
  confirmSelection,
  envDeletePending,
  deleteConfirmSelection,
  undoAllPending,
  collectionSwitchPending,
  collectionSwitchSelection,
  commandPaletteVisible,
  commandPaletteCommands,
  setCommandPaletteVisible,
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
  setFocus,
  setSaveState,
  clearSaveTimer,
  saveTimerRef,
  newRequestVisible,
  newRequestRef,
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
}: AppOverlaysProps) {
  return (
    <>
      {helpVisible && <HelpOverlay visible keybinds={keybinds} />}
      {saveState.kind === "confirming" && (
        <ConfirmOverlay
          visible
          message={`Save changes to ${saveState.requestId}?`}
          selectedIndex={confirmSelection}
        />
      )}
      {envDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete environment "${envDeletePending}"?`}
          selectedIndex={deleteConfirmSelection}
        />
      )}
      {undoAllPending && (
        <ConfirmOverlay
          visible
          message="Discard all unsaved changes? (y/n)"
          selectedIndex={confirmSelection}
        />
      )}
      {collectionSwitchPending !== null && (
        <ConfirmOverlay
          visible
          message={`Switch to "${collectionSwitchPending}" and discard unsaved changes?`}
          selectedIndex={collectionSwitchSelection}
        />
      )}
      {commandPaletteVisible && (
        <CommandPaletteOverlay
          visible
          commands={commandPaletteCommands}
          onClose={() => setCommandPaletteVisible(false)}
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
          onSaved={() => {
            resetRequestDraft(yamlEditor.requestId)
            setCollectionReloadToken((n) => n + 1)
            setYamlEditor({
              visible: false,
              filePath: "",
              requestName: "",
              requestId: "",
              returnFocus: "sidebar",
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
              returnFocus: "sidebar",
            })
            setFocus(yamlEditor.returnFocus)
          }}
        />
      )}
      {newRequestVisible && (
        <NewRequestOverlay visible ref={newRequestRef} activeEnv={activeEnv} />
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
          selectedIndex={0}
        />
      )}
      {requestDeletePending !== null && (
        <ConfirmOverlay
          visible
          message={`Delete "${requestDeletePending}"?`}
          selectedIndex={0}
        />
      )}
    </>
  )
}
