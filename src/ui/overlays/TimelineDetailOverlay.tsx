import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeymap } from "@opentui/keymap/react"
import { t, fg, type ScrollBoxRenderable } from "@opentui/core"
import type { Request, TimelineBodyRef, TimelineEntry } from "../../schema"
import type { ResponseExecutionResults } from "../../executionResults"
import { formatJson } from "../../lang/formatJson"
import { ActionButton } from "../ActionButton"
import { useTheme } from "../theme"
import { Overlay } from "./Overlay"
import { EscapeClose } from "./EscapeClose"
import { Tabs, type TabDef } from "../Tabs"
import { bodyFiletype, formatSize, statusColor } from "../format"
import { methodColor } from "../formatRequest"
import { CodeEditorRenderable } from "../editor/CodeEditor"
import { HeaderTable } from "../HeaderTable"
import { NetworkTab } from "../NetworkTab"
import { ResponseResults } from "../ResponseResults"
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

type DetailTab = "request" | "response" | "results" | "network"
type BodyTab = Extract<DetailTab, "request" | "response">

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
  initialTab = "request",
  execution,
  request,
  showCaptures = false,
  captureLifetimeNote,
  warnings = [],
  onEditAssertions,
  onEditCaptures,
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
  initialTab?: Extract<DetailTab, "request" | "response">
  execution?: ResponseExecutionResults
  request?: Pick<Request, "assertions" | "captures">
  showCaptures?: boolean
  captureLifetimeNote?: string
  warnings?: string[]
  onEditAssertions?: () => void
  onEditCaptures?: () => void
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
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)
  const [loadedBody, setLoadedBody] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showLargeBody, setShowLargeBody] = useState(false)
  const bodyScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const bodyEditorRef = useRef<CodeEditorRenderable | null>(null)
  const [bodyEditor, setBodyEditor] = useState<CodeEditorRenderable | null>(
    null,
  )
  const setBodyEditorRef = useCallback(
    (editor: CodeEditorRenderable | null) => {
      bodyEditorRef.current = editor
      setBodyEditor(editor)
    },
    [],
  )

  const hasNetwork = (entry?.network?.length ?? 0) > 0
  const resultExecution =
    execution ??
    (entry?.assertions ? { assertions: entry.assertions } : undefined)
  const hasResults = Boolean(
    resultExecution?.assertions ||
    resultExecution?.captures ||
    request?.assertions?.some((assertion) => assertion.enabled !== false) ||
    Object.values(request?.captures ?? {}).some((capture) => capture.enabled),
  )
  const tabs = [
    ...BASE_TAB_DEFS,
    ...(hasResults ? [{ id: "results", label: "Results" }] : []),
    ...(hasNetwork ? [{ id: "network", label: "Network" }] : []),
  ]
  const info =
    entry && (activeTab === "request" || activeTab === "response")
      ? bodyInfo(entry, activeTab)
      : null
  const isLarge = (info?.size ?? 0) > AUTO_RENDER_LIMIT

  const selectTab = useCallback((tab: DetailTab) => {
    setActiveTab(tab)
    setLoadedBody(null)
    setBodyError(null)
    setShowLargeBody(false)
  }, [])

  const copyHeaders = useCallback(() => {
    if (!entry || activeTab === "network" || activeTab === "results") return
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
    if (activeTab === "network" || activeTab === "results") return
    const body = loadedBody ?? info?.body
    if (body !== undefined) onCopyBody(body)
    else if (info?.ref) {
      onLoadBody(info.ref)
        .then(onCopyBody)
        .catch(() => setBodyError("Unable to load the saved response body"))
    }
  }, [activeTab, loadedBody, info, onCopyBody, onLoadBody])

  const exportBody = useCallback(() => {
    if (!entry || activeTab === "network" || activeTab === "results") return
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
    setActiveTab(initialTab)
    setLoadedBody(null)
    setBodyError(null)
    setLoading(false)
    setShowLargeBody(false)
    bodyScrollRef.current?.scrollTo(0)
    bodyEditorRef.current?.scrollTo(0)
  }, [visible, entry, initialTab])

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
    bodyScrollRef.current?.scrollTo(0)
    bodyEditorRef.current?.scrollTo(0)
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
          const ids = tabs.map((tab) => tab.id as DetailTab)
          const index = ids.indexOf(activeTab)
          const direction = key.name === "left" ? -1 : 1
          selectTab(ids[(index + direction + ids.length) % ids.length]!)
        } else if (key.name === "v" && isLarge) setShowLargeBody(true)
        else if (key.name === "h") copyHeaders()
        else if (key.name === "b") copyBody()
        else if (key.name === "e") exportBody()
        else if (
          key.name === "a" &&
          activeTab === "results" &&
          onEditAssertions
        )
          onEditAssertions()
        else if (key.name === "c" && activeTab === "results" && onEditCaptures)
          onEditCaptures()
        else if (key.name === "up") {
          if (activeTab === "network" || activeTab === "results")
            bodyScrollRef.current?.scrollBy(-1)
          else bodyEditorRef.current?.scrollBy(-1)
        } else if (key.name === "down") {
          if (activeTab === "network" || activeTab === "results")
            bodyScrollRef.current?.scrollBy(1)
          else bodyEditorRef.current?.scrollBy(1)
        } else if (key.name === "pageup") {
          if (activeTab === "network" || activeTab === "results")
            bodyScrollRef.current?.scrollBy(-1, "viewport")
          else bodyEditorRef.current?.scrollByViewport(-1)
        } else if (key.name === "pagedown") {
          if (activeTab === "network" || activeTab === "results")
            bodyScrollRef.current?.scrollBy(1, "viewport")
          else bodyEditorRef.current?.scrollByViewport(1)
        } else if (key.name === "home") {
          if (activeTab === "network" || activeTab === "results")
            bodyScrollRef.current?.scrollTo(0)
          else bodyEditorRef.current?.scrollTo(0)
        } else if (key.name === "end") {
          if (activeTab === "network" || activeTab === "results") {
            const bodyScroll = bodyScrollRef.current
            if (bodyScroll)
              bodyScroll.scrollTo(
                Math.max(0, bodyScroll.scrollHeight - bodyScroll.height),
              )
          } else bodyEditorRef.current?.scrollTo(Number.MAX_SAFE_INTEGER)
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
    tabs,
    selectTab,
    copyHeaders,
    copyBody,
    exportBody,
    onEditAssertions,
    onEditCaptures,
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
  const renderedBodyFiletype =
    activeTab === "request"
      ? bodyFiletype(entry.request.headers, entry.request.bodyType)
      : bodyFiletype(entry.response?.headers ?? {})
  const headerHeight = 5

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
          tabs={tabs}
          activeId={activeTab}
          onChange={(tab) => selectTab(tab as DetailTab)}
          rightChildren={<EscapeClose onClose={onClose} />}
        >
          {activeTab === "network" ? (
            <NetworkTab
              key="network"
              events={entry.network}
              scrollRef={bodyScrollRef}
            />
          ) : activeTab === "results" ? (
            <box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
              <scrollbox
                ref={bodyScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <ResponseResults
                  execution={resultExecution}
                  request={request}
                  showCaptures={showCaptures}
                  captureLifetimeNote={captureLifetimeNote}
                  scrollRef={bodyScrollRef}
                  allowOverlayNavigation
                />
              </scrollbox>
              {onEditAssertions || onEditCaptures ? (
                <box
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 2,
                    paddingTop: 1,
                  }}
                >
                  {onEditAssertions ? (
                    <ActionButton
                      shortcut="a"
                      label="Edit Assert"
                      onAction={onEditAssertions}
                    />
                  ) : null}
                  {onEditCaptures ? (
                    <ActionButton
                      shortcut="c"
                      label="Edit Capture"
                      onAction={onEditCaptures}
                    />
                  ) : null}
                </box>
              ) : null}
            </box>
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
                        return (
                          <box style={{ flexDirection: "row", flexShrink: 0 }}>
                            <text
                              wrapMode="none"
                              content={t`${fg(statusColor(status!, theme))(String(status))}${fg(theme.text)(truncatedStatusText !== "" ? ` ${truncatedStatusText}` : "")}${fg(theme.textMuted)(` · ${formatSize(entry.response.size)} in ${entryTiming(entry)}`)}`}
                            />
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
                  {warnings.map((warning, index) => (
                    <text key={index} fg={theme.warning} wrapMode="char">
                      {`Warning: ${warning}`}
                    </text>
                  ))}
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
                    <ActionButton
                      shortcut="v"
                      label="view raw"
                      onAction={() => setShowLargeBody(true)}
                    />
                    <ActionButton
                      shortcut="b"
                      label="copy"
                      onAction={copyBody}
                    />
                    <ActionButton
                      shortcut="e"
                      label="export"
                      onAction={exportBody}
                    />
                  </box>
                </box>
              ) : renderedBody ? (
                <box
                  style={{
                    flexDirection: "row",
                    flexGrow: 1,
                    flexShrink: 1,
                    flexBasis: 0,
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  <line-number
                    minWidth={3}
                    paddingRight={1}
                    fg={theme.textMuted}
                    bg={theme.backgroundPanel}
                    onMouseScroll={(event) => {
                      const editor = bodyEditorRef.current
                      if (!editor || !event.scroll) return
                      if (event.scroll.direction === "up") {
                        editor.scrollBy(-event.scroll.delta)
                      } else if (event.scroll.direction === "down") {
                        editor.scrollBy(event.scroll.delta)
                      } else {
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    style={{
                      flexGrow: 1,
                      flexShrink: 1,
                      flexBasis: 0,
                      minHeight: 0,
                      minWidth: 0,
                    }}
                  >
                    <code-editor
                      id="timeline-body-editor"
                      ref={setBodyEditorRef}
                      filetype={renderedBodyFiletype}
                      theme={theme}
                      value={renderedBody}
                      readOnly
                      foldable={false}
                      backgroundColor={theme.backgroundPanel}
                      focusedBackgroundColor={theme.backgroundPanel}
                      textColor={theme.text}
                      focusedTextColor={theme.text}
                      cursorColor={theme.primary}
                      scrollMargin={0}
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        flexBasis: 0,
                        minHeight: 0,
                      }}
                    />
                  </line-number>
                  <code-editor-scrollbar
                    target={bodyEditor}
                    trackOptions={{
                      backgroundColor: theme.background,
                      foregroundColor: theme.borderActive,
                    }}
                    style={{ width: 1, flexShrink: 0, zIndex: 1 }}
                  />
                </box>
              ) : (
                <text fg={theme.textMuted}>
                  {entry.response ? "(empty body)" : "No response"}
                </text>
              )}
            </box>
          )}
        </Tabs>
        {(activeTab === "request" || activeTab === "response") && (
          <box
            id="timeline-detail-footer"
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 1,
              gap: 1,
            }}
          >
            <ActionButton
              shortcut="h"
              label="copy headers"
              onAction={copyHeaders}
            />
            <ActionButton shortcut="b" label="copy body" onAction={copyBody} />
            <ActionButton shortcut="e" label="export" onAction={exportBody} />
          </box>
        )}
      </box>
    </Overlay>
  )
}
