import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { useCollection } from "./useCollection"

export function App({ collectionDir }: { collectionDir: string }) {
  useKeyboard((key) => {
    if (key.name === "tab") {
      // focus cycle placeholder
    }
  })

  const { collection, loading, error } = useCollection(collectionDir)

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
        <Sidebar collection={collection} loading={loading} error={error} />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          <RequestPane />
          <ResponsePane />
        </box>
      </box>
      <text fg="#666">[Tab] focus · [Ctrl+C] quit</text>
    </box>
  )
}
