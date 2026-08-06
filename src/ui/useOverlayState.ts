import { useEffect, useMemo, useRef, useState } from "react"
import type { TimelineEntry } from "../schema"
import type { UpdateFlowState, YamlEditorState } from "./appState"
import { initialYamlEditorState } from "./appState"
import type { NewRequestOverlayHandle } from "./overlays/NewRequestOverlay"
import type { CloneRequestOverlayHandle } from "./overlays/CloneRequestOverlay"
import type { NewFolderOverlayHandle } from "./overlays/NewFolderOverlay"
import type { ImportCurlOverlayHandle } from "./overlays/ImportCurlOverlay"
import type { NewEnvironmentOverlayHandle } from "./overlays/NewEnvironmentOverlay"

export type ActiveOverlay =
  | "command-palette"
  | "code-generator"
  | "request-finder"
  | "help"
  | "about"
  | "theme"
  | "env-delete"
  | "undo-all"
  | "reload-confirm"
  | "init-confirm"
  | "collection-switch-confirm"
  | "collection-switcher"
  | "yaml-editor"
  | "new-environment"
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
  collectionSwitcherVisible: boolean
  collectionSwitchPending: string | null
  reloadPending: boolean
  updatePhase: UpdateFlowState["phase"]
}

export function useOverlayState({
  previewIndex,
  collectionSwitcherVisible,
  collectionSwitchPending,
  reloadPending,
  updatePhase,
}: UseOverlayStateProps) {
  const [helpVisible, setHelpVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [yamlEditor, setYamlEditor] = useState<YamlEditorState>(
    initialYamlEditorState,
  )
  const [envDeletePending, setEnvDeletePending] = useState<string | null>(null)
  const envDeletePendingRef = useRef(envDeletePending)
  const [newEnvironmentVisible, setNewEnvironmentVisible] = useState(false)
  const newEnvironmentRef = useRef<NewEnvironmentOverlayHandle>(null)
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
    if (envDeletePending !== null) return "env-delete"
    if (undoAllPending) return "undo-all"
    if (reloadPending) return "reload-confirm"
    if (initPending) return "init-confirm"
    if (collectionSwitchPending !== null) return "collection-switch-confirm"
    if (collectionSwitcherVisible) return "collection-switcher"
    if (yamlEditor.visible) return "yaml-editor"
    if (newEnvironmentVisible) return "new-environment"
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
    envDeletePending,
    undoAllPending,
    reloadPending,
    initPending,
    collectionSwitchPending,
    collectionSwitcherVisible,
    yamlEditor.visible,
    newEnvironmentVisible,
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
    newEnvironmentVisible,
    setNewEnvironmentVisible,
    newEnvironmentRef,
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
  }
}

export type OverlayState = ReturnType<typeof useOverlayState>
