import { useEffect, useRef, useState } from "react"
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

function defaults(): TabPrefs {
  return { requestTab: "headers", responseTab: "body" }
}

export function useUIState(collectionDir: string): UseUIStateResult {
  const [state, setState] = useState<Map<string, TabPrefs>>(new Map())
  const stateRef = useRef(state)
  stateRef.current = state

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadUIState(collectionDir).then((m) => {
      setState(m)
      stateRef.current = m
    })
  }, [collectionDir])

  const getTab = (requestId: string): TabPrefs | undefined => {
    return state.get(requestId)
  }

  const setTab = (
    requestId: string,
    pane: Pane,
    value: FieldKind | ResponseTabKind,
  ) => {
    setState((prev) => {
      const next = new Map(prev)
      const prefs = next.get(requestId) ?? defaults()
      if (pane === "request") {
        prefs.requestTab = value as FieldKind
      } else {
        prefs.responseTab = value as ResponseTabKind
      }
      next.set(requestId, prefs)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(
        () => saveUIState(collectionDir, next).catch(() => {}),
        300,
      )

      return next
    })
  }

  return { getTab, setTab }
}
