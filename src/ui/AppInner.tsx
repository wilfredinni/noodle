import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { MainView } from "./MainView"
import { EnvironmentEditorView } from "./env-editor/EnvironmentEditorView"
import { AppOverlays } from "./AppOverlays"
import { useCollection } from "../hooks/useCollection"
import { useTreeNavigation } from "../hooks/useTreeNavigation"
import { deriveRequestParentFolder, getFolderPaths } from "./tree"
import { useResponse } from "../hooks/useResponse"
import type { SendCompleteResult } from "../hooks/useResponse"
import type { Request as NoodleRequest, Method } from "../schema"
import { useRequestDraft } from "../hooks/useRequestDraft"
import { useEditBrowse } from "../hooks/useEditBrowse"
import { useFolderDraft } from "../hooks/useFolderDraft"
import { useFolderEditBrowse } from "../hooks/useFolderEditBrowse"
import { useEnvironments } from "../hooks/useEnvironments"
import { useEnvironmentEditor } from "../hooks/useEnvironmentEditor"
import { type Focus, type UrlBarSubFocus } from "./focus"
import { buildCommandPaletteCommands } from "./commands"
import { useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import { Header } from "./Header"
import { showToast } from "./Toast"
import { type EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"

import type { FinderItem } from "./requestFinder"
import { type Keybinds } from "./keybind"
import { useSaveFile } from "./useSaveFile"
import { useAppKeymap } from "./useAppKeymap"
import {
  useJumpMode,
  getAvailableTargets,
  type JumpTarget,
} from "./useJumpMode"
import { useRenderer } from "./RendererContext"
import { useOverlayIntercepts } from "./useOverlayIntercepts"
import { useCollectionFileActions } from "./useCollectionFileActions"
import { useTimeline } from "./timeline/useTimeline"
import { buildTimelineEntry } from "./timeline/formatTimeline"
import { substitute } from "../requests"
import type { SubstitutedRequest } from "../requests/substitute"
import { flattenRequests, getRequestIds, findFolderByPath } from "./tree"
import { useUIState } from "./tabs/useUIState"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import { VariableCompletionInterceptor } from "./variable-completion/variableCompletionInterceptor"
import { parseCurl } from "../converters/curl/parse"
import type { ResponseQueryController } from "./responseQuery"
import { type AppView } from "./appState"
import { getKeybindingHints } from "./keybindingHints"
import {
  useCollectionUiPersistence,
  useInitialExpandedFolders,
} from "./useCollectionUiPersistence"
import { useUpdateFlow } from "./useUpdateFlow"
import { useTimelineActions } from "./useTimelineActions"
import { useOverlayState } from "./useOverlayState"
import { useCollectionSwitcher } from "./useCollectionSwitcher"
import { useKeymapSync } from "./useKeymapSync"
import { useEditModeSync } from "./useEditModeSync"

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
  const [view, setView] = useState<AppView>("main")
  const viewRef = useRef(view)
  viewRef.current = view
  const [layout, setLayout] = useState<"stacked" | "side-by-side">(
    initialLayout,
  )
  const [expanded, setExpanded] = useState<"request" | "response" | null>(null)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const [collectionReloadToken, setCollectionReloadToken] = useState(0)
  const [, setSelectOpen] = useState(false)
  const [userResponseTabOverride, setUserResponseTabOverride] =
    useState<ResponseTabKind | null>(null)
  const [overrideRequestId, setOverrideRequestId] = useState<string | null>(
    null,
  )
  const [filterOpenRequestId, setFilterOpenRequestId] = useState<string | null>(
    null,
  )
  const folderDeletePathRef = useRef<string | null>(null)
  const [jumpMode, setJumpMode] = useState(false)
  const jumpTargetsRef = useRef<Map<string, JumpTarget>>(new Map())
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

  const initialExpandedFolders = useInitialExpandedFolders(
    collectionDir,
    isCollection,
  )

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
    revealRequest,
    revealFolder,
    expandFolder,
  } = useTreeNavigation(
    items,
    () => focus === "sidebar" && keymap.getData("app.overlay") === "none",
    initialLastRequestId,
    initialExpandedFolders ?? undefined,
  )

  const requests = useMemo(() => flattenRequests(items), [items])
  const findRequest = useCallback(
    (item: FinderItem) => {
      if (item.type === "request") {
        revealRequest(item.id)
      } else {
        revealFolder(item.id)
      }
      setFocus("sidebar")
      setRequestFinderVisible(false)
    },
    [revealRequest, revealFolder],
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

  useCollectionUiPersistence({
    collectionDir,
    isCollection,
    selectedId,
    focusedFolderPath,
    requestIds,
    expandedFolders,
  })

  const draft = useRequestDraft(selectedRequest)

  const availableJumpTargets = useMemo(
    () =>
      getAvailableTargets(
        draft.draft !== null,
        expanded,
        focusedFolder !== null,
      ),
    [draft.draft, expanded, focusedFolder],
  )
  useEffect(() => {
    jumpTargetsRef.current = availableJumpTargets
  }, [availableJumpTargets])

  const tabPrefs = getTab(selectedRequest?.id ?? "")
  const initialRequestTab = tabPrefs?.requestTab
  const initialResponseTab = tabPrefs?.responseTab

  const responseTab =
    overrideRequestId === selectedRequest?.id && userResponseTabOverride
      ? userResponseTabOverride
      : (initialResponseTab ?? "body")

  const queryVisible =
    view === "main" && filterOpenRequestId === (selectedRequest?.id ?? null)

  const setQueryVisible = useCallback(
    (v: boolean) => {
      setFilterOpenRequestId(v ? (selectedRequest?.id ?? null) : null)
    },
    [selectedRequest?.id],
  )

  const onRequestTabChange = useCallback(
    (tab: FieldKind) => {
      if (selectedRequest?.id) setTab(selectedRequest.id, "request", tab)
    },
    [selectedRequest?.id, setTab],
  )

  const onResponseTabChange = useCallback(
    (tab: ResponseTabKind) => {
      setUserResponseTabOverride(tab)
      setOverrideRequestId(selectedRequest?.id ?? null)
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
  const responseQueryRef = useRef<ResponseQueryController | null>(null)
  const responseBodyForCopyRef = useRef<string | null>(null)

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

  const {
    collectionSwitcherVisible,
    setCollectionSwitcherVisible,
    collectionSwitchPending,
    setCollectionSwitchPending,
    requestCollectionSwitch,
    confirmCollectionSwitch,
  } = useCollectionSwitcher({
    collectionDir,
    requestDirty: draft.isDirty,
    folderDirty: folderDraft.isDirty,
    environmentDirty: envEditor.dirty,
    onCollectionChange,
  })

  const overlayActiveRef = useRef(false)
  const {
    updateFlow,
    restartVersion,
    updateAvailable,
    triggerUpdateCheck,
    confirmInstall: onConfirmInstall,
    cancelUpdate: onCancelUpdate,
  } = useUpdateFlow(overlayActiveRef)
  const {
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
  } = useOverlayState({
    previewIndex,
    saveState,
    collectionSwitcherVisible,
    collectionSwitchPending,
    updatePhase: updateFlow.phase,
  })
  const overlayActive = useKeymapSync({
    focus,
    view,
    activeOverlay,
    jumpMode,
    setJumpMode,
    headerFieldRef,
    overlayActiveRef,
  })

  const {
    handleFolderSave,
    handleNewRequestConfirm,
    handleImportCurlConfirm,
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
    setImportCurlVisible,
    setCloneRequestVisible,
    setNewFolderVisible,
    setEditRequestVisible,
    setRequestDeletePending,
    setFolderDeletePending,
    onCollectionBootstrapped,
  })
  folderSaveRef.current = handleFolderSave

  const paneMode = useEditModeSync({ focus, view, eb, folderEb, envEditor })

  const displayTab = useMemo((): string | undefined => {
    if (focus === "request") return eb.activeTab
    if (focus === "response") return responseTab
    if (focus === "folder") return folderEb.activeTab
    return undefined
  }, [focus, eb.activeTab, responseTab, folderEb.activeTab])

  const hints = useMemo(
    () =>
      getKeybindingHints({
        view,
        focus,
        paneMode,
        collectionMode: mode,
        overlayActive,
        jumpMode,
        tab: displayTab,
        bodyType: draft.draft?.bodyType,
        sendState: responseState,
        queryVisible,
        keybinds,
      }),
    [
      view,
      focus,
      paneMode,
      mode,
      overlayActive,
      jumpMode,
      displayTab,
      draft.draft?.bodyType,
      responseState,
      queryVisible,
      keybinds,
    ],
  )

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

  // ── Keymap layers ──────────────────────────────────────────────────
  useAppKeymap({
    runtime: {
      keybinds,
      collectionDir,
      confirmUndoAll,
    },
    global: {
      focusRef,
      urlbarSubFocusRef,
      viewRef,
      activeIndexRef,
      expandedRef,
      responseStateRef,
      responseQueryRef,
      responseBodyForCopyRef,
      modeRef,
      setFocus,
      setUrlbarSubFocus,
      setView,
      setHelpVisible,
      setLayout,
      setExpanded,
      setYamlEditor,
      setPreviewIndex: setPreviewIndexProp,
      setCollectionSwitcherVisible,
      setCommandPaletteVisible,
      setRequestFinderVisible,
      setUndoAllPending,
      setJumpMode,
      onLayoutChange,
    },
    request: {
      ebRef,
      draftRef,
      collectionRef,
      selectedIdRef,
      trySendRef,
      doSaveRef,
      savingRef,
      setNewRequestVisible,
      setEditRequestVisible,
      setCloneRequestVisible,
      setRequestDeletePending,
    },
    folder: {
      folderEbRef,
      folderDraftRef,
      folderSaveRef,
      folderViewRef,
      focusedFolderPathRef,
      focusedFolderNameRef,
      folderDeletePathRef,
      setNewFolderVisible,
      setFolderDeletePending,
    },
    environment: {
      envStateRef,
      envEditorRef,
      setEnvDeletePending,
    },
  })

  useJumpMode({
    jumpMode,
    setJumpMode,
    setFocus,
    setUrlbarSubFocus,
    ebRef,
    setTab,
    selectedIdRef,
    targetsRef: jumpTargetsRef,
    triggerKey: keybinds.jump_mode,
  })

  // ── Overlay intercepts ────────────────────────────────────────────
  useOverlayIntercepts({
    activeOverlay,
    cancelSendRef,
    saveState,
    setSaveState,
    doSave,
    envDeletePending,
    envDeletePendingRef,
    setEnvDeletePending,
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
    importCurlVisible,
    importCurlRef,
    setImportCurlVisible,
    onImportCurlConfirm: (v) => {
      try {
        handleImportCurlConfirm(v.name, v.folderPath, parseCurl(v.command))
      } catch (e: unknown) {
        importCurlRef.current?.setError(
          e instanceof Error ? e.message : String(e),
        )
      }
    },
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
    setCollectionSwitchPending,
    onCollectionSwitchConfirm: confirmCollectionSwitch,
    undoAllPending,
    setUndoAllPending,
    initPending,
    setInitPending,
    onInitConfirm: () => executeInitPending(),
    draftRef,
    folderDraftRef,
    updateConfirmVisible: updateFlow.phase === "confirm",
    onConfirmInstall,
    onCancelUpdate,
  })

  // ── Derived values for render ─────────────────────────────────────
  const envStats = useMemo(() => {
    if (!envEditor.draft) return ""
    const rows = envEditor.draft.varRows
    const activeCount = rows.filter((r) => r.enabled).length
    return `${activeCount} active · ${rows.length} var${rows.length !== 1 ? "s" : ""}`
  }, [envEditor.draft])

  const renderer = useRenderer()
  const {
    onLoadTimelineBody,
    onCopyTimelineHeaders,
    onCopyTimelineBody,
    onExportTimelineBody,
  } = useTimelineActions(collectionDir, renderer)

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
        responseQueryRef,
        responseBodyForCopyRef,
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
        setImportCurlVisible,
        setNewFolderVisible,
        setCloneRequestVisible,
        setEditRequestVisible,
        setRequestDeletePending,
        setFolderDeletePending,
        setCollectionSwitcherVisible,
        setRequestFinderVisible,
        setCodeGeneratorVisible,
        setYamlEditor,
        setView,
        setFocus,
        setUndoAllPending,
        setInitPending,
        setExpanded,
        setPreviewIndexProp,
        setEnvDeletePending,
        onReloadCollection,
        triggerUpdateCheck,
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
      triggerUpdateCheck,
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
      <Header
        headerHints={hints.header}
        restartVersion={restartVersion}
        updateAvailable={updateAvailable}
      />
      <VariableCompletionInterceptor />
      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          gap: 0,
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
            responseQueryRef={responseQueryRef}
            responseBodyForCopyRef={responseBodyForCopyRef}
            onQueryVisibleChange={setQueryVisible}
            mode={mode}
            jumpMode={jumpMode}
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
          />
        ) : null}
        <AppOverlays
          keybinds={keybinds}
          helpVisible={helpVisible}
          aboutVisible={aboutVisible}
          saveState={saveState}
          envDeletePending={envDeletePending}
          undoAllPending={undoAllPending}
          initPending={initPending}
          collectionSwitchPending={collectionSwitchPending}
          commandPaletteVisible={commandPaletteVisible}
          commandPaletteCommands={commandPaletteCommands}
          setCommandPaletteVisible={setCommandPaletteVisible}
          codeGeneratorVisible={codeGeneratorVisible}
          setCodeGeneratorVisible={setCodeGeneratorVisible}
          codeGeneratorRequest={draft.draft}
          codeGeneratorEnv={envState.activeEnv}
          codeGeneratorEnvName={envState.activeEnv?.name}
          collection={collection}
          requestFinderVisible={requestFinderVisible}
          requests={requests}
          onFindRequest={findRequest}
          setRequestFinderVisible={setRequestFinderVisible}
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
          importCurlVisible={importCurlVisible}
          importCurlRef={importCurlRef}
          importCurlInitialFolder={requestParentFolder ?? ""}
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
          updateConfirm={
            updateFlow.phase === "confirm"
              ? {
                  version: updateFlow.version,
                  installType: updateFlow.installType,
                }
              : null
          }
          envColors={envColors}
          onLoadTimelineBody={onLoadTimelineBody}
          onCopyTimelineHeaders={onCopyTimelineHeaders}
          onCopyTimelineBody={onCopyTimelineBody}
          onExportTimelineBody={onExportTimelineBody}
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
        jumpMode={jumpMode}
        collectionMode={mode}
        overlayActive={overlayActive}
        footerHints={hints.footer}
      />
    </box>
  )
}
