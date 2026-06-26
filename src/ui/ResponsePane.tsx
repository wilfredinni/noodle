import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SendState } from "./sendState"
import { formatStatusLine, formatHeaders, formatBody } from "./format"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { JsonBodyViewer } from "./JsonBodyViewer"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

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
  const theme = useTheme()
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const [activeTab, setActiveTab] = useState<"body" | "headers">("body")
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const isDone = state.status === "done"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (!isDone) return
    if (key.name === "left")
      setActiveTab((prev) => (prev === "body" ? "headers" : "body"))
    else if (key.name === "right")
      setActiveTab((prev) => (prev === "headers" ? "body" : "headers"))
    else if (key.name === "down") scrollRef.current?.scrollBy(1)
    else if (key.name === "up") scrollRef.current?.scrollBy(-1)
    else if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
  })

  // Spinner animation tick
  useEffect(() => {
    if (state.status !== "sending") return
    const id = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(id)
  }, [state.status])

  const borderColor = focused ? theme.primary : theme.borderSubtle

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: "column",
        paddingTop: 0,
        paddingBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        flexBasis: 0,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={borderColor}
      title="Response"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
      bottomTitle={
        state.status === "done"
          ? ` ${formatStatusLine(state.response)} `
          : undefined
      }
      bottomTitleAlignment="right"
    >
      {state.status === "idle" ? (
        <text fg={theme.textMuted}>Send a request to see the response</text>
      ) : state.status === "sending" ? (
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.info}>{SPINNER_FRAMES[spinnerIdx]}</text>
          <text fg={theme.textMuted}>
            Sending {state.request.method} {state.request.url}...
          </text>
        </box>
      ) : state.status === "error" ? (
        <box
          border={[...LeftBar.border]}
          customBorderChars={LeftBar.customBorderChars}
          borderColor={theme.error}
        >
          <text fg={theme.error}> {state.error.message}</text>
        </box>
      ) : (
        <>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            <scrollbox
              ref={scrollRef}
              scrollY
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
              {activeTab === "body" ? (
                (() => {
                  const body = formatBody(state.response)
                  if (body === "") return null
                  return (
                    <JsonBodyViewer body={body} theme={theme} />
                  )
                })()
              ) : (
                <>
                  {formatHeaders(state.response).map((line) => (
                    <box
                      key={line}
                      border={[...LeftBar.border]}
                      customBorderChars={LeftBar.customBorderChars}
                      borderColor={theme.borderSubtle}
                    >
                      <text fg={theme.textMuted}>{" " + line}</text>
                    </box>
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
