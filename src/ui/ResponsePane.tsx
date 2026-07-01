import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SendState } from "./sendState"
import type { TimelineEntry } from "../schema"
import { formatHeaders, formatBody, formatSize, statusColor } from "./format"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { JsonBodyViewer } from "./JsonBodyViewer"
import { Tips } from "./Tips"
import { Frame } from "./Frame"

import { TimelineTab } from "./timeline/TimelineTab"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const TAB_DEFS: TabDef[] = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "timeline", label: "Timeline" },
]

export function ResponsePane({
  state,
  focused = false,
  timelineEntries,
  initialTab,
  onTabChange,
  expandHint,
}: {
  state: SendState
  focused?: boolean
  timelineEntries?: TimelineEntry[]
  initialTab?: "body" | "headers" | "timeline"
  onTabChange?: (tab: "body" | "headers" | "timeline") => void
  expandHint?: string
}) {
  const theme = useTheme()
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const [activeTab, setActiveTab] = useState<"body" | "headers" | "timeline">(
    initialTab ?? "body",
  )
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const isDone = state.status === "done"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (!isDone) return
    if (key.name === "left")
      setActiveTab((prev) => {
        const ids = ["body", "headers", "timeline"] as const
        const idx = ids.indexOf(prev)
        return ids[(idx - 1 + ids.length) % ids.length]
      })
    else if (key.name === "right")
      setActiveTab((prev) => {
        const ids = ["body", "headers", "timeline"] as const
        const idx = ids.indexOf(prev)
        return ids[(idx + 1) % ids.length]
      })
    else if (activeTab === "timeline") return
    else if (key.name === "down") scrollRef.current?.scrollBy(1)
    else if (key.name === "up") scrollRef.current?.scrollBy(-1)
    else if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
  })

  // Sync activeTab when initialTab prop changes (request switch)
  const syncVersionRef = useRef(0)
  useEffect(() => {
    syncVersionRef.current += 1
    setActiveTab(initialTab ?? "body")
  }, [initialTab])

  // Notify parent on tab changes from user interaction (skip first render + sync)
  const isFirstTabRender = useRef(true)
  const lastAppliedSyncVersionRef = useRef(0)
  useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false
      return
    }
    if (syncVersionRef.current !== lastAppliedSyncVersionRef.current) {
      lastAppliedSyncVersionRef.current = syncVersionRef.current
      return
    }
    onTabChange?.(activeTab)
  }, [activeTab, onTabChange])

  // Spinner animation tick
  useEffect(() => {
    if (state.status !== "sending") return
    const id = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(id)
  }, [state.status])

  const borderColor = focused ? theme.primary : theme.borderSubtle

  const responseHeaders = isDone ? formatHeaders(state.response) : []
  const maxKeyLen =
    responseHeaders.length > 0
      ? Math.max(...responseHeaders.map((h) => h.key.length))
      : 0

  const headerLeft = (
    <text fg={focused ? theme.primary : theme.textMuted}>Response</text>
  )

  const headerRight = isDone ? (
    <text fg={statusColor(state.response.status, theme)}>
      {state.response.status}{state.response.statusText !== "" ? ` ${state.response.statusText}` : ""}
    </text>
  ) : undefined

  const footerRight = isDone ? (
    <text fg={focused ? theme.primary : theme.textMuted}>
      {`${formatSize(new TextEncoder().encode(state.response.body).length)} in ${Math.round(state.response.timeMs)}ms`}
    </text>
  ) : undefined

  const footerLeft = focused ? (
    <text fg={theme.primary}>{expandHint}</text>
  ) : undefined

  return (
    <Frame
      style={{
        flexGrow: 1,
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
        flexBasis: 0,
        minHeight: 0,
        backgroundColor: theme.backgroundPanel,
      }}
      border={[...FullBorder.border]}
      customBorderChars={FullBorder.customBorderChars}
      borderColor={borderColor}
      titleLeft={headerLeft}
      titleRight={headerRight}
      bottomLeft={footerLeft}
      bottomRight={footerRight}
    >
      {state.status === "idle" ? (
        <Tips />
      ) : state.status === "sending" ? (
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.info}>{SPINNER_FRAMES[spinnerIdx]}</text>
    <text fg={focused ? theme.primary : theme.textMuted}>
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
        <box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
          <Tabs tabs={TAB_DEFS} activeId={activeTab}>
            {activeTab === "timeline" ? (
              <TimelineTab entries={timelineEntries ?? []} focused={focused} />
            ) : (
              <scrollbox
                ref={scrollRef}
                scrollY
                scrollbarOptions={{ visible: false }}
                style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
              >
                {activeTab === "body" ? (
                  <box style={{ flexDirection: "column", gap: 1 }}>
                    {(() => {
                      const body = formatBody(state.response)
                      if (body === "")
                        return <text fg={theme.textMuted}>(no body)</text>
                      return (
                        <JsonBodyViewer
                          key={body}
                          body={body}
                          theme={theme}
                          readOnly
                        />
                      )
                    })()}
                  </box>
                ) : (
                  responseHeaders.map(({ key, value }, i) => {
                    if (i < responseHeaders.length - 1) {
                      return (
                        <box
                          key={key}
                          border={["bottom"]}
                          borderColor={theme.borderDimmest}
                          style={{ flexDirection: "row" }}
                        >
                          <text
                            fg={theme.textMuted}
                            style={{ minWidth: maxKeyLen + 1, paddingLeft: 1 }}
                          >
                            {key.padEnd(maxKeyLen)}
                          </text>
                          <text
                            fg={theme.textMuted}
                            wrapMode="none"
                            style={{ flexShrink: 1, minWidth: 5 }}
                          >
                            : {value}
                          </text>
                        </box>
                      )
                    }
                    return (
                      <text
                        key={key}
                        fg={theme.textMuted}
                        wrapMode="none"
                        style={{ paddingLeft: 1 }}
                      >
                        {key.padEnd(maxKeyLen)} : {value}
                      </text>
                    )
                  })
                )}
              </scrollbox>
            )}
          </Tabs>
        </box>
      )}
    </Frame>
  )
}
