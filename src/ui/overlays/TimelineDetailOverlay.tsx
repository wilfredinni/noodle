import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { MouseButton, t, fg, type ScrollBoxRenderable } from "@opentui/core"
import type { TimelineBodyRef, TimelineEntry } from "../../schema"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Tabs, type TabDef } from "../Tabs"
import { Badge } from "../Badge"
import { formatSize, statusColor } from "../format"
import { methodColor } from "../formatRequest"
import { JsonBodyViewer } from "../editor/JsonBodyViewer"
import { HeaderTable } from "../HeaderTable"
import { NetworkTab } from "../NetworkTab"
import {
  entryMethod,
  entryStatus,
  entryTiming,
  formatRequestDisplayName,
  formatRequestUrl,
  buildDetailRequestHeaders,
  shortMethod,
  truncateUrl,
} from "../timeline/formatTimeline"

const AUTO_RENDER_LIMIT = 5 * 1024 * 1024

const BASE_TAB_DEFS: TabDef[] = [
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
]

type DetailTab = "request" | "response" | "network"
type BodyTab = Exclude<DetailTab, "network">

function formatJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function bodyInfo(
  entry: TimelineEntry,
  tab: BodyTab,
): {
  body?: string
  ref?: TimelineBodyRef
  size: number
  truncated: boolean
} {
  if (tab === "request") {
    return {
      body: entry.request.body,
      ref: entry.request.bodyRef,
      size: entry.request.bodyRef?.size ?? entry.request.body?.length ?? 0,
      truncated: entry.request.bodyTruncated === true,
    }
  }
  return {
    body: entry.response?.body,
    ref: entry.response?.bodyRef,
    size: entry.response?.bodyRef?.size ?? entry.response?.size ?? 0,
    truncated: entry.response?.bodyTruncated === true,
  }
}

export function formatHeaderEntries(
  headers: { key: string; value: string }[],
): string {
  return headers.map((h) => `${h.key}: ${h.value}`).join("\n")
}

