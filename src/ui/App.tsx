import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { useCollection } from "./useCollection"
import { useSidebarSelection } from "./useSidebarSelection"
import { useResponse } from "./useResponse"

export function App({ collectionDir }: { collectionDir: string }) {
  useKeyboard((key) => {
    if (key.name === "tab") {
      // focus cycle placeholder
    }
  })

  const { collection, loading, error } = useCollection(collectionDir)
  const requests = collection?.requests ?? []
  const { selectedIndex, selectedRequest } = useSidebarSelection(requests)
  const { state: responseState } = useResponse(selectedRequest)

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
          <RequestPane request={selectedRequest} />
          <ResponsePane state={responseState} />
        </box>
      </box>
      <text fg="#666">
        [↑/↓] select · [s] send · [Tab] focus · [Ctrl+C] quit
      </text>
    </box>
  )
}
