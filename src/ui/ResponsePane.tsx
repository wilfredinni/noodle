import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { SendState } from "./sendState"
import type { TimelineEntry } from "../schema"
import { formatHeaders, formatBody, statusColor } from "./format"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { JsonBodyViewer } from "./JsonBodyViewer"
import { GradientBadge } from "./GradientBadge"
import { Tips } from "./Tips"
import { TimelineTab } from "./timeline/TimelineTab"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

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
}: {
  state: SendState
  focused?: boolean
  timelineEntries?: TimelineEntry[]
  initialTab?: "body" | "headers" | "timeline"
  onTabChange?: (tab: "body" | "headers" | "timeline") => void
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

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Notify parent on tab changes from user interaction (skip first render)
  const isFirstTabRender = useRef(true)
  useEffect(() => {
    if (isFirstTabRender.current) {
      isFirstTabRender.current = false
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

  return (
    <box
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
      title="Response"
      titleColor={focused ? theme.primary : theme.textMuted}
      titleAlignment="left"
    >
      {state.status === "idle" ? (
        <Tips />
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
          {state.response.statusText !== "" && (
            <box
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                flexShrink: 0,
                paddingTop: 1,
                paddingRight: 1,
              }}
            >
              <GradientBadge
                colors={[
                  statusColor(state.response.status, theme),
                  theme.primary,
                ]}
                fg={theme.background}
              >
                {`${state.response.status}${state.response.statusText !== "" ? ` ${state.response.statusText}` : ""} • ${Math.round(state.response.timeMs)}ms • ${formatSize(new TextEncoder().encode(state.response.body).length)}`}
              </GradientBadge>
            </box>
          )}
        </box>
      )}
    </box>
  )
}