export function TimelineDetailOverlay({
  visible,
  entry,
  onClose,
  envColors: _envColors,
  onLoadBody = async () => {
    throw new Error("No timeline body loader configured")
  },
  onCopyHeaders = () => {},
  onCopyBody = () => {},
  onExportBody = async () => {},
}: {
  visible: boolean
  entry: TimelineEntry | null
  onClose: () => void
  envColors?: Record<string, string | undefined>
  onLoadBody?: (ref: TimelineBodyRef) => Promise<string>
  onCopyHeaders?: (headersText: string) => void
  onCopyBody?: (body: string) => void
  onExportBody?: (
    entry: TimelineEntry,
    kind: BodyTab,
    body?: string,
  ) => Promise<void>
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [activeTab, setActiveTab] = useState<DetailTab>("request")
  const [loadedBody, setLoadedBody] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showLargeBody, setShowLargeBody] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<
    | "view"
    | "large-copy"
    | "large-export"
    | "headers"
    | "body"
    | "export"
    | null
  >(null)
  const [highlightPriority, setHighlightPriority] = useState<"start" | "end">(
    "start",
  )
  const bodyScrollRef = useRef<ScrollBoxRenderable | null>(null)

  const hasNetwork = (entry?.network?.length ?? 0) > 0
  const tabs = hasNetwork
    ? [...BASE_TAB_DEFS, { id: "network", label: "Network" }]
    : BASE_TAB_DEFS
  const info =
    entry && activeTab !== "network" ? bodyInfo(entry, activeTab) : null
  const isLarge = (info?.size ?? 0) > AUTO_RENDER_LIMIT

  const selectTab = useCallback((tab: DetailTab) => {
    setActiveTab(tab)
    setLoadedBody(null)
    setBodyError(null)
    setShowLargeBody(false)
  }, [])

  const copyHeaders = useCallback(() => {
    if (!entry || activeTab === "network") return
    const headers =
      activeTab === "request"
        ? buildDetailRequestHeaders(entry.request.auth, entry.request.headers)
        : entry.response
          ? Object.entries(entry.response.headers)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => ({ key, value }))
          : []
    onCopyHeaders(formatHeaderEntries(headers))
  }, [entry, activeTab, onCopyHeaders])

  const copyBody = useCallback(() => {
    if (activeTab === "network") return
    const body = loadedBody ?? info?.body
    if (body !== undefined) onCopyBody(body)
    else if (info?.ref) {
      onLoadBody(info.ref)
        .then(onCopyBody)
        .catch(() => setBodyError("Unable to load the saved response body"))
    }
  }, [activeTab, loadedBody, info, onCopyBody, onLoadBody])

  const exportBody = useCallback(() => {
    if (!entry || activeTab === "network") return
    const runExport = (body?: string) =>
      onExportBody(entry, activeTab, body).catch(() =>
        setBodyError("Failed to export timeline entry"),
      )
    const body = loadedBody ?? info?.body
    if (body !== undefined) runExport(body)
    else if (info?.ref) {
      onLoadBody(info.ref)
        .then(runExport)
        .catch(() => setBodyError("Unable to load the saved response body"))
    } else {
      runExport()
    }
  }, [entry, activeTab, loadedBody, info, onExportBody, onLoadBody])

  useEffect(() => {
    if (!visible) return
    setActiveTab("request")
    setLoadedBody(null)
    setBodyError(null)
    setLoading(false)
    setShowLargeBody(false)
    setHighlightPriority("start")
    bodyScrollRef.current?.scrollTo(0)
  }, [visible, entry])

  useEffect(() => {
    if (!visible || !entry || !info?.ref || (isLarge && !showLargeBody)) return
    let active = true
    setLoading(true)
    setBodyError(null)
    onLoadBody(info.ref)
      .then((body) => {
        if (active) setLoadedBody(body)
      })
      .catch(() => {
        if (active) setBodyError("Unable to load the saved response body")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [visible, entry, activeTab, info?.ref, isLarge, showLargeBody, onLoadBody])

  const renderedBody = useMemo(() => {
    const body = loadedBody ?? info?.body ?? ""
    if (body === "" || isLarge) return body
    return formatJson(body)
  }, [loadedBody, info?.body, isLarge])

  useEffect(() => {
    setHighlightPriority("start")
    bodyScrollRef.current?.scrollTo(0)
  }, [renderedBody])

  useEffect(() => {
    if (!visible || !entry) return
    return keymap.intercept(
      "key",
      (ctx) => {
        const key = ctx.event
        key.preventDefault()
        key.stopPropagation()
        if (key.name === "escape") onClose()
        else if (key.name === "left" || key.name === "right") {
          const ids: DetailTab[] = hasNetwork
            ? ["request", "response", "network"]
            : ["request", "response"]
          const index = ids.indexOf(activeTab)
          const direction = key.name === "left" ? -1 : 1
          selectTab(ids[(index + direction + ids.length) % ids.length]!)
        } else if (key.name === "v" && isLarge) setShowLargeBody(true)
        else if (key.name === "h") copyHeaders()
        else if (key.name === "b") copyBody()
        else if (key.name === "e") exportBody()
        else if (key.name === "up") bodyScrollRef.current?.scrollBy(-1)
        else if (key.name === "down") bodyScrollRef.current?.scrollBy(1)
        else if (key.name === "pageup")
          bodyScrollRef.current?.scrollBy(-1, "viewport")
        else if (key.name === "pagedown")
          bodyScrollRef.current?.scrollBy(1, "viewport")
        else if (key.name === "home") {
          setHighlightPriority("start")
          bodyScrollRef.current?.scrollTo(0)
        } else if (key.name === "end") {
          setHighlightPriority("end")
          const bodyScroll = bodyScrollRef.current
          if (bodyScroll)
            bodyScroll.scrollTo(
              Math.max(0, bodyScroll.scrollHeight - bodyScroll.height),
            )
        }
      },
      { priority: 100 },
    )
  }, [
    visible,
    entry,
    keymap,
    onClose,
    isLarge,
    loadedBody,
    info,
    activeTab,
    hasNetwork,
    selectTab,
    copyHeaders,
    copyBody,
    exportBody,
  ])

  if (!visible || !entry) return null

  const method = entryMethod(entry)
  const status = entryStatus(entry)
  const requestHeaders = buildDetailRequestHeaders(
    entry.request.auth,
    entry.request.headers,
  )
  const responseHeaders = entry.response
    ? Object.entries(entry.response.headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ key, value }))
    : []
  const headers = activeTab === "request" ? requestHeaders : responseHeaders
  const headerHeight = 5

  return (
    <Overlay visible width={70} gap={1} padding={1}>
      <box
        style={{
          paddingLeft: 4,
          paddingRight: 4,
          flexDirection: "column",
          flexGrow: 1,
          minHeight: 0,
        }}
      >
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(tab) => selectTab(tab as DetailTab)}
          rightChildren={<text fg={theme.textMuted}>esc</text>}
        >
          {activeTab === "network" ? (
            <NetworkTab
              key="network"
              events={entry.network}
              scrollRef={bodyScrollRef}
              height={Math.min(Math.max(entry.network?.length ?? 1, 1), 10)}
            />
          ) : (
            <box
              key="details"
              style={{
                flexDirection: "column",
                flexGrow: 1,
                minHeight: 0,
                paddingTop: 1,
              }}
            >
              {activeTab === "request" ? (
                <box style={{ flexDirection: "column", marginBottom: 1 }}>
                  <box style={{ flexDirection: "row", flexShrink: 0 }}>
                    <text
                      wrapMode="word"
                      content={t`${fg(methodColor(method, theme))(shortMethod(method) + " ")}${fg(theme.text)(formatRequestUrl(entry))}`}
                    />
                  </box>
                  <box style={{ flexDirection: "row", flexShrink: 0 }}>
                    <text fg={theme.textMuted} wrapMode="none">
                      {truncateUrl(formatRequestDisplayName(entry), 60)}
                    </text>
                  </box>
                </box>
              ) : (
                <box style={{ flexDirection: "column", marginBottom: 1 }}>
                  {entry?.response
                    ? (() => {
                        const rawText = entry.response.statusText ?? ""
                        const truncatedStatusText =
                          rawText.length > 13
                            ? `${rawText.slice(0, 13)}…`
                            : rawText
                        const statusStr = `${status}${truncatedStatusText !== "" ? ` ${truncatedStatusText}` : ""}`
                        return (
                          <box
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <Badge bg={theme.backgroundElement} fg={theme.text}>
                              {formatSize(entry.response.size)} in{" "}
                              {entryTiming(entry)}
                            </Badge>
                            <Badge
                              bg={statusColor(status!, theme)}
                              fg={theme.background}
                            >
                              {statusStr}
                            </Badge>
                          </box>
                        )
                      })()
                    : null}
                  {entry?.error ? (
                    <box
                      border={["left", "right", "top", "bottom"]}
                      borderColor={theme.error}
                      style={{ padding: 1, marginTop: entry?.response ? 1 : 0 }}
                    >
                      <text fg={theme.error}>{entry.error.message}</text>
                    </box>
                  ) : null}
                </box>
              )}
              <box style={{ height: 1 }}>
                <text fg={theme.text}>Headers</text>
              </box>
              <box
                border={["bottom"]}
                borderColor={theme.borderSubtle}
                style={{ height: 1 }}
              />
              <scrollbox
                scrollY
                height={Math.min(Math.max(headers.length, 1), headerHeight)}
                verticalScrollbarOptions={{
                  trackOptions: {
                    backgroundColor: theme.background,
                    foregroundColor: theme.borderActive,
                  },
                }}
                style={{ flexShrink: 0 }}
              >
                <HeaderTable entries={headers} theme={theme} />
              </scrollbox>
              <box style={{ height: 1, marginTop: 1 }}>
                <text fg={theme.text}>Body</text>
              </box>
              <box
                border={["bottom"]}
                borderColor={theme.borderSubtle}
                style={{ height: 1 }}
              />
              {info!.truncated ? (
                <text fg={theme.warning}>
                  Saved body was truncated by an older Noodle version.
                </text>
              ) : loading ? (
                <text fg={theme.textMuted}>Loading body…</text>
              ) : bodyError ? (
                <text fg={theme.error}>{bodyError}</text>
              ) : isLarge && !showLargeBody ? (
                <box style={{ flexDirection: "column" }}>
                  <text
                    fg={theme.warning}
                  >{`Body is ${formatSize(info!.size)}. It was not rendered automatically.`}</text>
                  <box style={{ flexDirection: "row", gap: 1 }}>
                    <box
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        setShowLargeBody(true)
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onMouseOver={() => setHoveredAction("view")}
                      onMouseOut={() => setHoveredAction(null)}
                      style={{
                        flexDirection: "row",
                        paddingLeft: 1,
                        paddingRight: 1,
                        backgroundColor:
                          hoveredAction === "view"
                            ? theme.backgroundElement
                            : undefined,
                      }}
                    >
                      <text fg={theme.text}>v</text>
                      <text fg={theme.textMuted}> view raw </text>
                    </box>
                    <box
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        copyBody()
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onMouseOver={() => setHoveredAction("large-copy")}
                      onMouseOut={() => setHoveredAction(null)}
                      style={{
                        flexDirection: "row",
                        paddingLeft: 1,
                        paddingRight: 1,
                        backgroundColor:
                          hoveredAction === "large-copy"
                            ? theme.backgroundElement
                            : undefined,
                      }}
                    >
                      <text fg={theme.text}>b</text>
                      <text fg={theme.textMuted}> copy </text>
                    </box>
                    <box
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        exportBody()
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onMouseOver={() => setHoveredAction("large-export")}
                      onMouseOut={() => setHoveredAction(null)}
                      style={{
                        flexDirection: "row",
                        paddingLeft: 1,
                        paddingRight: 1,
                        backgroundColor:
                          hoveredAction === "large-export"
                            ? theme.backgroundElement
                            : undefined,
                      }}
                    >
                      <text fg={theme.text}>e</text>
                      <text fg={theme.textMuted}> export</text>
                    </box>
                  </box>
                </box>
              ) : renderedBody ? (
                (() => {
                  const bodyLines = renderedBody.split("\n").length
                  const computedBodyHeight = Math.min(
                    Math.max(bodyLines, 1),
                    10,
                  )
                  return (
                    <scrollbox
                      ref={bodyScrollRef}
                      scrollY
                      height={computedBodyHeight}
                      onMouseScroll={(event) => {
                        const direction = event.scroll?.direction
                        if (!direction) return
                        const amount = event.scroll?.delta || 1
                        bodyScrollRef.current?.scrollBy(
                          (direction === "up" ? -1 : 1) * amount,
                        )
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      verticalScrollbarOptions={{
                        trackOptions: {
                          backgroundColor: theme.background,
                          foregroundColor: theme.borderActive,
                        },
                      }}
                      style={{ flexShrink: 0 }}
                    >
                      <JsonBodyViewer
                        body={renderedBody}
                        theme={theme}
                        highlightPriority={highlightPriority}
                      />
                    </scrollbox>
                  )
                })()
              ) : (
                <text fg={theme.textMuted}>
                  {entry.response ? "(empty body)" : "No response"}
                </text>
              )}
            </box>
          )}
        </Tabs>
        {activeTab !== "network" && (
          <box
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 1,
              gap: 1,
            }}
          >
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                copyHeaders()
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseOver={() => setHoveredAction("headers")}
              onMouseOut={() => setHoveredAction(null)}
              style={{
                flexDirection: "row",
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor:
                  hoveredAction === "headers"
                    ? theme.backgroundElement
                    : undefined,
              }}
            >
              <text fg={theme.text}>h</text>
              <text fg={theme.textMuted}> copy headers </text>
            </box>
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                copyBody()
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseOver={() => setHoveredAction("body")}
              onMouseOut={() => setHoveredAction(null)}
              style={{
                flexDirection: "row",
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor:
                  hoveredAction === "body"
                    ? theme.backgroundElement
                    : undefined,
              }}
            >
              <text fg={theme.text}>b</text>
              <text fg={theme.textMuted}> copy body </text>
            </box>
            <box
              onMouseDown={(event) => {
                if (event.button !== MouseButton.LEFT) return
                exportBody()
                event.preventDefault()
                event.stopPropagation()
              }}
              onMouseOver={() => setHoveredAction("export")}
              onMouseOut={() => setHoveredAction(null)}
              style={{
                flexDirection: "row",
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor:
                  hoveredAction === "export"
                    ? theme.backgroundElement
                    : undefined,
              }}
            >
              <text fg={theme.text}>e</text>
              <text fg={theme.textMuted}> export</text>
            </box>
          </box>
        )}
      </box>
    </Overlay>
  )
}
