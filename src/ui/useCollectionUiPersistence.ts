import { useEffect, useRef, useState } from "react"
import {
  loadExpandedFolders,
  saveExpandedFolders,
  saveLastRequest,
} from "./tabs/uiState"

export function useInitialExpandedFolders(
  collectionDir: string,
  isCollection: boolean,
): Set<string> | null {
  const [initialExpandedFolders, setInitialExpandedFolders] =
    useState<Set<string> | null>(null)

  useEffect(() => {
    if (!isCollection) return
    let active = true
    loadExpandedFolders(collectionDir).then((folders) => {
      if (active) setInitialExpandedFolders(folders)
    })
    return () => {
      active = false
    }
  }, [collectionDir, isCollection])

  return initialExpandedFolders
}

export function useCollectionUiPersistence({
  collectionDir,
  isCollection,
  selectedId,
  focusedFolderPath,
  requestIds,
  expandedFolders,
}: {
  collectionDir: string
  isCollection: boolean
  selectedId: string | null
  focusedFolderPath: string | null
  requestIds: string[]
  expandedFolders: Set<string>
}): void {
  const saveLastRequestStarted = useRef(false)
  const saveLastRequestTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const saveExpandedFoldersStarted = useRef(false)
  const saveExpandedFoldersTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    if (!isCollection) return
    if (!saveLastRequestStarted.current) {
      saveLastRequestStarted.current = true
      return
    }
    const lastId = focusedFolderPath ? `${focusedFolderPath}/` : selectedId
    if (!lastId) return
    if (saveLastRequestTimer.current) clearTimeout(saveLastRequestTimer.current)
    saveLastRequestTimer.current = setTimeout(() => {
      saveLastRequest(collectionDir, lastId, new Set(requestIds)).catch(
        (e: unknown) => {
          console.error("Failed to save last request:", e)
        },
      )
    }, 200)
    return () => {
      if (saveLastRequestTimer.current)
        clearTimeout(saveLastRequestTimer.current)
    }
  }, [collectionDir, focusedFolderPath, isCollection, requestIds, selectedId])

  useEffect(() => {
    if (!isCollection) return
    if (!saveExpandedFoldersStarted.current) {
      saveExpandedFoldersStarted.current = true
      return
    }
    if (saveExpandedFoldersTimer.current)
      clearTimeout(saveExpandedFoldersTimer.current)
    saveExpandedFoldersTimer.current = setTimeout(() => {
      saveExpandedFolders(collectionDir, expandedFolders).catch(
        (e: unknown) => {
          console.error("Failed to save expanded folders:", e)
        },
      )
    }, 300)
    return () => {
      if (saveExpandedFoldersTimer.current)
        clearTimeout(saveExpandedFoldersTimer.current)
    }
  }, [collectionDir, expandedFolders, isCollection])
}
