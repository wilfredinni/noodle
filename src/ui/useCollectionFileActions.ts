import { useCallback, useRef } from "react"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type {
  Collection,
  Folder,
  Method,
  Request as NoodleRequest,
} from "../schema"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import {
  saveRequest,
  deleteRequest,
  saveFolder,
  deleteFolder,
  ensureCollectionBootstrapped,
} from "../filestore"
import { slugify } from "./overlays/NewRequestOverlay"
import { updateFolderByPath } from "./tree"
import type { Focus } from "./focus"
import type { SaveState } from "./saveState"

type InitPendingAction =
  | {
      kind: "request"
      name: string
      method: Method
      url: string
      folder?: string
      id: string
    }
  | {
      kind: "folder"
      name: string
      folder?: string
      id: string
    }

interface UseCollectionFileActionsOptions {
  collectionDir: string
  collection: Collection | null
  updateCollection: (collection: Collection) => void
  selectedRequest: NoodleRequest | null
  folderDraftRef: MutableRefObject<UseFolderDraftResult>
  newRequestFolderRef: MutableRefObject<string | null>
  folderDeletePathRef: MutableRefObject<string | null>
  setCollectionReloadToken: Dispatch<SetStateAction<number>>
  setFocus: Dispatch<SetStateAction<Focus>>
  setSaveState: Dispatch<SetStateAction<SaveState>>
  clearSaveTimer: () => void
  saveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  setSelectedId: (id: string) => void
  expandFolder: (path: string) => void
  setNewRequestVisible: Dispatch<SetStateAction<boolean>>
  setCloneRequestVisible: Dispatch<SetStateAction<boolean>>
  setNewFolderVisible: Dispatch<SetStateAction<boolean>>
  setEditRequestVisible: Dispatch<SetStateAction<boolean>>
  setRequestDeletePending: Dispatch<SetStateAction<string | null>>
  setFolderDeletePending: Dispatch<SetStateAction<string | null>>
  onCollectionBootstrapped: (dir: string) => void
  onInitRequested?: () => void
}

