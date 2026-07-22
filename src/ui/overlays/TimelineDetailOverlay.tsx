import { useEffect, useMemo, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { t, fg, type ScrollBoxRenderable } from "@opentui/core"
import type { TimelineBodyRef, TimelineEntry } from "../../schema"
import { VALID_COLORS } from "../../env/constants"
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
  { id: "response", label: "Response" },
  { id: "request", label: "Request" },
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

export function TimelineDetailOverlay({
  visible,
  entry,
  onClose,
  envColors,
  onLoadBody = async () => {
    throw new Error("No timeline body loader configured")
  },
  onCopyBody = () => {},
  onExportBody = async () => {},
}: {
  visible: boolean
  entry: TimelineEntry | null
  onClose: () => void
  envColors?: Record<string, string | undefined>
  onLoadBody?: (ref: TimelineBodyRef) => Promise<string>
  onCopyBody?: (body: string) => void
  onExportBody?: (
    entry: TimelineEntry,
    kind: DetailTab,
    body: string,
  ) => Promise<void>
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [activeTab, setActiveTab] = useState<DetailTab>("response")
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
    setActiveTab("response")
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
        else if (key.name === "c") {
          const body = loadedBody ?? info?.body
          if (body !== undefined) onCopyBody(body)
          else if (info?.ref) {
            onLoadBody(info.ref)
              .then(onCopyBody)
              .catch(() =>
                setBodyError("Unable to load the saved response body"),
              )
          }
        } else if (key.name === "s") {
          const exportBody = (body: string) =>
            onExportBody(entry, activeTab, body).catch(() => {})
          const body = loadedBody ?? info?.body
          if (body !== undefined) exportBody(body)
          else if (info?.ref) {
            onLoadBody(info.ref)
              .then(exportBody)
              .catch(() =>
                setBodyError("Unable to load the saved response body"),
              )
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
    onCopyBody,
    onExportBody,
    onLoadBody,
    activeTab,
  ])

  if (!visible || !entry || !info) return null

  const method = entryMethod(entry)
  const status = entryStatus(entry)
  const envColorKey = entry.envName ? envColors?.[entry.envName] : undefined
  const envBadgeBg =
    envColorKey && VALID_COLORS.has(envColorKey)
      ? ((theme as unknown as Record<string, string>)[envColorKey] ??
        theme.info)
      : theme.info
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
  const headerHeight = Math.min(Math.max(headers.length, 1), 7)

  return (
    <Overlay visible width={70} height="80%" gap={1} padding={1}>
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
                    content={t`${fg(methodColor(method, theme))(shortMethod(method) + " ")}${fg(theme.primary)(formatRequestUrl(entry))}`}
                  />
                </box>
                <box style={{ flexDirection: "row", flexShrink: 0 }}>
                  <text fg={theme.textMuted} wrapMode="none">
                    {truncateUrl(formatRequestDisplayName(entry), 60)}
                  </text>
                </box>
              </box>
            ) : entry.error ? (
              <box
                border={["left", "right", "top", "bottom"]}
                borderColor={theme.error}
                style={{ padding: 1, marginBottom: 1 }}
              >
                <text fg={theme.error}>{entry.error.message}</text>
              </box>
            ) : entry.response ? (
              <box
                style={{ flexDirection: "row", marginBottom: 2, minWidth: 0 }}
              >
                <box style={{ flexDirection: "row", flexShrink: 0 }}>
                  <Badge bg={statusColor(status!, theme)} fg={theme.background}>
                    {status}
                    {entry.response.statusText
                      ? ` ${entry.response.statusText}`
                      : ""}
                  </Badge>
                  {entry.envName && (
                    <box style={{ marginLeft: 1 }}>
                      <Badge bg={envBadgeBg} fg={theme.background}>
                        {entry.envName}
                      </Badge>
                    </box>
                  )}
                </box>
                <box style={{ flexGrow: 1 }} />
                <text fg={theme.textMuted} wrapMode="none">
                  {formatSize(entry.response.size)} in {entryTiming(entry)}
                </text>
              </box>
            ) : (
              <text fg={theme.textMuted}>No response</text>
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
              height={headerHeight}
              maxHeight={7}
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
                <text fg={theme.textMuted}>v view raw · c copy · s save</text>
              </box>
            ) : renderedBody ? (
              <scrollbox
                ref={bodyScrollRef}
                scrollY
                verticalScrollbarOptions={{
                  trackOptions: {
                    backgroundColor: theme.background,
                    foregroundColor: theme.borderActive,
                  },
                }}
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <JsonBodyViewer
                  body={renderedBody}
                  theme={theme}
                  highlightPriority={highlightPriority}
                />
              </scrollbox>
            ) : (
              <text fg={theme.textMuted}>
                {entry.response ? "(empty body)" : "No response"}
              </text>
            )}
          </box>
        </Tabs>
      </box>
    </Overlay>
  )
}
