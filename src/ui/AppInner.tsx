import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { Sidebar } from "./Sidebar"
import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { FolderPane } from "./FolderPane"
import { useCollection } from "../hooks/useCollection"
import { useTreeNavigation } from "../hooks/useTreeNavigation"
import { deriveRequestParentFolder, getFolderPaths } from "./tree"
import { useResponse } from "../hooks/useResponse"
import type { SendCompleteResult } from "../hooks/useResponse"
import type { Folder, Request as NoodleRequest, Method } from "../schema"
import { useRequestDraft } from "../hooks/useRequestDraft"
import { useEditBrowse } from "../hooks/useEditBrowse"
import { useFolderDraft } from "../hooks/useFolderDraft"
import { useFolderEditBrowse } from "../hooks/useFolderEditBrowse"
import { useEnvironments } from "../hooks/useEnvironments"
import { useEnvironmentEditor } from "../hooks/useEnvironmentEditor"
import { type Focus } from "./focus"
import { HelpOverlay } from "./HelpOverlay"
import { ConfirmOverlay } from "./ConfirmOverlay"
import { YamlEditorOverlay } from "./YamlEditorOverlay"
import {
  NewRequestOverlay,
  slugify,
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
import { saveRequest, deleteRequest, saveFolder, deleteFolder } from "../filestore/save"
import { ThemePickerOverlay, useTheme } from "./theme"
import { StatusBar } from "./StatusBar"
import { EnvSidebar } from "./EnvSidebar"
import { EnvHeaderPane, type EnvHeaderPaneHandle } from "./EnvHeaderPane"
import { EnvEditorPane } from "./EnvEditorPane"

import { type Keybinds, displayKey } from "./keybind"
import { useSaveFile } from "./useSaveFile"
import { useAppKeymap } from "./useAppKeymap"
import { useOverlayIntercepts } from "./useOverlayIntercepts"
import { useTimeline } from "./timeline/useTimeline"
import { buildTimelineEntry } from "./timeline/formatTimeline"
import { substitute } from "../requests"
import { getRequestIds, findFolderByPath, updateFolderByPath } from "./tree"
import { useUIState } from "./tabs/useUIState"
import {
  saveLastRequest,
  loadExpandedFolders,
  saveExpandedFolders,
} from "./tabs/uiState"
import type { FieldKind } from "./editMode"
import type { ResponseTabKind } from "./tabs/uiState"

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
  onLayoutChange,
  onEnvChange,
  onEnvListChanged,
  settingsEnv,
  initialLastRequestId,
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
  onLayoutChange: (layout: "stacked" | "side-by-side") => void
  onEnvChange: (name: string | null) => void
  onEnvListChanged: () => Promise<void>
  settingsEnv?: string
  initialLastRequestId?: string
}) {
  const keymap = useKeymap()
  const theme = useTheme()

  // ── State ───────────────────────────────────────────────────────────
  const [focus, setFocus] = useState<Focus>("sidebar")
  const focusRef = useRef(focus)
  focusRef.current = focus
  const [view, setView] = useState<"main" | "env-editor">("main")
  const viewRef = useRef(view)
  viewRef.current = view
  const [helpVisible, setHelpVisible] = useState(false)
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
    returnFocus: Focus
  }>({ visible: false, filePath: "", requestName: "", returnFocus: "sidebar" })

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
  const [folderDeletePending, setFolderDeletePending] = useState<
    string | null
  >(null)
  const folderDeletePathRef = useRef<string | null>(null)
  const [initialExpandedFolders, setInitialExpandedFolders] =
    useState<Set<string> | null>(null)
  const headerFieldRef = useRef<"name" | "color">("name")

  // ── Collection ──────────────────────────────────────────────────────
  const { collection, loading, error, updateCollection } = useCollection(
    collectionDir,
    collectionReloadToken,
  )
  const items = collection?.items ?? []

  const requestIds = useMemo(() => getRequestIds(items), [items])
  const { getTab, setTab } = useUIState(collectionDir, requestIds)

  useEffect(() => {
    loadExpandedFolders(collectionDir).then(setInitialExpandedFolders)
  }, [collectionDir])

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
    () => (focusedFolderPath ? findFolderByPath(items, focusedFolderPath) : null),
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
      label: f.path === "" ? "(root)" : f.path,
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

  const dirtyFolderPaths = folderDraft.dirtyPaths
  const folderDraftRef = useRef(folderDraft)
  folderDraftRef.current = folderDraft

  useEffect(() => {
    setExpanded(null)
  }, [selectedRequest?.id])

  const saveLastReqRef = useRef(false)
  const saveLastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
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
  }, [selectedId, focusedFolderPath])

  const expandedSaveRef = useRef(false)
  const expandedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
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
  }, [expandedFolders, collectionDir])

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

  // ── Folder save ────────────────────────────────────────────────────
  const folderSaveRef = useRef<() => void>(() => {})

  const handleFolderSave = useCallback(async () => {
    const draftFolder = folderDraftRef.current?.folderDraft
    if (!draftFolder || !collection) return
    try {
      await saveFolder(collectionDir, draftFolder)
      folderDraftRef.current?.markSaved()
      updateCollection({
        ...collection,
        items: updateFolderByPath(collection.items, draftFolder.path, draftFolder),
      })
      setSaveState({ kind: "success", message: `Saved folder ${draftFolder.name}` })
      clearSaveTimer()
      saveTimerRef.current = setTimeout(() => setSaveState({ kind: "idle" }), 2000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSaveState({ kind: "error", message: msg })
      clearSaveTimer()
      saveTimerRef.current = setTimeout(() => setSaveState({ kind: "idle" }), 2000)
    }
  }, [collection, collectionDir, setSaveState, updateCollection, clearSaveTimer, saveTimerRef])

  folderSaveRef.current = handleFolderSave

  const handleNewRequestConfirm = useCallback(
    (name: string, method: Method, url: string) => {
      const baseId = slugify(name)
      if (!baseId) return
      const folder = newRequestFolderRef.current
      const id = folder ? `${folder}/${baseId}` : baseId

      const req: NoodleRequest = {
        id,
        name,
        method,
        url,
        timeout: 0,
        followRedirects: true,
        maxRedirects: 5,
        headers: {},
        params: {},
        auth: { type: "none" },
        bodyType: "none",
        body: "",
      }

      saveRequest(collectionDir, req)
        .then(() => {
          if (folder) expandFolder(folder)
          setCollectionReloadToken((n) => n + 1)
          setSelectedId(id)
          setNewRequestVisible(false)
          setFocus("sidebar")
          setSaveState({ kind: "success", message: `Created ${name}` })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          setSaveState({ kind: "error", message: msg })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
    },
    [
      collectionDir,
      setCollectionReloadToken,
      setFocus,
      setSaveState,
      clearSaveTimer,
      saveTimerRef,
      setSelectedId,
      expandFolder,
    ],
  )

  const handleCloneRequestConfirm = useCallback(
    (newName: string) => {
      const req = selectedRequest
      if (!req) return
      const baseId = slugify(newName)
      if (!baseId) return
      const lastSlash = req.id.lastIndexOf("/")
      const id =
        lastSlash >= 0 ? `${req.id.slice(0, lastSlash)}/${baseId}` : baseId

      const cloned: NoodleRequest = {
        ...req,
        id,
        name: newName,
      }

      saveRequest(collectionDir, cloned)
        .then(() => {
          setCollectionReloadToken((n) => n + 1)
          setCloneRequestVisible(false)
          setFocus("sidebar")
          setSelectedId(id)
          const lastSlash = id.lastIndexOf("/")
          if (lastSlash >= 0) expandFolder(id.slice(0, lastSlash))
          setSaveState({ kind: "success", message: `Cloned ${newName}` })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          setSaveState({ kind: "error", message: msg })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
    },
    [
      selectedRequest,
      collectionDir,
      setCollectionReloadToken,
      setFocus,
      setSaveState,
      clearSaveTimer,
      saveTimerRef,
      setSelectedId,
      expandFolder,
    ],
  )

  const handleNewFolderConfirm = useCallback(
    (name: string) => {
      const baseId = slugify(name)
      if (!baseId) return
      const folder = newRequestFolderRef.current
      const path = folder ? `${folder}/${baseId}` : baseId

      const newFolder: Folder = {
        id: baseId,
        name,
        path,
        children: [],
      }

      saveFolder(collectionDir, newFolder)
        .then(() => {
          if (folder) expandFolder(folder)
          setCollectionReloadToken((n) => n + 1)
          setNewFolderVisible(false)
          setFocus("sidebar")
          setSaveState({ kind: "success", message: `Created folder ${name}` })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          setSaveState({ kind: "error", message: msg })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
    },
    [
      collectionDir,
      setCollectionReloadToken,
      setFocus,
      setSaveState,
      clearSaveTimer,
      saveTimerRef,
      expandFolder,
    ],
  )

  const handleFolderDeleteConfirm = useCallback(() => {
    const path = folderDeletePathRef.current
    if (!path) return

    deleteFolder(collectionDir, path)
      .then(() => {
        setCollectionReloadToken((n) => n + 1)
        setFolderDeletePending(null)
        setFocus("sidebar")
        setSaveState({ kind: "success", message: `Deleted folder ${path}` })
        clearSaveTimer()
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, 2000)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setSaveState({ kind: "error", message: msg })
        clearSaveTimer()
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, 2000)
      })
  }, [
    collectionDir,
    setCollectionReloadToken,
    setFocus,
    setSaveState,
    clearSaveTimer,
    saveTimerRef,
  ])

  const handleEditRequestConfirm = useCallback(
    (name: string, method: Method, url: string, folderPath?: string) => {
      const req = selectedRequest
      if (!req) return
      const baseId = slugify(name)
      if (!baseId) return

      const newFolder = folderPath ?? ""
      const newId = newFolder ? `${newFolder}/${baseId}` : baseId

      const oldFolder = req.id.includes("/")
        ? req.id.slice(0, req.id.lastIndexOf("/"))
        : ""

      const nameChanged = newId !== req.id
      const folderChanged = newFolder !== oldFolder
      const changed = nameChanged || folderChanged

      if (!changed) {
        setEditRequestVisible(false)
        setFocus("sidebar")
        return
      }

      const updated: NoodleRequest = {
        ...req,
        id: newId,
        name,
        method,
        url,
      }

      const savePromise = saveRequest(collectionDir, updated).then(() => {
        if (nameChanged || folderChanged) {
          return deleteRequest(collectionDir, req.id)
        }
      })

      savePromise
        .then(() => {
          setCollectionReloadToken((n) => n + 1)
          setEditRequestVisible(false)
          setFocus("sidebar")
          if (newFolder) expandFolder(newFolder)
          setSaveState({ kind: "success", message: `Saved ${name}` })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          setSaveState({ kind: "error", message: msg })
          clearSaveTimer()
          saveTimerRef.current = setTimeout(() => {
            setSaveState({ kind: "idle" })
          }, 2000)
        })
    },
    [
      selectedRequest,
      collectionDir,
      setCollectionReloadToken,
      setFocus,
      setSaveState,
      clearSaveTimer,
      saveTimerRef,
      expandFolder,
    ],
  )

  const handleRequestDeleteConfirm = useCallback(() => {
    const req = selectedRequest
    if (!req) return

    deleteRequest(collectionDir, req.id)
      .then(() => {
        setCollectionReloadToken((n) => n + 1)
        setRequestDeletePending(null)
        setFocus("sidebar")
        setSaveState({ kind: "success", message: `Deleted ${req.name}` })
        clearSaveTimer()
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, 2000)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setSaveState({ kind: "error", message: msg })
        clearSaveTimer()
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, 2000)
      })
  }, [
    selectedRequest,
    collectionDir,
    setCollectionReloadToken,
    setFocus,
    setSaveState,
    clearSaveTimer,
    saveTimerRef,
  ])

  // ── keymap.setData effects ─────────────────────────────────────────
  useEffect(() => {
    keymap.setData("app.focus", focus)
    if (focus === "env-header") {
      headerFieldRef.current = "name"
    }
  }, [focus, keymap])

  useEffect(() => {
    const overlay = helpVisible
      ? "help"
      : previewIndex !== null
        ? "theme"
        : saveState.kind === "confirming"
          ? "confirm"
          : yamlEditor.visible
            ? "yaml-editor"
            : newRequestVisible
              ? "new-request"
              : editRequestVisible
                ? "edit-request"
            : cloneRequestVisible
              ? "clone-request"
              : newFolderVisible
                ? "new-folder"
                : folderDeletePending !== null
                  ? "delete-folder"
                : requestDeletePending !== null
                  ? "request-delete"
                  : "none"
    keymap.setData("app.overlay", overlay)
  }, [
    helpVisible,
    previewIndex,
    saveState.kind,
    yamlEditor.visible,
    newRequestVisible,
    editRequestVisible,
    cloneRequestVisible,
    newFolderVisible,
    folderDeletePending,
    requestDeletePending,
    keymap,
  ])

  useEffect(() => {
    keymap.setData("app.view", view)
  }, [view, keymap])

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
    keymap.setData("app.mode", focus === "folder" ? folderMode : requestMode)
  }, [eb.editState.mode, folderEb.editState.mode, focus, keymap])

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
  }, [focus, eb, folderEb])

  useEffect(() => {
    if (focus === "folder" && folderEb.editState.mode === "inactive") {
      folderEb.enterBrowse()
    }
  }, [focus, folderEb])

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

  const timeline = useTimeline(collectionDir, selectedRequest?.id)
  const timelineAppendRef = useRef(timeline.appendEntry)
  timelineAppendRef.current = timeline.appendEntry

  const onCompleteRef = useRef(
    (_req: NoodleRequest, _result: SendCompleteResult) => {},
  )
  onCompleteRef.current = (req: NoodleRequest, result: SendCompleteResult) => {
    let resolvedUrl: string | undefined
    const activeEnv = envStateRef.current.activeEnv
    if (activeEnv) {
      try {
        resolvedUrl = substitute(req, activeEnv).url
      } catch {
        resolvedUrl = undefined
      }
    }
    timelineAppendRef.current(
      buildTimelineEntry(req, result, envNameRef.current, resolvedUrl),
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

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const folderViewRef = useRef(false)
  folderViewRef.current = focusedFolder !== null

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
    },
    {
      setFocus,
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
      onLayoutChange,
      setExpanded,
    },
    collectionDir,
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
          <box
            style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}
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
              dirtyFolderPaths={dirtyFolderPaths}
            />
            <box
              style={{
                flexDirection: "column",
                flexGrow: 1,
                gap: 1,
                minHeight: 0,
              }}
            >
              {focusedFolder !== null ? (
                <FolderPane
                  folder={folderDraft.folderDraft}
                  focused={focus === "folder"}
                  editState={folderEb.editState}
                  editKey={folderEb.editKey}
                  editValue={folderEb.editValue}
                  setEditKey={folderEb.setEditKey}
                  setEditValue={folderEb.setEditValue}
                  activeTab={folderEb.activeTab}
                  onTabChange={() => {}}
                  onAuthTypeChange={folderDraft.setAuthType}
                  onApiKeyPlacementChange={folderDraft.setApiKeyPlacement}
                  onSelectOpenChange={setSelectOpen}
                  activeEnv={envState.activeEnv}
                  theme={theme}
                />
              ) : (
                <>
                  <UrlBar
                    method={draft.draft?.method ?? ""}
                    url={draft.draft?.url ?? ""}
                    params={draft.draft?.params ?? {}}
                    setUrl={draft.setUrl}
                    onDefocus={draft.syncUrlParams}
                    focused={focus === "urlbar"}
                    activeEnv={envState.activeEnv}
                  />
                  {layout === "side-by-side" ? (
                    <box
                      style={{
                        flexDirection: "row",
                        flexGrow: 1,
                        gap: 1,
                        minHeight: 0,
                      }}
                    >
                      {expanded !== "response" && (
                        <RequestPane
                          request={draft.draft}
                          editState={eb.editState}
                          editKey={eb.editKey}
                          editValue={eb.editValue}
                          setEditKey={eb.setEditKey}
                          setEditValue={eb.setEditValue}
                          focused={focus === "request"}
                          activeTab={eb.activeTab}
                          activeEnv={envState.activeEnv}
                          onAuthTypeChange={draft.setAuthType}
                          onApiKeyPlacementChange={draft.setApiKeyPlacement}
                          onBodyTypeChange={draft.setBodyType}
                          onSelectOpenChange={setSelectOpen}
                          expandHint={expandHint}
                        />
                      )}
                      {expanded !== "request" && (
                        <ResponsePane
                          state={responseState}
                          focused={focus === "response"}
                          timelineEntries={timeline.entries}
                          initialTab={initialResponseTab}
                          onTabChange={onResponseTabChange}
                          expandHint={expandHint}
                        />
                      )}
                    </box>
                  ) : (
                    <>
                      {expanded !== "response" && (
                        <RequestPane
                          request={draft.draft}
                          editState={eb.editState}
                          editKey={eb.editKey}
                          editValue={eb.editValue}
                          setEditKey={eb.setEditKey}
                          setEditValue={eb.setEditValue}
                          focused={focus === "request"}
                          activeTab={eb.activeTab}
                          activeEnv={envState.activeEnv}
                          onAuthTypeChange={draft.setAuthType}
                          onApiKeyPlacementChange={draft.setApiKeyPlacement}
                          onBodyTypeChange={draft.setBodyType}
                          onSelectOpenChange={setSelectOpen}
                          expandHint={expandHint}
                        />
                      )}
                      {expanded !== "request" && (
                        <ResponsePane
                          state={responseState}
                          focused={focus === "response"}
                          timelineEntries={timeline.entries}
                          initialTab={initialResponseTab}
                          onTabChange={onResponseTabChange}
                          expandHint={expandHint}
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </box>
          </box>
        ) : (
          <box
            style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}
          >
            <EnvSidebar
              envNames={envEditor.envNames}
              selectedEnvName={envEditor.selectedEnvName}
              activeEnvName={envState.activeEnv?.name}
              envColors={envColors}
              dirty={envEditor.dirty}
              onSelectEnv={envEditor.selectEnv}
              onCreate={() => {
                envEditor.openEditor()
                setFocus("env-vars")
              }}
              onClone={() => {
                if (envEditor.selectedEnvName) {
                  const target = `${envEditor.selectedEnvName} - Copy`
                  envEditor.cloneEnv(target)
                }
              }}
              onDelete={() => {
                if (envEditor.selectedEnvName) {
                  setEnvDeletePending(envEditor.selectedEnvName)
                  setDeleteConfirmSelection(0)
                }
              }}
              focused={focus === "env-sidebar"}
            />
            <box
              style={{
                flexDirection: "column",
                flexGrow: 1,
                gap: 1,
                minHeight: 0,
              }}
            >
              <EnvHeaderPane
                ref={envHeaderRef}
                name={envEditor.draft?.name ?? ""}
                color={envEditor.draft?.color}
                onNameChange={envEditor.setName}
                onColorChange={envEditor.setColor}
                focused={focus === "env-header"}
              />
              <EnvEditorPane
                draft={envEditor.draft}
                selectedRowIndex={envEditor.selectedRowIndex}
                editingField={envEditor.editingField}
                saving={envEditor.saving}
                error={envEditor.error}
                onSelectRow={envEditor.selectRow}
                onUpdateVarKey={envEditor.updateVarKey}
                onUpdateVarValue={envEditor.updateVarValue}
                onToggleVar={envEditor.toggleVar}
                onDeleteVar={envEditor.deleteVar}
                focused={focus === "env-vars"}
              />
            </box>
          </box>
        )}
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
        {previewIndex !== null && (
          <ThemePickerOverlay
            visible
            activeIndex={activeIndex}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndexProp}
            onThemeChange={onThemeChange}
          />
        )}
        {yamlEditor.visible && (
          <YamlEditorOverlay
            visible
            filePath={yamlEditor.filePath}
            requestName={yamlEditor.requestName}
            onSaved={() => {
              setCollectionReloadToken((n) => n + 1)
              setYamlEditor({
                visible: false,
                filePath: "",
                requestName: "",
                returnFocus: "sidebar",
              })
              setFocus(yamlEditor.returnFocus)
              setSaveState({
                kind: "success",
                message: `Saved ${yamlEditor.filePath.split("/").pop() ?? ""}`,
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
                returnFocus: "sidebar",
              })
              setFocus(yamlEditor.returnFocus)
            }}
          />
        )}
        {newRequestVisible && <NewRequestOverlay visible ref={newRequestRef} />}
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
          />
        )}
        {cloneRequestVisible && (
          <CloneRequestOverlay
            visible
            initialName={
              selectedRequest ? `${selectedRequest.name} - Copy` : ""
            }
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