export function useCollectionFileActions({
  collectionDir,
  collection,
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
  onInitRequested,
}: UseCollectionFileActionsOptions) {
  const initPendingRef = useRef<InitPendingAction | null>(null)

  const showSaveResult = useCallback(
    (state: SaveState) => {
      setSaveState(state)
      clearSaveTimer()
      saveTimerRef.current = setTimeout(() => {
        setSaveState({ kind: "idle" })
      }, 2000)
    },
    [clearSaveTimer, saveTimerRef, setSaveState],
  )

  const showError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      showSaveResult({ kind: "error", message: msg })
    },
    [showSaveResult],
  )

  const handleFolderSave = useCallback(async () => {
    const draftFolder = folderDraftRef.current?.folderDraft
    if (!draftFolder || !collection) return
    try {
      await saveFolder(collectionDir, draftFolder)
      folderDraftRef.current?.markSaved()
      updateCollection({
        ...collection,
        items: updateFolderByPath(
          collection.items,
          draftFolder.path,
          draftFolder,
        ),
      })
      showSaveResult({
        kind: "success",
        message: `Successfully saved folder ${draftFolder.name}`,
      })
    } catch (e: unknown) {
      showError(e)
    }
  }, [
    collection,
    collectionDir,
    folderDraftRef,
    showError,
    showSaveResult,
    updateCollection,
  ])

  const handleNewRequestConfirm = useCallback(
    (name: string, method: Method, url: string) => {
      const baseId = slugify(name)
      if (!baseId) return
      const folder = newRequestFolderRef.current
      const id = folder ? `${folder}/${baseId}` : baseId

      const settingsPath = join(collectionDir, "settings.yml")
      const needsBootstrap = !existsSync(settingsPath)

      if (needsBootstrap && onInitRequested) {
        initPendingRef.current = {
          kind: "request",
          name,
          method,
          url,
          folder: folder ?? undefined,
          id,
        }
        onInitRequested()
        return
      }

      const req: NoodleRequest = {
        id,
        name,
        method,
        url,
        timeout: 0,
        followRedirects: true,
        maxRedirects: 5,
        headers: {},
        params: [],
        auth: { type: "none" },
        bodyType: "none",
        body: "",
      }

      const savePromise = needsBootstrap
        ? ensureCollectionBootstrapped(collectionDir).then(() =>
            saveRequest(collectionDir, req),
          )
        : saveRequest(collectionDir, req)

      savePromise
        .then(() => {
          if (needsBootstrap) {
            onCollectionBootstrapped(collectionDir)
          }
          if (folder) expandFolder(folder)
          setCollectionReloadToken((n) => n + 1)
          setSelectedId(id)
          setNewRequestVisible(false)
          setFocus("sidebar")
          showSaveResult({
            kind: "success",
            message: `Successfully created ${name}`,
          })
        })
        .catch(showError)
    },
    [
      collectionDir,
      expandFolder,
      newRequestFolderRef,
      onCollectionBootstrapped,
      onInitRequested,
      setCollectionReloadToken,
      setFocus,
      setNewRequestVisible,
      setSelectedId,
      showError,
      showSaveResult,
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
          showSaveResult({
            kind: "success",
            message: `Successfully created ${newName}`,
          })
        })
        .catch(showError)
    },
    [
      collectionDir,
      expandFolder,
      selectedRequest,
      setCloneRequestVisible,
      setCollectionReloadToken,
      setFocus,
      setSelectedId,
      showError,
      showSaveResult,
    ],
  )

  const handleNewFolderConfirm = useCallback(
    (name: string) => {
      const baseId = slugify(name)
      if (!baseId) return
      const folder = newRequestFolderRef.current
      const path = folder ? `${folder}/${baseId}` : baseId

      const settingsPath = join(collectionDir, "settings.yml")
      const needsBootstrap = !existsSync(settingsPath)

      if (needsBootstrap && onInitRequested) {
        initPendingRef.current = {
          kind: "folder",
          name,
          folder: folder ?? undefined,
          id: path,
        }
        onInitRequested()
        return
      }

      const newFolder: Folder = {
        id: baseId,
        name,
        path,
        children: [],
      }

      const savePromise = needsBootstrap
        ? ensureCollectionBootstrapped(collectionDir).then(() =>
            saveFolder(collectionDir, newFolder),
          )
        : saveFolder(collectionDir, newFolder)

      savePromise
        .then(() => {
          if (needsBootstrap) {
            onCollectionBootstrapped(collectionDir)
          }
          if (folder) expandFolder(folder)
          setCollectionReloadToken((n) => n + 1)
          setNewFolderVisible(false)
          setFocus("sidebar")
          showSaveResult({
            kind: "success",
            message: `Successfully created folder ${name}`,
          })
        })
        .catch(showError)
    },
    [
      collectionDir,
      expandFolder,
      newRequestFolderRef,
      onCollectionBootstrapped,
      onInitRequested,
      setCollectionReloadToken,
      setFocus,
      setNewFolderVisible,
      showError,
      showSaveResult,
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
        showSaveResult({
          kind: "success",
          message: `Successfully deleted folder ${path}`,
        })
      })
      .catch(showError)
  }, [
    collectionDir,
    folderDeletePathRef,
    setCollectionReloadToken,
    setFocus,
    setFolderDeletePending,
    showError,
    showSaveResult,
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
      const changed = nameChanged || method !== req.method || url !== req.url

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
          deleteRequest(collectionDir, req.id).catch(() => {
            /* stale file not cleaned up - new file is safe */
          })
        }
      })

      savePromise
        .then(() => {
          setCollectionReloadToken((n) => n + 1)
          setSelectedId(newId)
          setEditRequestVisible(false)
          setFocus("sidebar")
          if (newFolder) expandFolder(newFolder)
          showSaveResult({
            kind: "success",
            message: `Successfully edited ${name}`,
          })
        })
        .catch(showError)
    },
    [
      collectionDir,
      expandFolder,
      selectedRequest,
      setCollectionReloadToken,
      setEditRequestVisible,
      setFocus,
      setSelectedId,
      showError,
      showSaveResult,
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
        showSaveResult({
          kind: "success",
          message: `Successfully deleted ${req.name}`,
        })
      })
      .catch(showError)
  }, [
    collectionDir,
    selectedRequest,
    setCollectionReloadToken,
    setFocus,
    setRequestDeletePending,
    showError,
    showSaveResult,
  ])

  const executeInitPending = useCallback(async () => {
    const action = initPendingRef.current
    if (!action) return
    initPendingRef.current = null

    try {
      await ensureCollectionBootstrapped(collectionDir)
      onCollectionBootstrapped(collectionDir)

      if (action.kind === "folder") {
        const newFolder: Folder = {
          id: action.id,
          name: action.name,
          path: action.id,
          children: [],
        }
        await saveFolder(collectionDir, newFolder)
        if (action.folder) expandFolder(action.folder)
        setNewFolderVisible(false)
      } else {
        const req: NoodleRequest = {
          id: action.id,
          name: action.name,
          method: action.method,
          url: action.url,
          timeout: 0,
          followRedirects: true,
          maxRedirects: 5,
          headers: {},
          params: [],
          auth: { type: "none" },
          bodyType: "none",
          body: "",
        }
        await saveRequest(collectionDir, req)
        if (action.folder) expandFolder(action.folder)
        setNewRequestVisible(false)
      }

      setCollectionReloadToken((n) => n + 1)
      setSelectedId(action.id)
      setFocus("sidebar")
      showSaveResult({
        kind: "success",
        message: `Successfully created ${action.name}`,
      })
    } catch (e: unknown) {
      showError(e)
    }
  }, [
    collectionDir,
    expandFolder,
    onCollectionBootstrapped,
    setCollectionReloadToken,
    setFocus,
    setNewFolderVisible,
    setNewRequestVisible,
    setSelectedId,
    showError,
    showSaveResult,
  ])

  return {
    handleFolderSave,
    handleNewRequestConfirm,
    handleCloneRequestConfirm,
    handleNewFolderConfirm,
    handleFolderDeleteConfirm,
    handleEditRequestConfirm,
    handleRequestDeleteConfirm,
    initPendingRef,
    executeInitPending,
  }
}
