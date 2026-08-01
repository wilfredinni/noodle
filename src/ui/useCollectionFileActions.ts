import { useCallback } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import type {
  Collection,
  Folder,
  Method,
  Request as NoodleRequest,
} from "../schema"
import type { UseFolderDraftResult } from "../hooks/useFolderDraft"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import {
  saveRequest,
  deleteRequest,
  saveFolder,
  deleteFolder,
  ensureCollectionBootstrapped,
} from "../filestore"
import { slugify } from "./overlays/NewRequestOverlay"
import { updateFolderByPath } from "./tree"
import { syncParamsWithUrl, syncPathParamsWithUrl } from "./urlParams"
import type { Focus } from "./focus"
import type { SaveState } from "./saveState"

interface UseCollectionFileActionsOptions {
  collectionDir: string
  collection: Collection | null
  updateCollection: Dispatch<SetStateAction<Collection | null>>
  selectedRequest: NoodleRequest | null
  requestDraftRef: MutableRefObject<UseRequestDraftResult>
  folderDraftRef: MutableRefObject<UseFolderDraftResult>
  newRequestFolderRef: MutableRefObject<string | null>
  folderDeletePathRef: MutableRefObject<string | null>
  setCollectionReloadToken: Dispatch<SetStateAction<number>>
  setFocus: Dispatch<SetStateAction<Focus>>
  setSaveState: Dispatch<SetStateAction<SaveState>>
  savingRef: MutableRefObject<boolean>
  clearSaveTimer: () => void
  saveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  setSelectedId: (id: string) => void
  expandFolder: (path: string) => void
  setNewRequestVisible: Dispatch<SetStateAction<boolean>>
  setImportCurlVisible: Dispatch<SetStateAction<boolean>>
  setCloneRequestVisible: Dispatch<SetStateAction<boolean>>
  setNewFolderVisible: Dispatch<SetStateAction<boolean>>
  setEditRequestVisible: Dispatch<SetStateAction<boolean>>
  setRequestDeletePending: Dispatch<SetStateAction<string | null>>
  setFolderDeletePending: Dispatch<SetStateAction<string | null>>
  onCollectionBootstrapped: (dir: string) => void
}

export function useCollectionFileActions({
  collectionDir,
  collection,
  updateCollection,
  selectedRequest,
  requestDraftRef,
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
  setNewRequestVisible,
  setImportCurlVisible,
  setCloneRequestVisible,
  setNewFolderVisible,
  setEditRequestVisible,
  setRequestDeletePending,
  setFolderDeletePending,
  onCollectionBootstrapped,
}: UseCollectionFileActionsOptions) {
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
    if (!draftFolder || !collection || savingRef.current) return
    savingRef.current = true
    try {
      await saveFolder(collectionDir, draftFolder)
      folderDraftRef.current?.markSaved(draftFolder)
      updateCollection((current) =>
        current
          ? {
              ...current,
              items: updateFolderByPath(
                current.items,
                draftFolder.path,
                draftFolder,
              ),
            }
          : current,
      )
      showSaveResult({
        kind: "success",
        message: `Successfully saved folder ${draftFolder.name}`,
      })
    } catch (e: unknown) {
      showError(e)
    } finally {
      savingRef.current = false
    }
  }, [
    collection,
    collectionDir,
    folderDraftRef,
    savingRef,
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

      saveRequest(collectionDir, req)
        .then(() => {
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

  const handleImportCurlConfirm = useCallback(
    (
      name: string,
      folderPath: string,
      imported: Omit<NoodleRequest, "id" | "name">,
    ) => {
      const baseId = slugify(name)
      if (!baseId) return
      const id = folderPath ? `${folderPath}/${baseId}` : baseId
      const request: NoodleRequest = { ...imported, id, name }

      saveRequest(collectionDir, request)
        .then(() => {
          if (folderPath) expandFolder(folderPath)
          setCollectionReloadToken((n) => n + 1)
          setSelectedId(id)
          setImportCurlVisible(false)
          setFocus("sidebar")
          showSaveResult({
            kind: "success",
            message: `Successfully imported ${name}`,
          })
        })
        .catch(showError)
    },
    [
      collectionDir,
      expandFolder,
      setCollectionReloadToken,
      setFocus,
      setImportCurlVisible,
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

      const synced = syncParamsWithUrl(req.params, url)
      const pathParams = syncPathParamsWithUrl(req.pathParams ?? [], url)
      const nameChanged = newId !== req.id
      const folderChanged = newFolder !== oldFolder
      const changed =
        nameChanged ||
        method !== req.method ||
        synced.baseUrl !== req.url ||
        JSON.stringify(synced.params) !== JSON.stringify(req.params) ||
        JSON.stringify(pathParams) !== JSON.stringify(req.pathParams ?? [])

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
        url: synced.baseUrl,
        params: synced.params,
        ...(req.pathParams !== undefined || pathParams.length > 0
          ? { pathParams }
          : {}),
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
          requestDraftRef.current.moveRequestDraft(req.id, updated)
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
      requestDraftRef,
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
    try {
      await ensureCollectionBootstrapped(collectionDir)
      onCollectionBootstrapped(collectionDir)
      setCollectionReloadToken((n) => n + 1)
      setFocus("sidebar")
      showSaveResult({
        kind: "success",
        message: "Collection initialized",
      })
    } catch (e: unknown) {
      showError(e)
    }
  }, [
    collectionDir,
    onCollectionBootstrapped,
    setCollectionReloadToken,
    setFocus,
    showError,
    showSaveResult,
  ])

  return {
    handleFolderSave,
    handleNewRequestConfirm,
    handleImportCurlConfirm,
    handleCloneRequestConfirm,
    handleNewFolderConfirm,
    handleFolderDeleteConfirm,
    handleEditRequestConfirm,
    handleRequestDeleteConfirm,
    executeInitPending,
  }
}
