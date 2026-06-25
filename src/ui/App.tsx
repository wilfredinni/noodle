import { useRef } from "react"
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

function hintFor(mode: "inactive" | "browsing" | "editing"): string {
  if (mode === "browsing") {
    return "[↑/↓] move · [e/Enter] edit field · [d] revert field · [R] revert all · [Esc] back · [s] send"
  }
  if (mode === "editing") {
    return "[Enter] commit · [Esc] cancel"
  }
  return "[↑/↓] select · [e] edit · [s] send · [/] env · [Ctrl+C] quit"
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

  useKeyboard((key) => {
    if (key.name === "tab" && !isActive) {
      // focus cycle placeholder (roadmap #5)
    }
    if (!isActive && envState.names.length > 0) {
      if (key.name === "[") envState.cycle(-1)
      else if (key.name === "]") envState.cycle(+1)
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
        {hintFor(editState.mode)} · env: {envState.indicatorLabel}
      </text>
    </box>
  )
}
