import { useCallback, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { useCollection } from "./useCollection"
import { useSidebarSelection } from "./useSidebarSelection"
import { useResponse } from "./useResponse"
import { useRequestDraft } from "./useRequestDraft"
import { useEditBrowse } from "./useEditBrowse"
import { useEnvironments } from "./useEnvironments"
import { filestore } from "../filestore"

type SaveState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

const SAVE_SUCCESS_MS = 2000
const SAVE_ERROR_MS = 3000

function hintFor(mode: "inactive" | "browsing" | "editing"): string {
  if (mode === "browsing") {
    return "[↑/↓] move · [e/Enter] edit field · [d] revert field · [R] revert all · [Esc] back · [s] send"
  }
  if (mode === "editing") {
    return "[Enter] commit · [Esc] cancel"
  }
  return "[↑/↓] select · [e] edit · [s] send · [w] save · [/] env · [Ctrl+C] quit"
}

export function App({
  collectionDir,
  environmentsDir,
  envList,
  initialEnvName,
}: {
  collectionDir: string
  environmentsDir: string
  envList: string[]
  initialEnvName?: string
}) {
  const { collection, loading, error } = useCollection(collectionDir)
  const requests = collection?.requests ?? []

  const sidebarEnabledRef = useRef(true)
  const { selectedIndex, selectedRequest } = useSidebarSelection(
    requests,
    () => sidebarEnabledRef.current,
  )

  const draft = useRequestDraft(selectedRequest)
  const { editState, editValue, setEditValue, isActive } = useEditBrowse(
    draft.draft,
    draft,
  )
  sidebarEnabledRef.current = !isActive

  const envState = useEnvironments(environmentsDir, envList, initialEnvName)
  const { state: responseState } = useResponse(draft.draft, envState.activeEnv)

  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  useKeyboard((key) => {
    if (key.name === "tab" && !isActive) {
      // focus cycle placeholder (roadmap #5)
    }
    if (!isActive) {
      // env cycle
      if (envState.names.length > 0) {
        if (key.name === "[") envState.cycle(-1)
        else if (key.name === "]") envState.cycle(+1)
      }
      // save confirm prompt
      if (saveState.kind === "confirming") {
        if (key.name === "y") {
          if (!draft.draft || savingRef.current) return
          savingRef.current = true
          setSaveState({ kind: "idle" })
          filestore
            .saveRequest(collectionDir, draft.draft)
            .then(() => {
              draft.markSaved()
              clearSaveTimer()
              setSaveState({
                kind: "success",
                message: `Saved ${draft.draft!.id}.yml`,
              })
              saveTimerRef.current = setTimeout(() => {
                setSaveState({ kind: "idle" })
              }, SAVE_SUCCESS_MS)
            })
            .catch((e: unknown) => {
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
        } else {
          setSaveState({ kind: "idle" })
        }
        return
      }
      // w keybind: trigger save confirmation
      if (key.name === "w" && !savingRef.current) {
        if (draft.draft && draft.isDirty) {
          clearSaveTimer()
          setSaveState({ kind: "confirming" })
        }
      }
    }
  })

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        border: true,
      }}
    >
      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <Sidebar
          collection={collection}
          loading={loading}
          error={error}
          selectedIndex={selectedIndex}
        />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          <RequestPane
            request={draft.draft}
            editState={editState}
            editValue={editValue}
            setEditValue={setEditValue}
            draft={draft}
          />
          <ResponsePane state={responseState} />
        </box>
      </box>
      <text fg="#666">
        {saveState.kind === "confirming"
          ? `Save changes to ${draft.draft?.id ?? "?"}.yml? [y/N]`
          : saveState.kind === "success"
            ? saveState.message
            : saveState.kind === "error"
              ? saveState.message
              : `${hintFor(editState.mode)} · env: ${envState.indicatorLabel}`}
      </text>
    </box>
  )
}
