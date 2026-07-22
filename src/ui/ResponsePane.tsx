import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { RefObject } from "react"
import type { SendState } from "./sendState"
import type { TimelineEntry } from "../schema"
import { formatHeaders, formatBody, formatSize, statusColor } from "./format"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { FullBorder, LeftBar } from "./borders"
import { JsonBodyViewer } from "./editor/JsonBodyViewer"
import { Tips } from "./Tips"
import { Frame } from "./Frame"
import {
  parseResponseBody,
  queryParsedResponseBody,
  type ResponseQueryController,
} from "./responseQuery"

import { HeaderTable } from "./HeaderTable"
import { TimelineTab } from "./timeline/TimelineTab"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const AUTO_RENDER_LIMIT = 5 * 1024 * 1024

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
  onOpenTimelineEntry,
  expandHint,
  queryHint,
  responseKey,
  responseQueryRef,
  responseBodyForCopyRef,
  layout,
  expanded,
}: {
  state: SendState
  focused?: boolean
  timelineEntries?: TimelineEntry[]
  initialTab?: "body" | "headers" | "timeline"
  onTabChange?: (tab: "body" | "headers" | "timeline") => void
  onOpenTimelineEntry?: (entry: TimelineEntry) => void
  expandHint?: string
  queryHint?: string
  responseKey?: string | null
  responseQueryRef?: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef?: RefObject<string | null>
  layout?: "stacked" | "side-by-side"
  expanded?: "request" | "response" | null
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const [activeTab, setActiveTab] = useState<"body" | "headers" | "timeline">(
    initialTab ?? "body",
  )
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const [queryVisible, setQueryVisible] = useState(false)
  const [query, setQuery] = useState("")
  const [settledQuery, setSettledQuery] = useState("")
  const [showLargeBody, setShowLargeBody] = useState(false)
  const [highlightPriority, setHighlightPriority] = useState<"start" | "end">(
    "start",
  )
  const isDone = state.status === "done"
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const queryInputRef = useRef<InputRenderable | null>(null)

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (!isDone) return
    if (keymap.getData("app.overlay") !== "none") return
    if (queryVisible) return
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
    else if (key.name === "v" && activeTab === "body") setShowLargeBody(true)
    else if (activeTab === "timeline") return
    else if (key.name === "down") scrollRef.current?.scrollBy(1)
    else if (key.name === "up") scrollRef.current?.scrollBy(-1)
    else if (key.name === "pagedown") scrollRef.current?.scrollBy(1, "viewport")
    else if (key.name === "pageup") scrollRef.current?.scrollBy(-1, "viewport")
    else if (key.name === "home") {
      key.preventDefault()
      setHighlightPriority("start")
      scrollRef.current?.scrollTo(0)
    } else if (key.name === "end") {
      key.preventDefault()
      setHighlightPriority("end")
      scrollRef.current?.scrollTo(
        Math.max(0, scrollRef.current.scrollHeight - scrollRef.current.height),
      )
    }
  })

  useEffect(() => {
    if (!queryVisible) return
    const dispose = keymap.intercept(
      "key",
      (ctx) => {
        if (ctx.event.name !== "escape") return
        ctx.event.preventDefault()
        ctx.event.stopPropagation()
        setQueryVisible(false)
        setQuery("")
        setSettledQuery("")
        if (responseBodyForCopyRef) {
          responseBodyForCopyRef.current = isDone ? state.response.body : null
        }
      },
      { priority: 100 },
    )
    return dispose
  }, [
    keymap,
    queryVisible,
    responseBodyForCopyRef,
    isDone,
    isDone ? state.response.body : null,
  ])

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

  useEffect(() => {
    setQueryVisible(false)
    setQuery("")
    setSettledQuery("")
    setShowLargeBody(false)
  }, [responseKey, state.status, isDone ? state.response.body : null])

  useEffect(() => {
    if (!queryVisible) return
    queryInputRef.current?.focus()
  }, [queryVisible])

  useEffect(() => {
    if (!queryVisible) return
    const timer = setTimeout(() => setSettledQuery(query.trim()), 150)
    return () => clearTimeout(timer)
  }, [query, queryVisible])

  const borderColor = focused ? theme.primary : theme.borderSubtle

  const responseHeaders = isDone ? formatHeaders(state.response) : []

  const bodySize = useMemo(() => {
    if (state.status !== "done") return 0
    return new TextEncoder().encode(state.response.body).length
  }, [state.status, state.status === "done" ? state.response.body : null])

  const formattedBody = useMemo(() => {
    if (state.status !== "done") return ""
    if (bodySize > AUTO_RENDER_LIMIT) {
      return showLargeBody ? state.response.body : ""
    }
    return formatBody(state.response)
  }, [
    state.status,
    state.status === "done" ? state.response.body : null,
    bodySize,
    showLargeBody,
  ])

  const parsedResponseBody = useMemo(() => {
    if (!isDone || !queryVisible) return null
    return parseResponseBody(state.response.body)
  }, [isDone, queryVisible, isDone ? state.response.body : null])

  const queryResult = useMemo(() => {
    if (settledQuery === "" || parsedResponseBody?.kind !== "success")
      return null
    return queryParsedResponseBody(parsedResponseBody.value, settledQuery)
  }, [parsedResponseBody, settledQuery])

  const displayedBody =
    queryResult?.kind === "success" ? queryResult.body : formattedBody

  useEffect(() => {
    setHighlightPriority("start")
  }, [displayedBody])

  useEffect(() => {
    if (!responseBodyForCopyRef) return
    responseBodyForCopyRef.current =
      queryResult?.kind === "success"
        ? queryResult.body
        : isDone
          ? state.response.body
          : null
  }, [
    responseBodyForCopyRef,
    queryResult,
    isDone,
    isDone ? state.response.body : null,
  ])

  useEffect(() => {
    if (!responseQueryRef) return
    responseQueryRef.current = {
      canOpen: () => isDone && activeTab === "body" && !queryVisible,
      open: () => {
        if (!isDone || activeTab !== "body") return false
        setQueryVisible(true)
        return true
      },
    }
    return () => {
      responseQueryRef.current = null
    }
  }, [responseQueryRef, isDone, activeTab, queryVisible])

  const headerLeft = (
    <text fg={focused ? theme.primary : theme.textMuted}>Response</text>
  )

  const headerRight = isDone ? (
    <text fg={statusColor(state.response.status, theme)}>
      {`${state.response.status}${state.response.statusText !== "" ? ` ${state.response.statusText}` : ""}`}
    </text>
  ) : undefined

  const footerLeft = focused ? (
    <text fg={theme.primary}>
      {expandHint}
      {queryHint ? ` · ${queryHint}` : ""}
    </text>
  ) : undefined

  const footerRight = isDone ? (
    <text fg={focused ? theme.primary : theme.textMuted}>
      {`${formatSize(bodySize)} in ${Math.round(state.response.timeMs)}ms`}
    </text>
  ) : undefined

  return (
    <Frame
      style={{
        flexGrow: 1,
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
        paddingBottom: 1,
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
        <box
          style={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.info}>{SPINNER_FRAMES[spinnerIdx]}</text>
            <text fg={focused ? theme.primary : theme.textMuted}>Sending</text>
          </box>
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
              <TimelineTab
                entries={timelineEntries ?? []}
                focused={focused}
                onOpenEntry={onOpenTimelineEntry}
                layout={layout}
                expanded={expanded}
              />
            ) : activeTab === "body" ? (
              <box
                style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}
              >
                {queryVisible && (
                  <box
                    style={{ flexDirection: "column", gap: 0, flexShrink: 0 }}
                  >
                    <box style={{ flexDirection: "row", gap: 1 }}>
                      <input
                        ref={queryInputRef}
                        value={query}
                        placeholder="$.data.items[*].id"
                        onInput={setQuery}
                        backgroundColor={theme.background}
                        focusedBackgroundColor={theme.background}
                        textColor={theme.text}
                        cursorColor={theme.primary}
                        style={{ flexGrow: 1 }}
                      />
                    </box>
                    {queryResult?.kind === "success" ? (
                      <text fg={theme.success}>
                        {`${queryResult.matchCount} match${queryResult.matchCount === 1 ? "" : "es"}`}
                      </text>
                    ) : parsedResponseBody?.kind === "invalid-json" ? (
                      <text fg={theme.warning}>
                        {parsedResponseBody.message}
                      </text>
                    ) : queryResult?.kind === "invalid-expression" ? (
                      <text fg={theme.warning}>Invalid query syntax</text>
                    ) : query.trim() === "" ? (
                      <text fg={theme.textMuted}>
                        Enter a JSONPath expression to filter this response
                      </text>
                    ) : null}
                  </box>
                )}
                <scrollbox
                  ref={scrollRef}
                  scrollY
                  scrollbarOptions={{ visible: false }}
                  style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
                >
                  {isDone && bodySize > AUTO_RENDER_LIMIT && !showLargeBody ? (
                    <box style={{ flexDirection: "column" }}>
                      <text
                        fg={theme.warning}
                      >{`Body is ${formatSize(bodySize)}. It was not rendered automatically.`}</text>
                      <text fg={theme.textMuted}>v view raw · ctrl+b copy</text>
                    </box>
                  ) : displayedBody === "" ? (
                    <text fg={theme.textMuted}>(no body)</text>
                  ) : (
                    <JsonBodyViewer
                      key={displayedBody}
                      body={displayedBody}
                      theme={theme}
                      readOnly
                      focused={focused}
                      scrollRef={scrollRef}
                      highlightPriority={highlightPriority}
                    />
                  )}
                </scrollbox>
              </box>
            ) : (
              <scrollbox
                ref={scrollRef}
                scrollY
                scrollbarOptions={{ visible: false }}
                style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
              >
                <HeaderTable entries={responseHeaders} theme={theme} />
              </scrollbox>
            )}
          </Tabs>
        </box>
      )}
    </Frame>
  )
}
