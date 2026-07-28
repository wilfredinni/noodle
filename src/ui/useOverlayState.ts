import { useEffect, useMemo, useRef, useState } from "react"
import type { TimelineEntry } from "../schema"
import type { SaveState } from "./saveState"
import type { UpdateFlowState, YamlEditorState } from "./appState"
import { initialYamlEditorState } from "./appState"
import type { NewRequestOverlayHandle } from "./overlays/NewRequestOverlay"
import type { CloneRequestOverlayHandle } from "./overlays/CloneRequestOverlay"
import type { NewFolderOverlayHandle } from "./overlays/NewFolderOverlay"
import type { ImportCurlOverlayHandle } from "./overlays/ImportCurlOverlay"

export type ActiveOverlay =
  | "command-palette"
  | "code-generator"
  | "request-finder"
  | "help"
  | "about"
  | "theme"
  | "confirm"
  | "env-delete"
  | "undo-all"
  | "init-confirm"
  | "collection-switch-confirm"
  | "collection-switcher"
  | "yaml-editor"
  | "new-request"
  | "import-curl"
  | "edit-request"
  | "clone-request"
  | "new-folder"
  | "delete-folder"
  | "request-delete"
  | "update-confirm"
  | "timeline-detail"
  | "none"

interface UseOverlayStateProps {
  previewIndex: number | null
  saveState: SaveState
  collectionSwitcherVisible: boolean
  collectionSwitchPending: string | null
  updatePhase: UpdateFlowState["phase"]
}

export function useOverlayState({
  previewIndex,
  saveState,
  collectionSwitcherVisible,
  collectionSwitchPending,
  updatePhase,
}: UseOverlayStateProps) {
  const [helpVisible, setHelpVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [yamlEditor, setYamlEditor] = useState<YamlEditorState>(
    initialYamlEditorState,
  )
  const [envDeletePending, setEnvDeletePending] = useState<string | null>(null)
  const envDeletePendingRef = useRef(envDeletePending)
  const [newRequestVisible, setNewRequestVisible] = useState(false)
  const newRequestRef = useRef<NewRequestOverlayHandle>(null)
  const [importCurlVisible, setImportCurlVisible] = useState(false)
  const importCurlRef = useRef<ImportCurlOverlayHandle>(null)
  const [editRequestVisible, setEditRequestVisible] = useState(false)
  const editRequestRef = useRef<NewRequestOverlayHandle>(null)
  const [cloneRequestVisible, setCloneRequestVisible] = useState(false)
  const cloneRequestRef = useRef<CloneRequestOverlayHandle>(null)
  const [requestDeletePending, setRequestDeletePending] = useState<
    string | null
  >(null)
  const [newFolderVisible, setNewFolderVisible] = useState(false)
  const newFolderRef = useRef<NewFolderOverlayHandle>(null)
  const [folderDeletePending, setFolderDeletePending] = useState<string | null>(
    null,
  )
  const [undoAllPending, setUndoAllPending] = useState(false)
  const [initPending, setInitPending] = useState(false)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [codeGeneratorVisible, setCodeGeneratorVisible] = useState(false)
  const [requestFinderVisible, setRequestFinderVisible] = useState(false)
  const [timelineDetailEntry, setTimelineDetailEntry] =
    useState<TimelineEntry | null>(null)

  useEffect(() => {
    envDeletePendingRef.current = envDeletePending
  }, [envDeletePending])

  const activeOverlay = useMemo((): ActiveOverlay => {
    if (commandPaletteVisible) return "command-palette"
    if (codeGeneratorVisible) return "code-generator"
    if (requestFinderVisible) return "request-finder"
    if (helpVisible) return "help"
    if (aboutVisible) return "about"
    if (previewIndex !== null) return "theme"
    if (saveState.kind === "confirming") return "confirm"
    if (envDeletePending !== null) return "env-delete"
    if (undoAllPending) return "undo-all"
    if (initPending) return "init-confirm"
    if (collectionSwitchPending !== null) return "collection-switch-confirm"
    if (collectionSwitcherVisible) return "collection-switcher"
    if (yamlEditor.visible) return "yaml-editor"
    if (newRequestVisible) return "new-request"
    if (importCurlVisible) return "import-curl"
    if (editRequestVisible) return "edit-request"
    if (cloneRequestVisible) return "clone-request"
    if (newFolderVisible) return "new-folder"
    if (folderDeletePending !== null) return "delete-folder"
    if (requestDeletePending !== null) return "request-delete"
    if (updatePhase === "confirm") return "update-confirm"
    if (timelineDetailEntry !== null) return "timeline-detail"
    return "none"
  }, [
    commandPaletteVisible,
    codeGeneratorVisible,
    requestFinderVisible,
    helpVisible,
    aboutVisible,
    previewIndex,
    saveState.kind,
    envDeletePending,
    undoAllPending,
    initPending,
    collectionSwitchPending,
    collectionSwitcherVisible,
    yamlEditor.visible,
    newRequestVisible,
    importCurlVisible,
    editRequestVisible,
    cloneRequestVisible,
    newFolderVisible,
    folderDeletePending,
    requestDeletePending,
    updatePhase,
    timelineDetailEntry,
  ])

  return {
    activeOverlay,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
    yamlEditor,
    setYamlEditor,
    envDeletePending,
    setEnvDeletePending,
    envDeletePendingRef,
    newRequestVisible,
    setNewRequestVisible,
    newRequestRef,
    importCurlVisible,
    setImportCurlVisible,
    importCurlRef,
    editRequestVisible,
    setEditRequestVisible,
    editRequestRef,
    cloneRequestVisible,
    setCloneRequestVisible,
    cloneRequestRef,
    requestDeletePending,
    setRequestDeletePending,
    newFolderVisible,
    setNewFolderVisible,
    newFolderRef,
    folderDeletePending,
    setFolderDeletePending,
    undoAllPending,
    setUndoAllPending,
    initPending,
    setInitPending,
    commandPaletteVisible,
    setCommandPaletteVisible,
    codeGeneratorVisible,
    setCodeGeneratorVisible,
    requestFinderVisible,
    setRequestFinderVisible,
    timelineDetailEntry,
    setTimelineDetailEntry,
  } satisfies Record<string, unknown>
}

export type OverlayState = ReturnType<typeof useOverlayState>
