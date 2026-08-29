import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { basename, dirname } from "node:path"
import type { Dispatch, SetStateAction } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import { MainView } from "./MainView"
import { SIDEBAR_WIDTH } from "./Sidebar"
import { EnvironmentEditorView } from "./env-editor/EnvironmentEditorView"
import { CookieJarView } from "./cookie-jar/CookieJarView"
import { CollectionRunnerView } from "./CollectionRunnerView"
import {
  SettingsView,
  type CollectionSettingsCategory,
  type GlobalSettingsCategory,
  type SettingsCategory,
  type SettingsScope,
} from "./settings/SettingsView"
import { AppOverlays } from "./AppOverlays"
import { useCollection } from "../hooks/useCollection"
import { useTreeNavigation } from "../hooks/useTreeNavigation"
import {
  deriveRequestParentFolder,
  getFolderPaths,
  updateRequestById,
} from "./tree"
import { useResponse } from "../hooks/useResponse"
import type { SendCompleteResult } from "../hooks/useResponse"
import type {
  AppProxySettings,
  CollectionProxySettings,
  CollectionSettings,
  CollectionTlsSettings,
  ProxyCredentials,
  Request as NoodleRequest,
  Method,
} from "../schema"
import {
  createProxyFetcher,
  environmentForProxyPolicy,
  resolveProxyPolicy,
  type SystemProxySettings,
} from "../proxy"
import type { TlsPolicy } from "../tls"
import { useRequestDraft } from "../hooks/useRequestDraft"
import { useEditBrowse } from "../hooks/useEditBrowse"
import { useCollectionRunner } from "../hooks/useCollectionRunner"
import { useFolderDraft } from "../hooks/useFolderDraft"
import { useFolderEditBrowse } from "../hooks/useFolderEditBrowse"
import { useEnvironments } from "../hooks/useEnvironments"
import { useEnvironmentEditor } from "../hooks/useEnvironmentEditor"
import { useCollectionCookieJar } from "../hooks/useCollectionCookieJar"
import { useCookieJarView } from "../hooks/useCookieJarView"
import { settingsReturnFocus, type Focus, type UrlBarSubFocus } from "./focus"
import {
  buildCommandPaletteCommands,
  type CommandPaletteTarget,
} from "./commands"
import { useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import { Header } from "./Header"
import { showToast } from "./Toast"
import { type EnvHeaderPaneHandle } from "./env-editor/EnvHeaderPane"

import type { FinderItem } from "./requestFinder"
import { displayKey, type KeybindName, type Keybinds } from "./keybind"
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
import { buildTimelineEntry } from "../timelineEntry"
import { flattenRequests, getRequestIds, findFolderByPath } from "./tree"
import { useUIState } from "./tabs/useUIState"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"
import { collapseUserPath } from "../userPath"
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
import { useReloadGuard } from "./useReloadGuard"
import { useKeymapSync } from "./useKeymapSync"
import { useEditModeSync } from "./useEditModeSync"
import {
  closeCollectionExport,
  openCollectionRunner,
  openEnvironmentEditor,
  openEnvironmentPicker,
  openRunnerRequestTab,
} from "./commandActions"
import { runCollectionExport } from "./collectionExport"
import {
  collectionDisplayName,
  unregisterCollection,
} from "./settings/collectionRegistry"
import {
  runCollectionImport,
  type CollectionImportValues,
} from "./collectionImport"
import { extractFileErrors } from "../filestore/load"
import type { ExternalEditor, ExternalEditorId } from "../externalEditor"

export function AppInner({
  appConfigDir,
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
  onKeybindChange,
  settingsScope,
  globalSettingsCategory,
  collectionSettingsCategory,
  onSettingsScopeChange,
  onGlobalSettingsCategoryChange,
  onCollectionSettingsCategoryChange,
  initialLayout,
  confirmUndoAll,
  onConfirmUndoAllChange,
  externalEditors,
  externalEditor,
  onExternalEditorChange,
  onLayoutChange,
  onEnvChange,
  onEnvListChanged,
  settingsEnv,
  appProxy,
  appProxyCredentials,
  collectionProxy,
  collectionProxyCredentials,
  collectionTls,
  tlsPassphrases,
  collectionName,
  collectionDescription,
  timelineMaxEntries,
  cookiesEnabled = true,
  noProxy,
  insecure = false,
  systemProxy,
  onAppProxyChange,
  onCollectionProxyChange,
  onAppProxyCredentialsChange,
  onCollectionProxyCredentialsChange,
  onProxyAuthDisable,
  onTlsPassphraseChange,
  onTlsProfileRemove,
  onCollectionSettingsChange,
  initialLastRequestId,
  collectionPaths,
  collectionSettingsByPath,
  activeCollectionDir,
  onCollectionsChange,
  onRegisterCollection,
  onCollectionChange,
  onReloadCollection,
  onCollectionBootstrapped,
  onCollectionImported,
  mode = "empty",
}: {
  appConfigDir: string
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
  onKeybindChange: (name: KeybindName, key: string) => boolean
  settingsScope: SettingsScope
  globalSettingsCategory: GlobalSettingsCategory
  collectionSettingsCategory: CollectionSettingsCategory
  onSettingsScopeChange: (scope: SettingsScope) => void
  onGlobalSettingsCategoryChange: (category: GlobalSettingsCategory) => void
  onCollectionSettingsCategoryChange: (
    category: CollectionSettingsCategory,
  ) => void
  initialLayout: "stacked" | "side-by-side"
  confirmUndoAll: boolean
  onConfirmUndoAllChange: (value: boolean) => void
  externalEditors: ExternalEditor[]
  externalEditor?: ExternalEditor
  onExternalEditorChange: (editor: ExternalEditorId) => void
  onLayoutChange: (layout: "stacked" | "side-by-side") => boolean
  onEnvChange: (name: string | null) => void
  onEnvListChanged: () => Promise<void>
  settingsEnv?: string
  appProxy?: AppProxySettings
  appProxyCredentials: ProxyCredentials
  collectionProxy?: CollectionProxySettings
  collectionProxyCredentials: ProxyCredentials
  collectionTls?: CollectionTlsSettings
  tlsPassphrases: Record<string, string>
  collectionName?: string
  collectionDescription?: string
  timelineMaxEntries?: number
  cookiesEnabled?: boolean
  noProxy: boolean
  insecure?: boolean
  systemProxy: SystemProxySettings
  onAppProxyChange: (proxy: AppProxySettings) => boolean
  onCollectionProxyChange: (proxy: CollectionProxySettings) => boolean
  onAppProxyCredentialsChange: (
    credentials: ProxyCredentials,
  ) => Promise<boolean>
  onCollectionProxyCredentialsChange: (
    credentials: ProxyCredentials,
  ) => Promise<boolean>
  onProxyAuthDisable: (scope: "app" | "collection") => Promise<boolean>
  onTlsPassphraseChange: (index: number, value: string) => Promise<boolean>
  onTlsProfileRemove: (index: number) => Promise<boolean>
  onCollectionSettingsChange: (
    patch: Pick<
      CollectionSettings,
      "name" | "description" | "timelineMaxEntries" | "tls" | "cookies"
    >,
  ) => boolean
  initialLastRequestId?: string
  collectionPaths: string[]
  collectionSettingsByPath: Record<string, CollectionSettings>
  activeCollectionDir: string
  onCollectionsChange: (collections: string[]) => boolean
  onRegisterCollection: (path: string) => string | null
  onCollectionChange: (collectionDir: string) => void
  onReloadCollection: () => void
  onCollectionBootstrapped: (collectionDir: string) => void
  onCollectionImported: (collectionDir: string) => void
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
  const settingsReturnFocusRef = useRef<Focus>("sidebar")
  const [layout, setLayout] = useState<"stacked" | "side-by-side">(
    initialLayout,
  )
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH)
  const [paneSplitRatios, setPaneSplitRatios] = useState<
    Record<"stacked" | "side-by-side", number>
  >({ stacked: 0.5, "side-by-side": 0.5 })
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
  const [responseBodyEditorAvailable, setResponseBodyEditorAvailable] =
    useState(false)
  const folderDeletePathRef = useRef<string | null>(null)
  const requestDeleteFileRef = useRef<string | null>(null)
  const collectionErrorDeleteRef = useRef<(() => void) | null>(null)
  const collectionErrorSaveRef = useRef<(() => void) | null>(null)
  const [collectionErrorDirty, setCollectionErrorDirty] = useState(false)
  const [paletteTarget, setPaletteTarget] =
    useState<CommandPaletteTarget | null>(null)
  const [jumpMode, setJumpMode] = useState(false)
  const jumpTargetsRef = useRef<Map<string, JumpTarget>>(new Map())
  const headerFieldRef = useRef<"name" | "color">("name")
  const pendingHeaderFieldRef = useRef<"name" | "color" | null>(null)
  const exportPendingRef = useRef(false)
  const importCollectionPendingRef = useRef(false)
  const [runnerScope, setRunnerScope] = useState<string | null>(null)
  const [runnerResetKey, setRunnerResetKey] = useState(0)
  const runnerReturnFocusRef = useRef<Focus>("sidebar")
  const runnerDetailScrollRef = useRef<ScrollBoxRenderable | null>(null)

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
  const collectionErrorCount = error ? extractFileErrors(error).length : 0
  const effectiveCollectionMode =
    collectionErrorCount > 0 ? ("invalid" as const) : mode

  const requestIds = useMemo(() => getRequestIds(items), [items])
  const { getTab, setTab } = useUIState(collectionDir, requestIds, isReadOnly)

  const initialExpandedFolders = useInitialExpandedFolders(
    collectionDir,
    isCollection,
  )

  // ── Sidebar selection + request draft + edit-browse ─────────────────
  const {
    selectedId,
    selectedIdRef,
    selectedRequest,
    expanded: expandedFolders,
    visibleItems,
    cursorIndex,
    focusedFolderPath,
    focusedFolderName,
    setSelectedId,
    revealRequest,
    revealFolder,
    toggleFolder,
    expandFolder,
  } = useTreeNavigation(
    items,
    () => focus === "sidebar" && keymap.getData("app.overlay") === "none",
    initialLastRequestId,
    initialExpandedFolders ?? undefined,
  )

  const requests = useMemo(() => flattenRequests(items), [items])

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
  const draftRef = useRef(draft)
  draftRef.current = draft
  const markRequestSaved = useCallback(
    (request: NoodleRequest) => {
      updateCollection((current) =>
        current
          ? {
              ...current,
              items: updateRequestById(current.items, request.id, request),
            }
          : current,
      )
      draft.markSaved(request)
    },
    [draft.markSaved, updateCollection],
  )

  const availableJumpTargets = useMemo(
    () =>
      getAvailableTargets(
        draft.draft !== null,
        expanded,
        focusedFolder !== null,
        view === "env-editor",
        view === "settings",
        view === "cookie-jar",
      ),
    [draft.draft, expanded, focusedFolder, view],
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

  const openTagEditorRef = useRef<(index: number, value: string) => void>(
    () => {},
  )
  const eb = useEditBrowse(draft.draft, draft, {
    initialTab: initialRequestTab,
    onTabChange: onRequestTabChange,
    onTagEdit: (index, value) => openTagEditorRef.current(index, value),
  })

  // ── Save logic (provides saveState needed by keymap.setData below) ──
  const {
    saveState,
    setSaveState,
    savingRef,
    doSave,
    clearSaveTimer,
    saveTimerRef,
  } = useSaveFile(
    collectionDir,
    draft.draft,
    selectedRequest?.id,
    markRequestSaved,
  )

  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave

  useEffect(() => {
    if (saveState.kind === "success" || saveState.kind === "error") {
      showToast(
        saveState.kind === "success"
          ? "Operation completed"
          : "Operation failed",
        saveState.kind,
      )
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
    timelineMaxEntries,
  )
  const timelineAppendRef = useRef(timeline.appendEntry)
  timelineAppendRef.current = timeline.appendEntry

  const onCompleteRef = useRef(
    (_req: NoodleRequest, _result: SendCompleteResult) => {},
  )
  onCompleteRef.current = (req: NoodleRequest, result: SendCompleteResult) => {
    timelineAppendRef.current(
      buildTimelineEntry(
        req,
        result,
        envNameRef.current,
        envStateRef.current.activeEnv,
        [
          ...Object.values(appProxyCredentials),
          ...Object.values(collectionProxyCredentials),
          ...Object.values(tlsPassphrases),
        ].filter((value): value is string => Boolean(value)),
      ),
    )
  }

  const proxyPolicy = useMemo(
    () =>
      resolveProxyPolicy({
        noProxy,
        appProxy,
        collectionProxy,
        appCredentials: appProxyCredentials,
        collectionCredentials: collectionProxyCredentials,
        systemProxy,
      }),
    [
      noProxy,
      appProxy,
      collectionProxy,
      appProxyCredentials,
      collectionProxyCredentials,
      systemProxy,
    ],
  )
  const tlsPolicy = useMemo<TlsPolicy>(
    () => ({
      collectionDir,
      settings: collectionTls,
      insecure,
      passphrases: tlsPassphrases,
    }),
    [collectionDir, collectionTls, insecure, tlsPassphrases],
  )
  const cookieStorage = useCollectionCookieJar(
    isCollection && cookiesEnabled ? collectionDir : undefined,
  )
  const cookieJar = cookieStorage.jar
  const previousCookieStatus = useRef(cookieStorage.status.state)
  useEffect(() => {
    const state = cookieStorage.status.state
    if (state === previousCookieStatus.current) return
    previousCookieStatus.current = state
    if (state === "plaintext-warning") {
      showToast("Cookie storage is plaintext", "error")
    } else if (state === "unavailable") {
      showToast(
        "Cookie storage is unavailable; requests will run jar-less",
        "error",
      )
    }
  }, [cookieStorage.status])
  const updateDependencies = useMemo(
    () => ({
      fetcher: createProxyFetcher(proxyPolicy),
      env: environmentForProxyPolicy(proxyPolicy),
    }),
    [proxyPolicy],
  )

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
    proxyPolicy,
    tlsPolicy,
    cookieJar,
    collectionDir,
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

  const focusPane = useCallback(
    (next: Focus) => {
      setJumpMode(false)
      if (next !== focus) {
        if (eb.commitEdit() === false) return
        folderEb.commitEdit()
        envEditor.commitEdit()
      }
      if (next === "urlbar") setUrlbarSubFocus("select")
      if (mode === "collection" && next === "request") eb.enterBrowse()
      if (mode === "collection" && !error && next === "folder") {
        folderEb.enterBrowse()
      }
      if (next === "env-vars") envEditor.enterBrowse()
      setFocus(next)
    },
    [
      eb.commitEdit,
      eb.enterBrowse,
      envEditor.commitEdit,
      envEditor.enterBrowse,
      error,
      focus,
      folderEb.commitEdit,
      folderEb.enterBrowse,
      mode,
    ],
  )

  const focusUrlbar = useCallback(
    (subFocus: UrlBarSubFocus) => {
      setJumpMode(false)
      if (focus !== "urlbar") {
        if (eb.commitEdit() === false) return
        folderEb.commitEdit()
      }
      setUrlbarSubFocus(subFocus)
      setFocus("urlbar")
    },
    [eb.commitEdit, focus, folderEb.commitEdit],
  )

  const hasUnsavedChanges =
    draft.dirtyRequestIds.size > 0 ||
    folderDraft.dirtyPaths.size > 0 ||
    collectionErrorDirty ||
    envEditor.dirty ||
    eb.editState.mode === "editing" ||
    folderEb.editState.mode === "editing" ||
    envEditor.editState.mode === "editing"
  const runner = useCollectionRunner({
    collection,
    collectionDir,
    folderPath: runnerScope,
    activeEnvironment: envState.activeName,
    environmentNames: envState.names,
    hasUnsavedChanges,
    noProxy,
    systemProxy,
    insecure,
    resetKey: runnerResetKey,
  })
  const runnerRef = useRef(runner)
  useLayoutEffect(() => {
    runnerRef.current = runner
  }, [runner])
  const resetRunner = useCallback((scope: string | null) => {
    setRunnerScope(scope)
    setRunnerResetKey((key) => key + 1)
  }, [])
  const handleOpenRunner = useCallback(
    (scope: string | null) => {
      runnerReturnFocusRef.current = settingsReturnFocus(
        viewRef.current,
        focusRef.current,
      )
      const opened = openCollectionRunner(scope, resetRunner, setView, setFocus)
      setJumpMode(false)
      return opened
    },
    [resetRunner],
  )
  const closeRunner = useCallback(() => {
    if (runnerRef.current.phase === "running") return
    setView("main")
    setFocus(runnerReturnFocusRef.current)
  }, [])
  const handleOpenRunnerRequestTab = useCallback(
    (requestId: string, tab: FieldKind) => {
      if (tab !== "assertions" && tab !== "captures") return
      openRunnerRequestTab(
        requestId,
        tab,
        revealRequest,
        eb.enterBrowseAt,
        setView,
        setFocus,
      )
    },
    [eb.enterBrowseAt, revealRequest],
  )
  const {
    collectionSwitcherVisible,
    setCollectionSwitcherVisible,
    collectionSwitchPending,
    setCollectionSwitchPending,
    requestCollectionSwitch,
    confirmCollectionSwitch,
  } = useCollectionSwitcher({
    collectionDir,
    hasUnsavedChanges,
    onCollectionChange,
  })
  const { reloadPending, requestReload, confirmReload, cancelReload } =
    useReloadGuard(hasUnsavedChanges, onReloadCollection)

  const overlayActiveRef = useRef(false)
  const { updateFlow, triggerAboutUpdateCheck } =
    useUpdateFlow(updateDependencies)
  // Overlay visibility, pending values, and handles stay in one object so
  // adding an overlay does not mean re-declaring it at every consumer.
  const overlays = useOverlayState({
    previewIndex,
    collectionSwitcherVisible,
    collectionSwitchPending,
    reloadPending,
  })
  const { activeOverlay } = overlays
  openTagEditorRef.current = (index, value) =>
    overlays.setTagEditPending({ index, value })

  useEffect(() => {
    if (overlays.aboutVisible) triggerAboutUpdateCheck()
  }, [overlays.aboutVisible, triggerAboutUpdateCheck])
  const handleOpenRunnerResultDetail = useCallback(
    (index = runnerRef.current.resultIndex) => {
      const row = runnerRef.current.resultRows[index]
      if (!row || row.kind !== "result") return
      const detail = runnerRef.current.resultDetails.get(row.id)
      const request = runnerRef.current.requests.find(
        (candidate) => candidate.id === row.id,
      )
      if (!detail || !request) return
      overlays.setRunnerDetail({
        entry: detail.entry,
        execution: {
          ...(row.result.assertions
            ? { assertions: row.result.assertions }
            : {}),
          ...(row.result.captures ? { captures: row.result.captures } : {}),
        },
        request: {
          assertions: request.assertions,
          captures: request.captures,
        },
        warnings: row.result.warnings,
      })
    },
    [overlays.setRunnerDetail],
  )
  useEffect(() => {
    if (!overlays.commandPaletteVisible) setPaletteTarget(null)
  }, [overlays.commandPaletteVisible])
  const overlayActive = useKeymapSync({
    focus,
    view,
    activeOverlay,
    jumpMode,
    setJumpMode,
    headerFieldRef,
    pendingHeaderFieldRef,
    overlayActiveRef,
  })

  const findRequest = useCallback(
    (item: FinderItem) => {
      if (item.type === "request") {
        revealRequest(item.id)
      } else {
        revealFolder(item.id)
      }
      setFocus("sidebar")
      overlays.setRequestFinderVisible(false)
    },
    [revealRequest, revealFolder, overlays.setRequestFinderVisible],
  )

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
    requestDraftRef: draftRef,
    folderDraftRef,
    newRequestFolderRef,
    folderDeletePathRef,
    setCollectionReloadToken,
    setFocus,
    setSaveState,
    savingRef,
    clearSaveTimer,
    saveTimerRef,
    setSelectedId,
    expandFolder,
    setNewRequestVisible: overlays.setNewRequestVisible,
    setImportCurlVisible: overlays.setImportCurlVisible,
    setCloneRequestVisible: overlays.setCloneRequestVisible,
    setNewFolderVisible: overlays.setNewFolderVisible,
    setEditRequestVisible: overlays.setEditRequestVisible,
    requestDeleteFileRef,
    setRequestDeletePending: overlays.setRequestDeletePending,
    setFolderDeletePending: overlays.setFolderDeletePending,
    onCollectionBootstrapped,
  })
  folderSaveRef.current = handleFolderSave

  const paneMode = useEditModeSync({
    focus,
    view,
    eb,
    folderEb,
    envEditor,
    repairEditor: collectionErrorCount > 0,
  })

  const deleteCollectionErrorFile = useCallback(
    (file: string) => {
      if (!file.endsWith(".yml")) return
      requestDeleteFileRef.current = file.slice(0, -4)
      overlays.setRequestDeletePending(file)
    },
    [overlays.setRequestDeletePending],
  )

  /** Clears the pending id and the repair file it was opened for. */
  const cancelRequestDelete = useCallback(() => {
    requestDeleteFileRef.current = null
    overlays.setRequestDeletePending(null)
  }, [overlays.setRequestDeletePending])

  const displayTab = useMemo((): string | undefined => {
    if (focus === "request") return eb.activeTab
    if (focus === "response") return responseTab
    if (focus === "folder") return folderEb.activeTab
    return undefined
  }, [focus, eb.activeTab, responseTab, folderEb.activeTab])

  const visibleSettingsScope: SettingsScope =
    settingsScope === "collection" && !isCollection ? "global" : settingsScope
  const settingsCategory: SettingsCategory =
    visibleSettingsScope === "global"
      ? globalSettingsCategory
      : collectionSettingsCategory

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
        collectionError: collectionErrorCount > 0,
        queryVisible,
        responseBodyEditorAvailable,
        settingsCategory,
        runnerPhase: runner.phase,
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
      collectionErrorCount,
      queryVisible,
      responseBodyEditorAvailable,
      settingsCategory,
      runner.phase,
      keybinds,
    ],
  )

  const sendCommand =
    view === "main" && mode === "collection" && !overlayActive && !jumpMode
      ? paneMode === "browse" && focus === "request"
        ? "browse.send"
        : paneMode === "edit" && focus === "request" && eb.isEditingTextBody
          ? "edit.text-body-send"
          : paneMode === "edit" &&
              focus === "request" &&
              (eb.editState.cursor.field === "assertions" ||
                eb.editState.cursor.field === "captures")
            ? "edit.request-send"
            : paneMode === "base" && focus !== "folder"
              ? "request.send"
              : undefined
      : undefined

  const handleHintActivate = useCallback(
    (command: string) => {
      keymap.dispatchCommand(command)
    },
    [keymap],
  )

  const handleAboutActivate = useCallback(() => {
    overlays.setAboutVisible(true)
  }, [overlays.setAboutVisible])

  const handleCollectionActivate = useCallback(() => {
    setCollectionSwitcherVisible(true)
  }, [setCollectionSwitcherVisible])

  const handleEnvironmentActivate = useCallback(() => {
    openEnvironmentPicker(overlays.setEnvironmentPickerVisible)
  }, [overlays.setEnvironmentPickerVisible])

  const handleEnvironmentSelect = useCallback(
    (name: string) => {
      envState.select(name)
      overlays.setEnvironmentPickerVisible(false)
    },
    [envState.select, overlays.setEnvironmentPickerVisible],
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

  const handleSettingsScopeChange = useCallback(
    (scope: SettingsScope) => {
      if (scope === "collection" && !isCollection) return
      onSettingsScopeChange(scope)
    },
    [isCollection, onSettingsScopeChange],
  )

  const handleSettingsCategoryChange = useCallback(
    (category: SettingsCategory) => {
      if (visibleSettingsScope === "global") {
        onGlobalSettingsCategoryChange(category as GlobalSettingsCategory)
      } else {
        onCollectionSettingsCategoryChange(
          category as CollectionSettingsCategory,
        )
      }
    },
    [
      onCollectionSettingsCategoryChange,
      onGlobalSettingsCategoryChange,
      visibleSettingsScope,
    ],
  )

  const handleOpenSettings = useCallback(
    (
      scope?: SettingsScope,
      category?: GlobalSettingsCategory | CollectionSettingsCategory,
    ) => {
      if (viewRef.current !== "settings") {
        settingsReturnFocusRef.current = settingsReturnFocus(
          viewRef.current,
          focusRef.current,
        )
      }
      envEditor.closeEditor()
      if (scope) onSettingsScopeChange(scope)
      if (scope === "global" && category) {
        onGlobalSettingsCategoryChange(category as GlobalSettingsCategory)
      } else if (scope === "collection" && category) {
        onCollectionSettingsCategoryChange(
          category as CollectionSettingsCategory,
        )
      }
      setView("settings")
      setFocus("settings-sidebar")
      setJumpMode(false)
    },
    [
      envEditor.closeEditor,
      onCollectionSettingsCategoryChange,
      onGlobalSettingsCategoryChange,
      onSettingsScopeChange,
    ],
  )

  const handleOpenEnvironmentEditor = useCallback(() => {
    overlays.setEnvironmentPickerVisible(false)
    openEnvironmentEditor({ envStateRef, envEditorRef })
    setView("env-editor")
    setFocus("env-sidebar")
  }, [overlays.setEnvironmentPickerVisible, setView, setFocus])

  const envHeaderRef = useRef<EnvHeaderPaneHandle>(null)

  const cookieJarView = useCookieJarView(cookieJar)
  const cookieJarViewRef = useRef(cookieJarView)
  useLayoutEffect(() => {
    cookieJarViewRef.current = cookieJarView
  }, [cookieJarView])

  const retryCookieStorage = useCallback(() => {
    const retry = cookieJar
      ? cookieJar.refresh().then(() => cookieStorage.flush())
      : cookieStorage.retry()
    void retry
      .then(() => showToast("Cookie storage reloaded", "success"))
      .catch((error: unknown) =>
        showToast(
          error instanceof Error ? error.message : String(error),
          "error",
        ),
      )
  }, [cookieJar, cookieStorage.flush, cookieStorage.retry])

  const requestCookieStorageReset = useCallback(() => {
    overlays.setCookieDeletePending({ kind: "reset" })
  }, [overlays.setCookieDeletePending])

  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  const ebRef = useRef(eb)
  ebRef.current = eb

  const collectionRef = useRef(collection)
  collectionRef.current = collection

  const modeRef = useRef(effectiveCollectionMode)
  useLayoutEffect(() => {
    modeRef.current = effectiveCollectionMode
  }, [effectiveCollectionMode])

  const folderViewRef = useRef(false)
  folderViewRef.current = focusedFolder !== null || collectionErrorCount > 0

  // ── Keymap layers ──────────────────────────────────────────────────
  useAppKeymap({
    runtime: {
      keybinds,
      collectionDir,
      confirmUndoAll,
    },
    global: {
      focusRef,
      headerFieldRef,
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
      setHelpVisible: overlays.setHelpVisible,
      setLayout,
      setExpanded,
      setYamlEditor: overlays.setYamlEditor,
      setPreviewIndex: setPreviewIndexProp,
      setCollectionSwitcherVisible,
      setEnvironmentPickerVisible: overlays.setEnvironmentPickerVisible,
      setCommandPaletteVisible: overlays.setCommandPaletteVisible,
      setRequestFinderVisible: overlays.setRequestFinderVisible,
      setUndoAllPending: overlays.setUndoAllPending,
      setJumpMode,
      openSettingsView: handleOpenSettings,
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
      setNewRequestVisible: overlays.setNewRequestVisible,
      setEditRequestVisible: overlays.setEditRequestVisible,
      setCloneRequestVisible: overlays.setCloneRequestVisible,
      setRequestDeletePending: overlays.setRequestDeletePending,
      collectionErrorDeleteRef,
      collectionErrorSaveRef,
    },
    folder: {
      folderEbRef,
      folderDraftRef,
      folderSaveRef,
      folderViewRef,
      focusedFolderPathRef,
      focusedFolderNameRef,
      folderDeletePathRef,
      setNewFolderVisible: overlays.setNewFolderVisible,
      setFolderDeletePending: overlays.setFolderDeletePending,
    },
    environment: {
      envStateRef,
      envEditorRef,
      setNewEnvironmentVisible: overlays.setNewEnvironmentVisible,
      setEnvDeletePending: overlays.setEnvDeletePending,
    },
    cookies: {
      cookieJarViewRef,
      setCookieFormVisible: overlays.setCookieFormVisible,
      setCookieFormInitial: overlays.setCookieFormInitial,
      setCookieDeletePending: overlays.setCookieDeletePending,
      retryCookieStorage,
    },
    runner: {
      runnerRef,
      detailScrollRef: runnerDetailScrollRef,
      close: closeRunner,
      openResultDetail: handleOpenRunnerResultDetail,
    },
  })

  useJumpMode({
    jumpMode,
    setJumpMode,
    setFocus,
    setUrlbarSubFocus,
    ebRef,
    folderEbRef,
    envHeaderRef,
    headerFieldRef,
    pendingHeaderFieldRef,
    setTab,
    selectedIdRef,
    targetsRef: jumpTargetsRef,
    triggerKey: keybinds.jump_mode,
  })

  const handleImportCollectionConfirm = useCallback(
    (values: CollectionImportValues) => {
      if (importCollectionPendingRef.current) return
      overlays.setImportCollectionPending(true)
      void runCollectionImport({
        values,
        collectionDir,
        hasUnsavedChanges,
        pending: importCollectionPendingRef,
      })
        .then(async (result) => {
          if (!result) return
          if (values.destination === "current") {
            await onEnvListChanged().catch(() => {})
            overlays.setImportCollectionVisible(false)
            onReloadCollection()
            showToast("Collection imported", "success")
            return
          }

          try {
            onCollectionImported(result.path)
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error)
            throw new Error(
              `Imported to ${result.path}, but could not update config.yml: ${message}`,
              { cause: error },
            )
          }
          overlays.setImportCollectionVisible(false)
          overlays.setImportOpenPending({
            path: result.path,
            name: result.name,
          })
        })
        .catch((error: unknown) => {
          overlays.importCollectionRef.current?.setError(
            error instanceof Error ? error.message : String(error),
          )
        })
        .finally(() => overlays.setImportCollectionPending(false))
    },
    [
      collectionDir,
      hasUnsavedChanges,
      onCollectionImported,
      onEnvListChanged,
      onReloadCollection,
      overlays.setImportCollectionPending,
      overlays.setImportCollectionVisible,
      overlays.setImportOpenPending,
    ],
  )

  // ── Overlay intercepts ────────────────────────────────────────────
  const overlayActions = useOverlayIntercepts({
    overlays,
    cancelSendRef,
    setSaveState,
    onCollectionUnregisterConfirm: (path) => {
      const next = unregisterCollection(
        collectionPaths,
        collectionPaths.indexOf(path),
      )
      if (next && onCollectionsChange(next)) {
        showToast("Collection unregistered · files were not changed", "success")
      }
    },
    envEditorRef,
    clearSaveTimer,
    saveTimerRef,
    view,
    setView,
    focusRef,
    setFocus,
    envHeaderRef,
    headerFieldRef,
    onNewEnvironmentConfirm: (values) => {
      envEditor
        .createEnv(values)
        .then(() => {
          overlays.setNewEnvironmentVisible(false)
          focusPane("env-vars")
        })
        .catch((e: unknown) => {
          overlays.newEnvironmentRef.current?.setError(
            e instanceof Error ? e.message : String(e),
          )
        })
    },
    onCookieFormConfirm: (values) => {
      const jar = cookieJar
      if (!jar) return
      const initial = overlays.cookieFormInitial
      const expiresText = values.expires.trim()
      const input = {
        name: values.name,
        value: values.value,
        domain: values.domain,
        path: values.path,
        ...(expiresText !== "" ? { expires: new Date(expiresText) } : {}),
        secure: values.secure,
        httpOnly: values.httpOnly,
        hostOnly: values.hostOnly,
        ...(values.sameSite ? { sameSite: values.sameSite } : {}),
      }
      try {
        jar.put(input)
      } catch (error) {
        overlays.cookieFormRef.current?.setError(
          error instanceof Error ? error.message : String(error),
        )
        return
      }
      if (
        initial &&
        (initial.name !== values.name ||
          initial.domain !== values.domain ||
          initial.path !== values.path)
      ) {
        void jar
          .deleteCookie(initial.domain, initial.path, initial.name)
          .catch((error: unknown) =>
            showToast(
              error instanceof Error ? error.message : String(error),
              "error",
            ),
          )
      }
      overlays.setCookieFormVisible(false)
    },
    onCookieDeleteConfirm: (pending) => {
      const jar = cookieJar
      void (async () => {
        try {
          if (pending.kind === "reset" || jar?.status.state === "unavailable") {
            if (jar) await jar.clear()
            const { backupPath } = await cookieStorage.reset()
            showToast(
              backupPath
                ? `Cookie storage reset; backup saved to ${backupPath}`
                : "Cookie storage reset",
              "success",
            )
          } else if (!jar) {
            return
          } else if (pending.kind === "cookie") {
            await jar.deleteCookie(pending.domain, pending.path, pending.name)
            await cookieStorage.flush()
          } else if (pending.kind === "domain") {
            await jar.deleteDomain(pending.domain)
            await cookieStorage.flush()
          } else {
            await jar.clear()
            await cookieStorage.flush()
          }
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : String(error),
            "error",
          )
        }
      })()
    },
    onNewRequestConfirm: (v) =>
      handleNewRequestConfirm(v.name, v.method as Method, v.url, v.folderPath),
    onImportCurlConfirm: (v) => {
      try {
        handleImportCurlConfirm(v.name, v.folderPath, parseCurl(v.command))
      } catch (e: unknown) {
        overlays.importCurlRef.current?.setError(
          e instanceof Error ? e.message : String(e),
        )
      }
    },
    onExportCollectionCancel: () =>
      closeCollectionExport(
        exportPendingRef,
        overlays.setExportCollectionVisible,
      ),
    onExportCollectionConfirm: (values) => {
      const collectionName =
        collection?.name ?? (basename(collectionDir) || "collection")
      void runCollectionExport({
        collectionDir,
        collectionName,
        values,
        hasUnsavedChanges,
        pending: exportPendingRef,
      })
        .then((result) => {
          if (!result) return
          overlays.setExportCollectionVisible(false)
          showToast("Collection exported", "success")
        })
        .catch((error: unknown) => {
          overlays.exportCollectionRef.current?.setError(
            error instanceof Error ? error.message : String(error),
          )
        })
    },
    importCollectionPendingRef,
    onImportCollectionConfirm: handleImportCollectionConfirm,
    onImportOpenConfirm: (pending) => requestCollectionSwitch(pending.path),
    onEditRequestConfirm: (v) =>
      handleEditRequestConfirm(v.name, v.method as Method, v.url, v.folderPath),
    onCloneRequestConfirm: handleCloneRequestConfirm,
    onRequestDeleteConfirm: handleRequestDeleteConfirm,
    onRequestDeleteCancel: cancelRequestDelete,
    onNewFolderConfirm: handleNewFolderConfirm,
    onTagConfirm: (tag) => {
      const pending = overlays.tagEditPending
      const current = draftRef.current.draft
      if (!pending || !current) return
      const tags = [...(current.tags ?? [])]
      if (pending.index < tags.length) tags[pending.index] = tag
      else if (pending.index === tags.length) tags.push(tag)
      else return
      draftRef.current.setTags(tags)
      overlays.setTagEditPending(null)
    },
    onFolderDeleteConfirm: handleFolderDeleteConfirm,
    collectionSwitchPending,
    setCollectionSwitchPending,
    onCollectionSwitchConfirm: confirmCollectionSwitch,
    onReloadConfirm: confirmReload,
    onReloadCancel: cancelReload,
    onInitConfirm: () => executeInitPending(),
    draftRef,
    folderDraftRef,
  })

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
        appConfigDir,
        externalEditor,
        confirmUndoAll,
        renderer,
        proxyPolicy,
        tlsPolicy,
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
        folderSaveRef,
        focusedFolderPathRef,
        focusedFolderNameRef,
        folderDeletePathRef,
        getKeymapFocus: () => keymap.getData("app.focus") as string,
        getView: () => view,
        getCollectionMode: () => effectiveCollectionMode,
        setLayout,
        onLayoutChange,
        setHelpVisible: overlays.setHelpVisible,
        setAboutVisible: overlays.setAboutVisible,
        setNewEnvironmentVisible: overlays.setNewEnvironmentVisible,
        setEnvironmentPickerVisible: overlays.setEnvironmentPickerVisible,
        setNewRequestVisible: overlays.setNewRequestVisible,
        setImportCurlVisible: overlays.setImportCurlVisible,
        setNewFolderVisible: overlays.setNewFolderVisible,
        openSettingsView: handleOpenSettings,
        setCloneRequestVisible: overlays.setCloneRequestVisible,
        setEditRequestVisible: overlays.setEditRequestVisible,
        setRequestDeletePending: overlays.setRequestDeletePending,
        setFolderDeletePending: overlays.setFolderDeletePending,
        setCollectionSwitcherVisible,
        setRequestFinderVisible: overlays.setRequestFinderVisible,
        setCodeGeneratorVisible: overlays.setCodeGeneratorVisible,
        setExportCollectionVisible: overlays.setExportCollectionVisible,
        setImportCollectionVisible: overlays.setImportCollectionVisible,
        setYamlEditor: overlays.setYamlEditor,
        setView,
        setFocus,
        setUndoAllPending: overlays.setUndoAllPending,
        setInitPending: overlays.setInitPending,
        setExpanded,
        setPreviewIndexProp,
        setEnvDeletePending: overlays.setEnvDeletePending,
        onReloadCollection: requestReload,
        paletteTarget,
        openRunner: handleOpenRunner,
      }),
    [
      keybinds,
      collectionDir,
      appConfigDir,
      externalEditor,
      confirmUndoAll,
      onLayoutChange,
      setCollectionSwitcherVisible,
      handleOpenSettings,
      overlays.setImportCollectionVisible,
      requestReload,
      view,
      effectiveCollectionMode,
      paletteTarget,
      handleOpenRunner,
      proxyPolicy,
      tlsPolicy,
      draft.draft?.auth,
      collection,
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
        collectionLabel={collectionDisplayName(collectionDir, {
          name: collectionName,
        })}
        envLabel={envState.indicatorLabel}
        envStatus={envState.status}
        envColor={envState.activeEnv?.color}
        onAboutActivate={handleAboutActivate}
        onCollectionActivate={
          view !== "env-editor" && view !== "cookie-jar" && !overlayActive
            ? handleCollectionActivate
            : undefined
        }
        onEnvironmentActivate={
          view === "main" && mode === "collection" && !overlayActive
            ? handleEnvironmentActivate
            : undefined
        }
        updateFlow={updateFlow}
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
          backgroundColor: theme.backgroundPanel,
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
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={setSidebarWidth}
            paneSplitRatio={paneSplitRatios[layout]}
            onPaneSplitRatioChange={(ratio) =>
              setPaneSplitRatios((current) => ({
                ...current,
                [layout]: ratio,
              }))
            }
            expanded={expanded}
            activeEnv={envState.activeEnv}
            collectionTlsVerify={collectionTls?.verify}
            insecure={insecure}
            responseState={responseState}
            timelineEntries={timeline.entries}
            initialResponseTab={initialResponseTab}
            onResponseTabChange={onResponseTabChange}
            onOpenTimelineEntry={(entry) =>
              overlays.setTimelineDetailEntry(entry)
            }
            setSelectOpen={setSelectOpen}
            urlbarSubFocus={urlbarSubFocus}
            urlbarInteractive={activeOverlay === "none" && !isReadOnly}
            responseQueryRef={responseQueryRef}
            responseBodyForCopyRef={responseBodyForCopyRef}
            onQueryVisibleChange={setQueryVisible}
            onResponseBodyEditorAvailableChange={setResponseBodyEditorAvailable}
            onInitialize={() => overlays.setInitPending(true)}
            onCreateRequest={() => overlays.setNewRequestVisible(true)}
            onCollectionErrorDelete={deleteCollectionErrorFile}
            onCollectionErrorDirtyChange={setCollectionErrorDirty}
            collectionErrorDeleteRef={collectionErrorDeleteRef}
            collectionErrorSaveRef={collectionErrorSaveRef}
            onCollectionErrorSaved={() =>
              setCollectionReloadToken((current) => current + 1)
            }
            mode={mode}
            jumpMode={jumpMode}
            onPaneFocus={focusPane}
            onUrlbarFocus={focusUrlbar}
            onSend={
              sendCommand
                ? () => {
                    keymap.dispatchCommand(sendCommand)
                  }
                : undefined
            }
            onRequestSelect={(id) => {
              revealRequest(id)
            }}
            onFolderSelect={(path) => {
              revealFolder(path)
            }}
            onFolderToggle={(path) => {
              toggleFolder(path)
            }}
            onRequestContextMenu={(id) => {
              if (!isCollection) return
              focusPane("sidebar")
              revealRequest(id)
              setPaletteTarget("request")
              overlays.setCommandPaletteVisible(true)
            }}
            onFolderContextMenu={(path) => {
              if (!isCollection) return
              focusPane("sidebar")
              revealFolder(path)
              setPaletteTarget("folder")
              overlays.setCommandPaletteVisible(true)
            }}
          />
        ) : view === "env-editor" && mode === "collection" ? (
          <EnvironmentEditorView
            envEditor={envEditor}
            activeEnv={envState.activeEnv}
            envColors={envColors}
            focus={focus}
            envHeaderRef={envHeaderRef}
            jumpMode={jumpMode}
            onHeaderFieldFocus={(field) => {
              headerFieldRef.current = field
            }}
            onPaneFocus={focusPane}
            onCreateEnvironment={() => overlays.setNewEnvironmentVisible(true)}
            onEnvironmentContextMenu={async (name) => {
              focusPane("env-sidebar")
              if (!(await envEditor.selectEnv(name))) return
              setPaletteTarget("environment")
              overlays.setCommandPaletteVisible(true)
            }}
            setEnvDeletePending={overlays.setEnvDeletePending}
          />
        ) : view === "cookie-jar" && mode === "collection" ? (
          <CookieJarView
            view={cookieJarView}
            status={cookieStorage.status}
            focus={focus}
            jumpMode={jumpMode}
            onPaneFocus={focusPane}
            onAddCookie={() => {
              overlays.setCookieFormInitial(null)
              overlays.setCookieFormVisible(true)
            }}
            onRetry={retryCookieStorage}
            onReset={requestCookieStorageReset}
            resetKey={displayKey(keybinds.cookie_clear)}
          />
        ) : view === "runner" && mode === "collection" ? (
          <CollectionRunnerView
            runner={runner}
            focus={focus}
            hasUnsavedChanges={hasUnsavedChanges}
            detailScrollRef={runnerDetailScrollRef}
            onPaneFocus={setFocus}
            onOpenResultDetail={handleOpenRunnerResultDetail}
          />
        ) : view === "settings" ? (
          <SettingsView
            scope={visibleSettingsScope}
            category={settingsCategory}
            collectionAvailable={isCollection}
            focus={focus}
            jumpMode={jumpMode}
            activeThemeIndex={activeIndex}
            layout={layout}
            confirmUndoAll={confirmUndoAll}
            externalEditors={externalEditors}
            externalEditor={externalEditor}
            appProxy={appProxy}
            appProxyCredentials={appProxyCredentials}
            collectionProxy={collectionProxy}
            collectionProxyCredentials={collectionProxyCredentials}
            collectionTls={collectionTls}
            tlsPassphrases={tlsPassphrases}
            collectionName={collectionName}
            collectionDescription={collectionDescription}
            timelineMaxEntries={timelineMaxEntries}
            cookiesEnabled={cookiesEnabled}
            noProxy={noProxy}
            insecure={insecure}
            envNames={envState.names}
            activeEnvName={envState.activeName}
            keybinds={keybinds}
            collections={collectionPaths}
            activeCollectionDir={activeCollectionDir}
            onScopeChange={handleSettingsScopeChange}
            onCategoryChange={handleSettingsCategoryChange}
            onPaneFocus={focusPane}
            onClose={() => {
              setView("main")
              setFocus(settingsReturnFocusRef.current)
              setJumpMode(false)
            }}
            onThemeChange={onThemeChange}
            onLayoutChange={(next) => {
              if (!onLayoutChange(next)) return false
              setLayout(next)
              return true
            }}
            onConfirmUndoAllChange={onConfirmUndoAllChange}
            onExternalEditorChange={onExternalEditorChange}
            onAppProxyChange={onAppProxyChange}
            onCollectionProxyChange={onCollectionProxyChange}
            onAppProxyCredentialsChange={onAppProxyCredentialsChange}
            onCollectionProxyCredentialsChange={
              onCollectionProxyCredentialsChange
            }
            onProxyAuthDisable={onProxyAuthDisable}
            onTlsPassphraseChange={onTlsPassphraseChange}
            onTlsProfileRemove={onTlsProfileRemove}
            onCollectionSettingsChange={onCollectionSettingsChange}
            onEnvironmentChange={envState.select}
            onKeybindChange={onKeybindChange}
            onCollectionsChange={onCollectionsChange}
            onCollectionUnregister={overlays.setCollectionUnregisterPending}
            onRegisterCollection={onRegisterCollection}
          />
        ) : null}
        <AppOverlays
          overlays={overlays}
          keybinds={keybinds}
          reloadPending={reloadPending}
          collectionSwitchPending={collectionSwitchPending}
          onConfirmDialog={overlayActions.onConfirm}
          onCancelDialog={overlayActions.onCancel}
          commandPaletteCommands={commandPaletteCommands}
          exportCollectionActions={overlayActions.exportCollection}
          importCollectionActions={overlayActions.importCollection}
          importCollectionInitialParent={collapseUserPath(
            dirname(collectionDir),
          )}
          codeGeneratorRequest={draft.draft}
          codeGeneratorEnv={envState.activeEnv}
          codeGeneratorEnvName={envState.activeEnv?.name}
          collection={collection}
          requests={requests}
          onFindRequest={findRequest}
          onEditRunnerRequestTab={handleOpenRunnerRequestTab}
          collectionSwitcherVisible={collectionSwitcherVisible}
          collectionPaths={collectionPaths}
          collectionSettingsByPath={collectionSettingsByPath}
          collectionDir={collectionDir}
          requestCollectionSwitch={requestCollectionSwitch}
          setCollectionSwitcherVisible={setCollectionSwitcherVisible}
          environmentNames={envState.names}
          activeEnvironmentName={envState.activeName}
          onSelectEnvironment={handleEnvironmentSelect}
          onOpenEnvironmentEditor={handleOpenEnvironmentEditor}
          previewIndex={previewIndex}
          activeIndex={activeIndex}
          setPreviewIndex={setPreviewIndexProp}
          onThemeChange={onThemeChange}
          setCollectionReloadToken={setCollectionReloadToken}
          resetRequestDraft={draft.resetRequestDraft}
          resetFolderDraftByPath={folderDraft.clearFolderDraft}
          setFocus={setFocus}
          setSaveState={setSaveState}
          clearSaveTimer={clearSaveTimer}
          saveTimerRef={saveTimerRef}
          newEnvironmentActions={overlayActions.newEnvironment}
          cookieFormActions={overlayActions.cookieForm}
          newRequestActions={overlayActions.newRequest}
          newRequestInitialFolder={requestParentFolder ?? ""}
          importCurlActions={overlayActions.importCurl}
          importCurlInitialFolder={requestParentFolder ?? ""}
          activeEnv={envState.activeEnv}
          selectedRequest={selectedRequest}
          folderPaths={folderPaths}
          editRequestInitialFolder={editRequestInitialFolder}
          editRequestActions={overlayActions.editRequest}
          cloneRequestActions={overlayActions.cloneRequest}
          newFolderActions={overlayActions.newFolder}
          tagEditorActions={overlayActions.tagEditor}
          updateFlow={updateFlow}
          envColors={envColors}
          onLoadTimelineBody={onLoadTimelineBody}
          onCopyTimelineHeaders={onCopyTimelineHeaders}
          onCopyTimelineBody={onCopyTimelineBody}
          onExportTimelineBody={onExportTimelineBody}
        />
      </box>
      <StatusBar
        kb={keybinds}
        view={view}
        jumpMode={jumpMode}
        collectionMode={mode}
        overlayActive={overlayActive}
        globalHints={hints.header}
        footerHints={hints.footer}
        collectionPath={collectionDir}
        errorCount={collectionErrorCount}
        sendCommand={collectionErrorCount > 0 ? undefined : sendCommand}
        cookieStatus={cookieStorage.status}
        onHintActivate={handleHintActivate}
      />
    </box>
  )
}
