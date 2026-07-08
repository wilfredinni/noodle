import { useCallback, useEffect, useRef, useState } from "react"
import type { Dispatch, SetStateAction, RefObject } from "react"
import type { Request } from "../schema"
import type { SaveState } from "./saveState"
import { filestore } from "../filestore"

const SAVE_SUCCESS_MS = 2000
const SAVE_ERROR_MS = 3000

export interface UseSaveFileResult {
  saveState: SaveState
  setSaveState: Dispatch<SetStateAction<SaveState>>
  doSave: () => void
  clearSaveTimer: () => void
  savingRef: RefObject<boolean>
  saveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>
}

export function useSaveFile(
  collectionDir: string,
  req: Request | null,
  selectedRequestId: string | undefined,
  markSaved: () => void,
): UseSaveFileResult {
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const doSave = useCallback(() => {
    if (!req || savingRef.current) return
    savingRef.current = true
    const requestId = req.id
    setSaveState({ kind: "idle" })
    filestore
      .saveRequest(collectionDir, req)
      .then(() => {
        if (!mountedRef.current) return
        if (selectedRequestId !== requestId) return
        markSaved()
        clearSaveTimer()
        setSaveState({
          kind: "success",
          message: `Successfully edited ${req.name}`,
        })
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, SAVE_SUCCESS_MS)
      })
      .catch((e: unknown) => {
        if (!mountedRef.current) return
        const msg = e instanceof Error ? e.message : String(e)
        clearSaveTimer()
        setSaveState({
          kind: "error",
          message: `Error: ${msg}`,
        })
        saveTimerRef.current = setTimeout(() => {
          setSaveState({ kind: "idle" })
        }, SAVE_ERROR_MS)
      })
      .finally(() => {
        savingRef.current = false
      })
  }, [collectionDir, clearSaveTimer, req, selectedRequestId, markSaved])

  return {
    saveState,
    setSaveState,
    doSave,
    clearSaveTimer,
    savingRef,
    saveTimerRef,
  }
}
