import { useCallback, useEffect, useRef, useState } from "react"
import type { FieldKind } from "../editMode"
import {
  loadUIState,
  saveUIState,
  type TabPrefs,
  type ResponseTabKind,
} from "./uiState"

type Pane = "request" | "response"

export interface UseUIStateResult {
  getTab: (requestId: string) => TabPrefs | undefined
  setTab: (
    requestId: string,
    pane: Pane,
    value: FieldKind | ResponseTabKind,
  ) => void
}

const DEFAULTS: TabPrefs = { requestTab: "headers", responseTab: "body" }

export function useUIState(collectionDir: string): UseUIStateResult {
  const [state, setState] = useState<Map<string, TabPrefs>>(new Map())
  const mapRef = useRef(state)
  mapRef.current = state

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadUIState(collectionDir).then((m) => {
      setState(m)
    })
  }, [collectionDir])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [collectionDir])

  const getTab = useCallback(
    (requestId: string): TabPrefs | undefined => {
      return state.get(requestId)
    },
    [state],
  )

  const setTab = useCallback(
    (requestId: string, pane: Pane, value: FieldKind | ResponseTabKind) => {
      const next = new Map(mapRef.current)
      const prefs = next.get(requestId) ?? { ...DEFAULTS }
      if (pane === "request") {
        prefs.requestTab = value as FieldKind
      } else {
        prefs.responseTab = value as ResponseTabKind
      }
      next.set(requestId, prefs)

      setState(next)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => saveUIState(collectionDir, next).catch(() => {}),
        300,
      )
    },
    [collectionDir],
  )

  return { getTab, setTab }
}
