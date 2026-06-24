import { useKeyboard } from "@opentui/react"
import { Sidebar } from "./Sidebar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"

export function App() {
  useKeyboard((key) => {
    if (key.name === "tab") {
      // focus cycle placeholder
    }
  })

  return (
    <box
      style={{ flexDirection: "column", width: "100%", height: "100%", border: true }}
    >
      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <Sidebar />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          <RequestPane />
          <ResponsePane />
        </box>
      </box>
      <text fg="#666">[Tab] focus · [Ctrl+C] quit</text>
    </box>
  )
}
