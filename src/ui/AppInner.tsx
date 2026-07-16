import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { resolve } from "node:path"
import { useKeymap } from "@opentui/keymap/react"
import { MainView } from "./MainView"
import { EnvironmentEditorView } from "./env-editor/EnvironmentEditorView"
import { AppOverlays } from "./AppOverlays"
import { useCollection } from "../hooks/useCollection"
import { useTreeNavigation } from "../hooks/useTreeNavigation"
import { deriveRequestParentFolder, getFolderPaths } from "./tree"
import { useResponse } from "../hooks/useResponse"
import type { SendCompleteResult } from "../hooks/useResponse"
import type { Request as NoodleRequest, Method, TimelineEntry } from "../schema"
import { useRequestDraft } from "../hooks/useRequestDraft"
import { useEditBrowse } from "../hooks/useEditBrowse"
import { useFolderDraft } from "../hooks/useFolderDraft"
import { useFolderEditBrowse } from "../hooks/useFolderEditBrowse"
import { useEnvironments } from "../hooks/useEnvironments"
import { useEnvironmentEditor } from "../hooks/useEnvironmentEditor"
import { type Focus, type UrlBarSubFocus } from "./focus"
import { type NewRequestOverlayHandle } from "./overlays/NewRequestOverlay"
import { type CloneRequestOverlayHandle } from "./overlays/CloneRequestOverlay"
import { type NewFolderOverlayHandle } from "./overlays/NewFolderOverlay"
import { buildCommandPaletteCommands } from "./commands"
import { useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import { showToast } from "./Toast"
import { type EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"

import { type Keybinds, displayKey } from "./keybind"
import { useSaveFile } from "./useSaveFile"
import { useAppKeymap } from "./useAppKeymap"
import { useRenderer } from "./RendererContext"
import { useOverlayIntercepts } from "./useOverlayIntercepts"
import { useCollectionFileActions } from "./useCollectionFileActions"
import { useTimeline } from "./timeline/useTimeline"
import { buildTimelineEntry } from "./timeline/formatTimeline"
import { substitute } from "../requests"
import type { SubstitutedRequest } from "../requests/substitute"
import { getRequestIds, findFolderByPath } from "./tree"
import { useUIState } from "./tabs/useUIState"
import {
  saveLastRequest,
  loadExpandedFolders,
  saveExpandedFolders,
} from "./tabs/uiState"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import { VariableCompletionInterceptor } from "./variable-completion/variableCompletionInterceptor"

export function AppInner({
  collectionDir,
  environmentsDir,
  envNames,
  envColors,
  initialEnvName,
  activeIndex,
  previewIndex,
  setPreviewIndex: setPreviewIndexProp,
  onThemeChange,
  keybinds,
  initialLayout,
  confirmUndoAll,
  onLayoutChange,
  onEnvChange,
  onEnvListChanged,
  settingsEnv,
  initialLastRequestId,
  collectionPaths,
  onCollectionChange,
  onReloadCollection,
  onCollectionBootstrapped,
  mode = "empty",
}: {
  collectionDir: string
  environmentsDir: string
  envNames: string[]
  envColors: Record<string, string | undefined>
  initialEnvName?: string
  activeIndex: number
  previewIndex: number | null
  setPreviewIndex: Dispatch<SetStateAction<number | null>>
  onThemeChange: (index: number) => void
  keybinds: Keybinds
  initialLayout: "stacked" | "side-by-side"
  confirmUndoAll: boolean
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  onEnvChange: (name: string | null) => void
  onEnvListChanged: () => Promise<void>
  settingsEnv?: string
  initialLastRequestId?: string
  collectionPaths: string[]
  onCollectionChange: (collectionDir: string) => void
  onReloadCollection: () => void
  onCollectionBootstrapped: (collectionDir: string) => void
  mode?: "collection" | "browse" | "empty" | "invalid"
}) {
  const keymap = useKeymap()
  const theme = useTheme()

  // ── State ───────────────────────────────────────────────────────────
  const [focus, setFocus] = useState<Focus>("sidebar")
  const [urlbarSubFocus, setUrlbarSubFocus] = useState<UrlBarSubFocus>("select")
  const urlbarSubFocusRef = useRef(urlbarSubFocus)
  urlbarSubFocusRef.current = urlbarSubFocus
  const focusRef = useRef(focus)
  focusRef.current = focus
  const [view, setView] = useState<"main" | "env-editor">("main")
  const viewRef = useRef(view)
  viewRef.current = view
  const [helpVisible, setHelpVisible] = useState(false)
  const [aboutVisible, setAboutVisible] = useState(false)
  const [layout, setLayout] = useState<"stacked" | "side-by-side">(
    initialLayout,
  )
  const [expanded, setExpanded] = useState<"request" | "response" | null>(null)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [confirmSelection, setConfirmSelection] = useState(0)
  const [collectionReloadToken, setCollectionReloadToken] = useState(0)
  const [, setSelectOpen] = useState(false)
  const [yamlEditor, setYamlEditor] = useState<{
    visible: boolean
    filePath: string
    requestName: string
    requestId: string
    kind: "request" | "folder"
    returnFocus: Focus
    folderPath: string
  }>({
    visible: false,
    filePath: "",
    requestName: "",
    requestId: "",
    kind: "request",
    returnFocus: "sidebar",
    folderPath: "",
  })

  const [envDeletePending, setEnvDeletePending] = useState<string | null>(null)
  const envDeletePendingRef = useRef(envDeletePending)
  useEffect(() => {
    envDeletePendingRef.current = envDeletePending
  }, [envDeletePending])
  const [deleteConfirmSelection, setDeleteConfirmSelection] = useState(0)
  const [newRequestVisible, setNewRequestVisible] = useState(false)
  const newRequestRef = useRef<NewRequestOverlayHandle>(null)
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
  const folderDeletePathRef = useRef<string | null>(null)
  const [undoAllPending, setUndoAllPending] = useState(false)
  const [initPending, setInitPending] = useState(false)
  const [initConfirmSelection, setInitConfirmSelection] = useState(0)
  const [commandPaletteVisible, setCommandPaletteVisible] = useState(false)
  const [timelineDetailEntry, setTimelineDetailEntry] =
    useState<TimelineEntry | null>(null)
  const [collectionSwitcherVisible, setCollectionSwitcherVisible] =
    useState(false)
  const [collectionSwitchPending, setCollectionSwitchPending] = useState<
    string | null
  >(null)
  const [collectionSwitchSelection, setCollectionSwitchSelection] = useState(0)
  const [initialExpandedFolders, setInitialExpandedFolders] =
    useState<Set<string> | null>(null)
  const headerFieldRef = useRef<"name" | "color">("name")

  // ── Collection ──────────────────────────────────────────────────────
  const isCollection = mode === "collection"
  const isBrowse = mode === "browse"
  const isReadOnly = mode !== "collection"
  const skipCollection = mode === "empty"
  const { collection, loading, error, updateCollection } = useCollection(
    collectionDir,
    collectionReloadToken,
    skipCollection,
    isBrowse,
  )
  const items = collection?.items ?? []

  const requestIds = useMemo(() => getRequestIds(items), [items])
  const { getTab, setTab } = useUIState(collectionDir, requestIds, isReadOnly)

  useEffect(() => {
    if (!isCollection) return
    loadExpandedFolders(collectionDir).then(setInitialExpandedFolders)
  }, [collectionDir, isCollection])

  // ── Sidebar selection + request draft + edit-browse ─────────────────
  const {
    selectedId,
    selectedRequest,
    expanded: expandedFolders,
    visibleItems,
    cursorIndex,
    focusedFolderPath,
    focusedFolderName,
    setSelectedId,
    expandFolder,
  } = useTreeNavigation(
    items,
    () => focus === "sidebar" && keymap.getData("app.overlay") === "none",
    initialLastRequestId,
    initialExpandedFolders ?? undefined,
  )

  const focusedFolder = useMemo(
    () =>
      focusedFolderPath ? findFolderByPath(items, focusedFolderPath) : null,
    [focusedFolderPath, items],
  )

  const requestParentFolder = useMemo(
    () => deriveRequestParentFolder(focusedFolderPath, selectedId),
    [focusedFolderPath, selectedId],
  )
  const newRequestFolderRef = useRef(requestParentFolder)
  newRequestFolderRef.current = requestParentFolder

  const folderPaths = useMemo(() => {
    if (!collection) return []
    return getFolderPaths(collection.items).map((f) => ({
      id: f.path,
      label: f.path === "" ? "(root)" : f.name,
    }))
  }, [collection])

  const editRequestInitialFolder = useMemo(() => {
    const req = selectedRequest
    if (!req || !req.id.includes("/")) return ""
    return req.id.slice(0, req.id.lastIndexOf("/"))
  }, [selectedRequest])

  const focusedFolderPathRef = useRef(focusedFolderPath)
  focusedFolderPathRef.current = focusedFolderPath
  const focusedFolderNameRef = useRef(focusedFolderName)
  focusedFolderNameRef.current = focusedFolderName

  // ── Folder draft + edit-browse ────────────────────────────────────
  const folderDraft = useFolderDraft(focusedFolder)
  const folderEb = useFolderEditBrowse(folderDraft.folderDraft, folderDraft)
  const folderEbRef = useRef(folderEb)
  folderEbRef.current = folderEb

  const folderDraftRef = useRef(folderDraft)
  folderDraftRef.current = folderDraft

  useEffect(() => {
    setExpanded(null)
  }, [selectedRequest?.id])

  const saveLastReqRef = useRef(false)
  const saveLastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isCollection) return
    if (!saveLastReqRef.current) {
      saveLastReqRef.current = true
      return
    }
    const lastId = focusedFolderPath ? `${focusedFolderPath}/` : selectedId
    if (!lastId) return
    if (saveLastDebounceRef.current) clearTimeout(saveLastDebounceRef.current)
    saveLastDebounceRef.current = setTimeout(() => {
      saveLastRequest(collectionDir, lastId, new Set(requestIds)).catch(
        (e: unknown) => {
          console.error("Failed to save last request:", e)
        },
      )
    }, 200)
    return () => {
      if (saveLastDebounceRef.current) clearTimeout(saveLastDebounceRef.current)
    }
  }, [selectedId, focusedFolderPath, isCollection])

  const expandedSaveRef = useRef(false)
  const expandedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isCollection) return
    if (!expandedSaveRef.current) {
      expandedSaveRef.current = true
      return
    }
    if (expandedDebounceRef.current) clearTimeout(expandedDebounceRef.current)
    expandedDebounceRef.current = setTimeout(() => {
      saveExpandedFolders(collectionDir, expandedFolders).catch(
        (e: unknown) => {
          console.error("Failed to save expanded folders:", e)
        },
      )
    }, 300)
    return () => {
      if (expandedDebounceRef.current) clearTimeout(expandedDebounceRef.current)
    }
  }, [expandedFolders, collectionDir, isCollection])

  const draft = useRequestDraft(selectedRequest)

  const tabPrefs = getTab(selectedRequest?.id ?? "")
  const initialRequestTab = tabPrefs?.requestTab
  const initialResponseTab = tabPrefs?.responseTab

  const onRequestTabChange = useCallback(
    (tab: FieldKind) => {
      if (selectedRequest?.id) setTab(selectedRequest.id, "request", tab)
    },
    [selectedRequest?.id, setTab],
  )

  const onResponseTabChange = useCallback(
    (tab: ResponseTabKind) => {
      if (selectedRequest?.id) setTab(selectedRequest.id, "response", tab)
    },
    [selectedRequest?.id, setTab],
  )

  const eb = useEditBrowse(draft.draft, draft, {
    initialTab: initialRequestTab,
    onTabChange: onRequestTabChange,
  })

  // ── Save logic (provides saveState needed by keymap.setData below) ──
  const {
    saveState,
    setSaveState,
    doSave,
    clearSaveTimer,
    savingRef,
    saveTimerRef,
  } = useSaveFile(
    collectionDir,
    draft.draft,
    selectedRequest?.id,
    draft.markSaved,
  )

  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave

  useEffect(() => {
    if (saveState.kind === "success" || saveState.kind === "error") {
      showToast(saveState.message, saveState.kind)
    }
  }, [saveState])

  const folderSaveRef = useRef<() => void>(() => {})

  const {
    handleFolderSave,
    handleNewRequestConfirm,
    handleCloneRequestConfirm,
    handleNewFolderConfirm,
    handleFolderDeleteConfirm,
    handleEditRequestConfirm,
    handleRequestDeleteConfirm,
    executeInitPending,
  } = useCollectionFileActions({
    collection,
    collectionDir,
    updateCollection,
    selectedRequest,
    folderDraftRef,
    newRequestFolderRef,
    folderDeletePathRef,
    setCollectionReloadToken,
    setFocus,
    setSaveState,
    clearSaveTimer,
    saveTimerRef,
    setSelectedId,
    expandFolder,
    setNewRequestVisible,
    setCloneRequestVisible,
    setNewFolderVisible,
    setEditRequestVisible,
    setRequestDeletePending,
    setFolderDeletePending,
    onCollectionBootstrapped,
  })

  folderSaveRef.current = handleFolderSave

  // ── keymap.setData effects ─────────────────────────────────────────
  const activeOverlay = useMemo(() => {
    if (commandPaletteVisible) return "command-palette"
    if (helpVisible) return "help"
    if (aboutVisible) return "about"
    if (previewIndex !== null) return "theme"
    if (saveState.kind === "confirming") return "confirm"
    if (undoAllPending) return "undo-all"
    if (initPending) return "init-confirm"
    if (collectionSwitchPending !== null) return "collection-switch-confirm"
    if (collectionSwitcherVisible) return "collection-switcher"
    if (yamlEditor.visible) return "yaml-editor"
    if (newRequestVisible) return "new-request"
    if (editRequestVisible) return "edit-request"
    if (cloneRequestVisible) return "clone-request"
    if (newFolderVisible) return "new-folder"
    if (folderDeletePending !== null) return "delete-folder"
    if (requestDeletePending !== null) return "request-delete"
    if (timelineDetailEntry !== null) return "timeline-detail"
    return "none"
  }, [
    commandPaletteVisible,
    helpVisible,
    aboutVisible,
    previewIndex,
    saveState.kind,
    undoAllPending,
    initPending,
    collectionSwitchPending,
    collectionSwitcherVisible,
    yamlEditor.visible,
    newRequestVisible,
    editRequestVisible,
    cloneRequestVisible,
    newFolderVisible,
    folderDeletePending,
    requestDeletePending,
    timelineDetailEntry,
  ])

  useEffect(() => {
    keymap.setData("app.focus", focus)
    if (focus === "env-header") {
      headerFieldRef.current = "name"
    }
  }, [focus, keymap])

  useEffect(() => {
    keymap.setData("app.overlay", activeOverlay)
  }, [activeOverlay, keymap])

  useEffect(() => {
    keymap.setData("app.view", view)
  }, [view, keymap])

  // ── Environments + response ────────────────────────────────────────
  const envState = useEnvironments(
    environmentsDir,
    envNames,
    initialEnvName,
    settingsEnv,
    onEnvChange,
  )
  const envNameRef = useRef(envState.activeEnv?.name)
  useEffect(() => {
    envNameRef.current = envState.activeEnv?.name
  }, [envState.activeEnv?.name])

  const timeline = useTimeline(
    isCollection ? collectionDir : undefined,
    selectedRequest?.id,
  )
  const timelineAppendRef = useRef(timeline.appendEntry)
  timelineAppendRef.current = timeline.appendEntry

  const onCompleteRef = useRef(
    (_req: NoodleRequest, _result: SendCompleteResult) => {},
  )
  onCompleteRef.current = (req: NoodleRequest, result: SendCompleteResult) => {
    let substituted: SubstitutedRequest | undefined
    const activeEnv = envStateRef.current.activeEnv
    if (activeEnv) {
      try {
        substituted = substitute(req, activeEnv)
      } catch {
        substituted = undefined
      }
    }
    timelineAppendRef.current(
      buildTimelineEntry(req, result, envNameRef.current, substituted),
    )
  }

  const {
    state: responseState,
    trySend,
    cancelSend,
  } = useResponse(
    draft.draft,
    envState.activeEnv,
    onCompleteRef.current,
    collection ?? undefined,
    draft.draft?.id,
  )

  const responseStateRef = useRef(responseState)
  responseStateRef.current = responseState

  const envEditor = useEnvironmentEditor({
    environmentsDir,
    envNames,
    activeEnvName: envState.activeEnv?.name,
    onEnvsChanged: onEnvListChanged,
    onActiveEnvChanged: (name: string) => {
      if (name === "") {
        onEnvChange(null)
      } else {
        onEnvChange(name)
      }
    },
    onEnvDataChanged: () => {
      envStateRef.current.reloadActiveEnv().catch(() => {})
    },
  })

  // ── Sync edit mode to keymap ───────────────────────────────────────
  useEffect(() => {
    const requestMode =
      eb.editState.mode === "browsing"
        ? "browse"
        : eb.editState.mode === "editing"
          ? "edit"
          : "base"
    const folderMode =
      folderEb.editState.mode === "browsing"
        ? "browse"
        : folderEb.editState.mode === "editing"
          ? "edit"
          : "base"
    const envEditMode =
      envEditor.editState.mode === "browsing"
        ? "browse"
        : envEditor.editState.mode === "editing"
          ? "edit"
          : "base"
    if (view === "env-editor" && focus === "env-vars") {
      keymap.setData("app.mode", envEditMode)
    } else if (focus === "folder") {
      keymap.setData("app.mode", folderMode)
    } else {
      keymap.setData("app.mode", requestMode)
    }
  }, [
    eb.editState.mode,
    folderEb.editState.mode,
    envEditor.editState.mode,
    focus,
    view,
    keymap,
  ])

  useEffect(() => {
    if (focus !== "request") {
      const state = eb.editState
      if (state.mode === "editing") eb.cancelEdit()
      else if (state.mode === "browsing") eb.exitBrowse()
    }
    if (focus !== "folder") {
      const state = folderEb.editState
      if (state.mode === "editing") folderEb.cancelEdit()
      else if (state.mode === "browsing") folderEb.exitBrowse()
    }
    if (focus !== "env-vars") {
      const state = envEditor.editState
      if (state.mode === "editing") envEditor.cancelEdit()
      else if (state.mode === "browsing") envEditor.exitBrowse()
    }
  }, [focus, eb, folderEb, envEditor])

  useEffect(() => {
    if (focus === "folder" && folderEb.editState.mode === "inactive") {
      folderEb.enterBrowse()
    }
    if (focus === "env-vars" && envEditor.editState.mode === "inactive") {
      envEditor.enterBrowse()
    }
  }, [focus, folderEb, envEditor])

  // ── Refs for keymap/intercepts ─────────────────────────────────────
  const trySendRef = useRef(trySend)
  trySendRef.current = trySend

  const cancelSendRef = useRef(cancelSend)
  cancelSendRef.current = cancelSend

  const envStateRef = useRef(envState)
  envStateRef.current = envState

  const envEditorRef = useRef(envEditor)
  envEditorRef.current = envEditor

  const envHeaderRef = useRef<EnvHeaderPaneHandle>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft

  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const ebRef = useRef(eb)
  ebRef.current = eb

  const collectionRef = useRef(collection)
  collectionRef.current = collection

  const modeRef = useRef<"collection" | "browse" | "empty" | "invalid">(mode)
  modeRef.current = mode

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const folderViewRef = useRef(false)
  folderViewRef.current = focusedFolder !== null

  const collectionDirRef = useRef(collectionDir)
  collectionDirRef.current = collectionDir

  const requestCollectionSwitch = useCallback(
    (nextDir: string) => {
      const normalized = resolve(nextDir)
      setCollectionSwitcherVisible(false)
      if (normalized === collectionDirRef.current) {
        setCollectionSwitchPending(null)
        setCollectionSwitchSelection(0)
        return
      }
      if (draft.isDirty || folderDraft.isDirty || envEditor.dirty) {
        setCollectionSwitchPending(normalized)
        setCollectionSwitchSelection(0)
        return
      }
      setCollectionSwitchPending(null)
      setCollectionSwitchSelection(0)
      onCollectionChange(normalized)
    },
    [draft.isDirty, folderDraft.isDirty, envEditor.dirty, onCollectionChange],
  )

  const confirmCollectionSwitch = useCallback(
    (nextDir: string) => {
      setCollectionSwitchPending(null)
      setCollectionSwitchSelection(0)
      setCollectionSwitcherVisible(false)
      onCollectionChange(nextDir)
    },
    [onCollectionChange],
  )

  // ── Keymap layers ──────────────────────────────────────────────────
  useAppKeymap(
    keybinds,
    {
      ebRef,
      draftRef,
      envStateRef,
      envEditorRef,
      collectionRef,
      selectedIdRef,
      trySendRef,
      doSaveRef,
      focusRef,
      urlbarSubFocusRef,
      viewRef,
      activeIndexRef,
      savingRef,
      expandedRef,
      folderViewRef,
      folderSaveRef,
      folderEbRef,
      folderDraftRef,
      focusedFolderPathRef,
      focusedFolderNameRef,
      folderDeletePathRef,
      responseStateRef,
      modeRef,
    },
    {
      setFocus,
      setUrlbarSubFocus,
      setHelpVisible,
      setLayout,
      setView,
      setYamlEditor,
      setCollectionReloadToken,
      setPreviewIndex: setPreviewIndexProp,
      setEnvDeletePending,
      setDeleteConfirmSelection,
      setNewRequestVisible,
      setEditRequestVisible,
      setCloneRequestVisible,
      setRequestDeletePending,
      setNewFolderVisible,
      setFolderDeletePending,
      setUndoAllPending,
      setCommandPaletteVisible,
      setCollectionSwitcherVisible,
      onLayoutChange,
      setExpanded,
    },
    collectionDir,
    confirmUndoAll,
  )

  // ── Overlay intercepts ────────────────────────────────────────────
  useOverlayIntercepts({
    cancelSendRef,
    saveState,
    confirmSelection,
    setConfirmSelection,
    setSaveState,
    doSave,
    envDeletePending,
    envDeletePendingRef,
    setEnvDeletePending,
    deleteConfirmSelection,
    setDeleteConfirmSelection,
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    helpVisible,
    setHelpVisible,
    aboutVisible,
    setAboutVisible,
    view,
    setView,
    focusRef,
    setFocus,
    envHeaderRef,
    headerFieldRef,
    newRequestVisible,
    newRequestRef,
    setNewRequestVisible,
    onNewRequestConfirm: (v) =>
      handleNewRequestConfirm(v.name, v.method as Method, v.url),
    editRequestVisible,
    editRequestRef,
    setEditRequestVisible,
    onEditRequestConfirm: (v) =>
      handleEditRequestConfirm(v.name, v.method as Method, v.url, v.folderPath),
    cloneRequestVisible,
    cloneRequestRef,
    setCloneRequestVisible,
    onCloneRequestConfirm: handleCloneRequestConfirm,
    requestDeletePending,
    setRequestDeletePending,
    onRequestDeleteConfirm: handleRequestDeleteConfirm,
    newFolderVisible,
    newFolderRef,
    setNewFolderVisible,
    onNewFolderConfirm: handleNewFolderConfirm,
    folderDeletePending,
    setFolderDeletePending,
    onFolderDeleteConfirm: handleFolderDeleteConfirm,
    collectionSwitchPending,
    collectionSwitchSelection,
    setCollectionSwitchSelection,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm: confirmCollectionSwitch,
    undoAllPending,
    setUndoAllPending,
    initPending,
    initConfirmSelection,
    setInitConfirmSelection,
    setInitPending,
    onInitConfirm: () => executeInitPending(),
    draftRef,
    folderDraftRef,
  })

  // ── Derived values for render ─────────────────────────────────────
  const envStats = useMemo(() => {
    if (!envEditor.draft) return ""
    const rows = envEditor.draft.varRows
    const activeCount = rows.filter((r) => r.enabled).length
    return `${activeCount} active · ${rows.length} var${rows.length !== 1 ? "s" : ""}`
  }, [envEditor.draft])

  const expandHint = useMemo(
    () => `${displayKey(keybinds.pane_expand)} expand`,
    [keybinds.pane_expand],
  )

  const renderer = useRenderer()

  const commandPaletteCommands = useMemo(
    () =>
      buildCommandPaletteCommands({
        keybinds,
        collectionDir,
        confirmUndoAll,
        renderer,
        trySendRef,
        draftRef,
        folderDraftRef,
        envStateRef,
        envEditorRef,
        collectionRef,
        selectedIdRef,
        focusRef,
        responseStateRef,
        activeIndexRef,
        savingRef,
        doSaveRef,
        focusedFolderPathRef,
        focusedFolderNameRef,
        folderDeletePathRef,
        getKeymapFocus: () => keymap.getData("app.focus") as string,
        getView: () => view,
        getCollectionMode: () => (mode === "invalid" ? "empty" : mode),
        setLayout,
        onLayoutChange,
        setHelpVisible,
        setAboutVisible,
        setNewRequestVisible,
        setNewFolderVisible,
        setCloneRequestVisible,
        setEditRequestVisible,
        setRequestDeletePending,
        setFolderDeletePending,
        setCollectionSwitcherVisible,
        setYamlEditor,
        setView,
        setFocus,
        setUndoAllPending,
        setInitPending,
        setExpanded,
        setPreviewIndexProp,
        setEnvDeletePending,
        setDeleteConfirmSelection,
        onReloadCollection,
      }),
    [
      keybinds,
      collectionDir,
      confirmUndoAll,
      onLayoutChange,
      setCollectionSwitcherVisible,
      onReloadCollection,
      view,
      mode,
    ],
  )

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.background,
      }}
    >
      <VariableCompletionInterceptor />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          gap: 1,
          position: "relative",
        }}
      >
        {view === "main" ? (
          <MainView
            items={items}
            collectionDir={collectionDir}
            loading={loading}
            error={error}
            visibleItems={visibleItems}
            cursorIndex={cursorIndex}
            selectedId={selectedId}
            expandedFolders={expandedFolders}
            focusedFolderPresent={focusedFolder !== null}
            focus={focus}
            keybinds={keybinds}
            draft={draft}
            folderDraft={folderDraft}
            folderEb={folderEb}
            eb={eb}
            layout={layout}
            expanded={expanded}
            activeEnv={envState.activeEnv}
            responseState={responseState}
            timelineEntries={timeline.entries}
            initialResponseTab={initialResponseTab}
            onResponseTabChange={onResponseTabChange}
            onOpenTimelineEntry={(entry) => setTimelineDetailEntry(entry)}
            setSelectOpen={setSelectOpen}
            urlbarSubFocus={urlbarSubFocus}
            urlbarInteractive={activeOverlay === "none" && !isReadOnly}
            expandHint={expandHint}
            mode={mode}
          />
        ) : mode === "collection" ? (
          <EnvironmentEditorView
            envEditor={envEditor}
            activeEnv={envState.activeEnv}
            envColors={envColors}
            focus={focus}
            envHeaderRef={envHeaderRef}
            setFocus={setFocus}
            setEnvDeletePending={setEnvDeletePending}
            setDeleteConfirmSelection={setDeleteConfirmSelection}
          />
        ) : null}
        <AppOverlays
          keybinds={keybinds}
          helpVisible={helpVisible}
          aboutVisible={aboutVisible}
          saveState={saveState}
          confirmSelection={confirmSelection}
          envDeletePending={envDeletePending}
          deleteConfirmSelection={deleteConfirmSelection}
          undoAllPending={undoAllPending}
          initPending={initPending}
          initConfirmSelection={initConfirmSelection}
          collectionSwitchPending={collectionSwitchPending}
          collectionSwitchSelection={collectionSwitchSelection}
          commandPaletteVisible={commandPaletteVisible}
          commandPaletteCommands={commandPaletteCommands}
          setCommandPaletteVisible={setCommandPaletteVisible}
          collectionSwitcherVisible={collectionSwitcherVisible}
          collectionPaths={collectionPaths}
          collectionDir={collectionDir}
          requestCollectionSwitch={requestCollectionSwitch}
          setCollectionSwitcherVisible={setCollectionSwitcherVisible}
          previewIndex={previewIndex}
          activeIndex={activeIndex}
          setPreviewIndex={setPreviewIndexProp}
          onThemeChange={onThemeChange}
          yamlEditor={yamlEditor}
          setYamlEditor={setYamlEditor}
          setCollectionReloadToken={setCollectionReloadToken}
          resetRequestDraft={draft.resetRequestDraft}
          resetFolderDraftByPath={folderDraft.clearFolderDraft}
          setFocus={setFocus}
          setSaveState={setSaveState}
          clearSaveTimer={clearSaveTimer}
          saveTimerRef={saveTimerRef}
          newRequestVisible={newRequestVisible}
          newRequestRef={newRequestRef}
          activeEnv={envState.activeEnv}
          editRequestVisible={editRequestVisible}
          selectedRequest={selectedRequest}
          folderPaths={folderPaths}
          editRequestInitialFolder={editRequestInitialFolder}
          editRequestRef={editRequestRef}
          cloneRequestVisible={cloneRequestVisible}
          cloneRequestRef={cloneRequestRef}
          newFolderVisible={newFolderVisible}
          newFolderRef={newFolderRef}
          folderDeletePending={folderDeletePending}
          requestDeletePending={requestDeletePending}
          timelineDetailEntry={timelineDetailEntry}
          setTimelineDetailEntry={setTimelineDetailEntry}
          envColors={envColors}
        />
      </box>
      <StatusBar
        method={draft.draft?.method ?? ""}
        url={draft.draft?.url ?? ""}
        isDirty={draft.isDirty}
        sendState={responseState}
        envLabel={envState.indicatorLabel}
        envColor={envState.activeEnv?.color}
        saveState={saveState}
        kb={keybinds}
        view={view}
        envStats={envStats}
      />
    </box>
  )
}
