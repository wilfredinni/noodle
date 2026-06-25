import { useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { ScrollBoxRenderable } from "@opentui/core"
import type { SendState } from "./sendState"
import {
  statusColor,
  formatStatusLine,
  formatHeaders,
  formatBody,
} from "./format"
import { Tabs, type TabDef } from "./Tabs"

const TAB_DEFS: TabDef[] = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
]

export function ResponsePane({
  state,
  focused = false,
}: {
  state: SendState
  focused?: boolean
}) {
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const [activeTab, setActiveTab] = useState<"body" | "headers">("body")
  const isDone = state.status === "done"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (!isDone) return
    if (key.name === "left")
      setActiveTab((prev) => (prev === "body" ? "headers" : "body"))
    else if (key.name === "right")
      setActiveTab((prev) => (prev === "headers" ? "body" : "headers"))
    else if (key.name === "down")
      scrollRef.current?.scrollBy(1)
    else if (key.name === "up")
      scrollRef.current?.scrollBy(-1)
    else if (key.name === "pagedown")
      scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup")
      scrollRef.current?.scrollBy(-1, "viewport")
  })

  return (
    <box
      style={{
        border: true,
        borderColor: focused ? "#61dafb" : undefined,
        flexGrow: 1,
        flexDirection: "column",
        padding: 1,
        gap: 1,
        flexBasis: 0,
        minHeight: 0,
      }}
      title={focused ? "▸ Response" : "Response"}
    >
      {state.status === "idle" ? (
        <text fg="#888">(no response yet)</text>
      ) : state.status === "sending" ? (
        <text fg="#888">
          Sending {state.request.method} {state.request.url}…
        </text>
      ) : state.status === "error" ? (
        <text fg="#c00">{state.error.message}</text>
      ) : (
        <>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            <scrollbox ref={scrollRef} scrollY stickyScroll style={{ flexGrow: 1 }}>
              {activeTab === "body" ? (
                <>
                  <text fg={statusColor(state.response.status)}>
                    {formatStatusLine(state.response)}
                  </text>
                  {(() => {
                    const body = formatBody(state.response)
                    return body !== "" ? <text>{body}</text> : null
                  })()}
                </>
              ) : (
                <>
                  {formatHeaders(state.response).map((line) => (
                    <text key={line} fg="#888">
                      {line}
                    </text>
                  ))}
                </>
              )}
            </scrollbox>
          </Tabs>
        </>
      )}
    </box>
  )
}
