import { useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { Environment } from "../schema"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { useCollection } from "./useCollection"
import { useSidebarSelection } from "./useSidebarSelection"
import { useResponse } from "./useResponse"
import { useRequestDraft } from "./useRequestDraft"
import { useEditBrowse } from "./useEditBrowse"

function hintFor(mode: "inactive" | "browsing" | "editing"): string {
  if (mode === "browsing") {
    return "[↑/↓] move · [e/Enter] edit field · [d] revert field · [R] revert all · [Esc] back · [s] send"
  }
  if (mode === "editing") {
    return "[Enter] commit · [Esc] cancel"
  }
  return "[↑/↓] select · [e] edit · [s] send · [Ctrl+C] quit"
}

export function App({
  collectionDir,
  env,
}: {
  collectionDir: string
  env?: Environment
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

  const { state: responseState } = useResponse(draft.draft, env)

  useKeyboard((key) => {
    if (key.name === "tab" && !isActive) {
      // focus cycle placeholder (roadmap #5)
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
      <text fg="#666">{hintFor(editState.mode)}</text>
    </box>
  )
}
