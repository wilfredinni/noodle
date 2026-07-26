import { useEffect, useMemo, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { t, fg, type ScrollBoxRenderable } from "@opentui/core"
import type { TimelineBodyRef, TimelineEntry } from "../../schema"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { Tabs, type TabDef } from "../Tabs"
import { Badge } from "../Badge"
import { formatSize, statusColor } from "../format"
import { methodColor } from "../formatRequest"
import { JsonBodyViewer } from "../editor/JsonBodyViewer"
import { HeaderTable } from "../HeaderTable"
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

const TAB_DEFS: TabDef[] = [
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
]

type DetailTab = "request" | "response"

function formatJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function bodyInfo(
  entry: TimelineEntry,
  tab: DetailTab,
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
    kind: DetailTab,
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
  const [highlightPriority, setHighlightPriority] = useState<"start" | "end">(
    "start",
  )
  const bodyScrollRef = useRef<ScrollBoxRenderable | null>(null)

  const info = entry ? bodyInfo(entry, activeTab) : null
  const isLarge = (info?.size ?? 0) > AUTO_RENDER_LIMIT

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
          setActiveTab((prev) => (prev === "request" ? "response" : "request"))
          setLoadedBody(null)
          setBodyError(null)
          setShowLargeBody(false)
        } else if (key.name === "v" && isLarge) setShowLargeBody(true)
        else if (key.name === "h") {
          const currentHeaders =
            activeTab === "request"
              ? buildDetailRequestHeaders(
                  entry.request.auth,
                  entry.request.headers,
                )
              : entry.response
                ? Object.entries(entry.response.headers)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => ({ key, value }))
                : []
          onCopyHeaders(formatHeaderEntries(currentHeaders))
        } else if (key.name === "b") {
          const body = loadedBody ?? info?.body
          if (body !== undefined) onCopyBody(body)
          else if (info?.ref) {
            onLoadBody(info.ref)
              .then(onCopyBody)
              .catch(() =>
                setBodyError("Unable to load the saved response body"),
              )
          }
        } else if (key.name === "e") {
          const exportBody = (body?: string) =>
            onExportBody(entry, activeTab, body).catch(() =>
              setBodyError("Failed to export timeline entry"),
            )
          const body = loadedBody ?? info?.body
          if (body !== undefined) exportBody(body)
          else if (info?.ref) {
            onLoadBody(info.ref)
              .then(exportBody)
              .catch(() =>
                setBodyError("Unable to load the saved response body"),
              )
          } else {
            exportBody(undefined)
          }
        } else if (key.name === "up") bodyScrollRef.current?.scrollBy(-1)
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
    onCopyHeaders,
    onCopyBody,
    onExportBody,
    onLoadBody,
    activeTab,
  ])

  if (!visible || !entry || !info) return null

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
          tabs={TAB_DEFS}
          activeId={activeTab}
          rightChildren={<text fg={theme.textMuted}>esc</text>}
        >
          <box
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
            {info.truncated ? (
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
                >{`Body is ${formatSize(info.size)}. It was not rendered automatically.`}</text>
                <text fg={theme.textMuted}>v view raw · b copy · e export</text>
              </box>
            ) : renderedBody ? (
              (() => {
                const bodyLines = renderedBody.split("\n").length
                const computedBodyHeight = Math.min(Math.max(bodyLines, 1), 10)
                return (
                  <scrollbox
                    ref={bodyScrollRef}
                    scrollY
                    height={computedBodyHeight}
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
        </Tabs>
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 1,
          }}
        >
          <text fg={theme.text}>h</text>
          <text fg={theme.textMuted}> copy headers </text>
          <text fg={theme.textMuted}>· </text>
          <text fg={theme.text}>b</text>
          <text fg={theme.textMuted}> copy body </text>
          <text fg={theme.textMuted}>· </text>
          <text fg={theme.text}>e</text>
          <text fg={theme.textMuted}> export</text>
        </box>
      </box>
    </Overlay>
  )
}
