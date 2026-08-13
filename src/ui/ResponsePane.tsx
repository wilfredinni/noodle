import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { useKeymap } from "@opentui/keymap/react"
import {
  MouseButton,
  type InputRenderable,
  type LineNumberRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import type { RefObject } from "react"
import type { SendState } from "./sendState"
import type { NetworkError, ResponseCookie, TimelineEntry } from "../schema"
import { formatHeaders, formatBody, formatSize, statusColor } from "./format"
import { Tabs, type TabDef } from "./Tabs"
import { useTheme } from "./theme"
import { RESPONSE_TAB_HINT_ORDER } from "./useJumpMode"
import { FullBorder, LeftBar } from "./borders"
import { CodeEditorRenderable } from "./editor/CodeEditor"
import {
  RESERVED_FOLD_SIGN,
  syncCodeEditorGutter,
} from "./editor/codeEditorGutter"
import { Tips } from "./Tips"
import { Frame } from "./Frame"
import {
  parseResponseBody,
  queryParsedResponseBody,
  type ResponseQueryController,
} from "./responseQuery"

import { HeaderTable } from "./HeaderTable"
import { TimelineTab } from "./timeline/TimelineTab"
import { NetworkTab } from "./NetworkTab"
import { Badge } from "./Badge"
import type { ResponseTabKind } from "./tabs/uiState"
import { CookieRow, cookieDetails, cookieNameWidth } from "./CookieRow"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const AUTO_RENDER_LIMIT = 5 * 1024 * 1024
const TAB_DEFS: TabDef[] = [
  { id: "body", label: "Body" },
  { id: "headers", label: "Headers" },
  { id: "network", label: "Network" },
  { id: "timeline", label: "Timeline" },
  { id: "cookies", label: "Cookies" },
]

function isDeletedCookie(cookie: ResponseCookie): boolean {
  if (cookie.expires === null) return false
  const expires = Date.parse(cookie.expires)
  return !Number.isNaN(expires) && expires <= Date.now()
}

type CookieTimelineRow =
  | { kind: "sent"; name: string; value: string }
  | {
      kind: "received"
      name: string
      value: string
      cookie: ResponseCookie
      deleted: boolean
    }

export function ResponsePane({
  state,
  visible = true,
  focused = false,
  timelineEntries,
  initialTab,
  onTabChange,
  onOpenTimelineEntry,
  responseKey,
  responseQueryRef,
  responseBodyForCopyRef,
  layout,
  expanded,
  jumpMode = false,
  onQueryVisibleChange,
  onBodyEditorAvailableChange,
  onPaneFocus,
}: {
  state: SendState
  visible?: boolean
  focused?: boolean
  timelineEntries?: TimelineEntry[]
  initialTab?: ResponseTabKind
  onTabChange?: (tab: ResponseTabKind) => void
  onOpenTimelineEntry?: (entry: TimelineEntry) => void
  responseKey?: string | null
  responseQueryRef?: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef?: RefObject<string | null>
  layout?: "stacked" | "side-by-side"
  expanded?: "request" | "response" | null
  jumpMode?: boolean
  onQueryVisibleChange?: (v: boolean) => void
  onBodyEditorAvailableChange?: (available: boolean) => void
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  const isActiveRef = useRef(state.status !== "idle")
  isActiveRef.current = state.status !== "idle"

  const [activeTab, setActiveTab] = useState<ResponseTabKind>(
    initialTab ?? "body",
  )
  const tabs = useMemo(
    () =>
      jumpMode
        ? TAB_DEFS.map((tab, i) => ({
            ...tab,
            jumpHint: RESPONSE_TAB_HINT_ORDER[i],
          }))
        : TAB_DEFS,
    [jumpMode],
  )
  const [spinnerIdx, setSpinnerIdx] = useState(0)
  const [queryVisible, setQueryVisible] = useState(false)
  const [query, setQuery] = useState("")
  const [hoveringRawBody, setHoveringRawBody] = useState(false)
  const [settledQuery, setSettledQuery] = useState("")
  const [showLargeBody, setShowLargeBody] = useState(false)
  const isDone = state.status === "done"
  const sentCookies = isDone ? (state.response.sentCookies ?? []) : []
  const responseCookies = isDone ? (state.response.cookies ?? []) : []
  const cookieRows: CookieTimelineRow[] = [
    ...sentCookies.map(({ name, value }) => ({
      kind: "sent" as const,
      name,
      value,
    })),
    ...responseCookies.map((cookie) => ({
      kind: "received" as const,
      name: cookie.name,
      value: cookie.value,
      cookie,
      deleted: isDeletedCookie(cookie),
    })),
  ]
  const cookieNameColumnWidth =
    cookieRows.length === 0 ? 0 : cookieNameWidth(cookieRows)
  const [selectedCookieIdx, setSelectedCookieIdx] = useState(0)
  const [expandedCookieIdx, setExpandedCookieIdx] = useState<number | null>(
    null,
  )
  const [hoveredCookieIdx, setHoveredCookieIdx] = useState<number | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const queryInputRef = useRef<InputRenderable | null>(null)
  const bodyEditorRef = useRef<CodeEditorRenderable | null>(null)
  const lineNumberRef = useRef<LineNumberRenderable | null>(null)
  const onBodyEditorAvailableChangeRef = useRef(onBodyEditorAvailableChange)
  onBodyEditorAvailableChangeRef.current = onBodyEditorAvailableChange
  const [bodyEditor, setBodyEditor] = useState<CodeEditorRenderable | null>(
    null,
  )

  const syncFoldSigns = useCallback(() => {
    const editor = bodyEditorRef.current
    const lineNumber = lineNumberRef.current
    if (!editor || !lineNumber) return
    syncCodeEditorGutter(lineNumber, editor)
  }, [])

  const setBodyEditorRef = useCallback(
    (editor: CodeEditorRenderable | null) => {
      bodyEditorRef.current = editor
      setBodyEditor(editor)
      onBodyEditorAvailableChangeRef.current?.(editor !== null)
      if (editor) syncFoldSigns()
    },
    [syncFoldSigns],
  )

  useEffect(() => {
    if (!bodyEditorRef.current) onBodyEditorAvailableChangeRef.current?.(false)
  }, [])

  const setLineNumberRef = useCallback(
    (lineNumber: LineNumberRenderable | null) => {
      lineNumberRef.current = lineNumber
      if (lineNumber) syncFoldSigns()
    },
    [syncFoldSigns],
  )

  const onQueryVisibleChangeRef = useRef(onQueryVisibleChange)
  onQueryVisibleChangeRef.current = onQueryVisibleChange

  useEffect(() => {
    onQueryVisibleChangeRef.current?.(queryVisible)
  }, [queryVisible])

  useEffect(() => {
    setSelectedCookieIdx(0)
    setExpandedCookieIdx(null)
    setHoveredCookieIdx(null)
  }, [activeTab, responseKey, state.status])

  useKeyboard((key) => {
    if (!focusedRef.current) return
    if (!isActiveRef.current) return
    if (keymap.getData("app.overlay") !== "none") return
    if (queryVisible) return
    if (!key.shift && key.name === "left") {
      key.preventDefault()
      setActiveTab((prev) => {
        const ids = [
          "body",
          "headers",
          "network",
          "timeline",
          "cookies",
        ] as const
        const idx = ids.indexOf(prev)
        return ids[(idx - 1 + ids.length) % ids.length]
      })
    } else if (!key.shift && key.name === "right") {
      key.preventDefault()
      setActiveTab((prev) => {
        const ids = [
          "body",
          "headers",
          "network",
          "timeline",
          "cookies",
        ] as const
        const idx = ids.indexOf(prev)
        return ids[(idx + 1) % ids.length]
      })
    } else if (key.name === "v" && activeTab === "body") {
      setShowLargeBody(true)
    } else if (activeTab === "timeline") {
      return
    } else if (activeTab === "cookies") {
      if (cookieRows.length === 0) return
      if (key.name === "up" || key.name === "down") {
        key.preventDefault()
        setSelectedCookieIdx((prev) => {
          const next =
            key.name === "up"
              ? prev <= 0
                ? cookieRows.length - 1
                : prev - 1
              : prev >= cookieRows.length - 1
                ? 0
                : prev + 1
          queueMicrotask(() =>
            scrollRef.current?.scrollChildIntoView(`response-cookie-${next}`),
          )
          return next
        })
      } else if (key.name === "return") {
        key.preventDefault()
        setExpandedCookieIdx((prev) =>
          prev === selectedCookieIdx ? null : selectedCookieIdx,
        )
        queueMicrotask(() =>
          scrollRef.current?.scrollChildIntoView(
            `response-cookie-${selectedCookieIdx}`,
          ),
        )
      } else if (key.name === "pagedown") {
        scrollRef.current?.scrollBy(1, "viewport")
      } else if (key.name === "pageup") {
        scrollRef.current?.scrollBy(-1, "viewport")
      } else if (key.name === "home") {
        key.preventDefault()
        setSelectedCookieIdx(0)
        scrollRef.current?.scrollTo(0)
      } else if (key.name === "end") {
        key.preventDefault()
        setSelectedCookieIdx(Math.max(0, cookieRows.length - 1))
        scrollRef.current?.scrollTo(
          Math.max(
            0,
            scrollRef.current.scrollHeight - scrollRef.current.height,
          ),
        )
      }
      return
    } else if (activeTab === "body" && bodyEditorRef.current) {
      if (key.shift && bodyEditorRef.current.handleKeyPress(key)) {
        key.preventDefault()
        key.stopPropagation()
      }
      return
    } else if (key.name === "down") {
      scrollRef.current?.scrollBy(1)
    } else if (key.name === "up") {
      scrollRef.current?.scrollBy(-1)
    } else if (key.name === "pagedown") {
      scrollRef.current?.scrollBy(1, "viewport")
    } else if (key.name === "pageup") {
      scrollRef.current?.scrollBy(-1, "viewport")
    } else if (key.name === "home") {
      key.preventDefault()
      scrollRef.current?.scrollTo(0)
    } else if (key.name === "end") {
      key.preventDefault()
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
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const syncVersionRef = useRef(0)
  useEffect(() => {
    const next = initialTab ?? "body"
    if (next !== activeTabRef.current) {
      syncVersionRef.current += 1
    }
    setActiveTab(next)
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
    const nextQuery = query.trim()
    if (nextQuery === settledQuery) return
    const timer = setTimeout(() => setSettledQuery(nextQuery), 150)
    return () => clearTimeout(timer)
  }, [query, queryVisible, settledQuery])

  const borderColor = focused ? theme.primary : theme.borderSubtle

  const responseHeaders = isDone ? formatHeaders(state.response) : []
  const networkEvents =
    state.status === "sending"
      ? state.network
      : isDone
        ? state.response.network
        : state.status === "error"
          ? (state.error as NetworkError).network
          : undefined

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
    if (displayedBody) bodyEditorRef.current?.scrollTo(0)
  }, [displayedBody])

  useEffect(() => {
    const editor = bodyEditor
    if (!editor) return
    if (focused && activeTab === "body" && !queryVisible && displayedBody) {
      editor.focus()
    } else {
      editor.blur()
    }
  }, [bodyEditor, focused, activeTab, queryVisible, displayedBody])

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
      isOpen: () => queryVisible,
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

  const headerRight = (
    <box style={{ flexDirection: "row" }}>
      {!jumpMode ? (
        <Badge
          bg={theme.backgroundPanel}
          fg={focused ? theme.primary : theme.textMuted}
        >
          Response
        </Badge>
      ) : null}
      {isDone
        ? (() => {
            const rawText = state.response.statusText
            const truncatedStatusText =
              rawText.length > 13 ? `${rawText.slice(0, 13)}…` : rawText
            const statusStr = `${state.response.status}${truncatedStatusText !== "" ? ` ${truncatedStatusText}` : ""}`
            return (
              <box style={{ flexDirection: "row" }}>
                <Badge
                  bg={theme.backgroundElement}
                  fg={focused ? theme.text : theme.textMuted}
                >
                  {`${formatSize(bodySize)} in ${Math.round(state.response.timeMs)}ms`}
                </Badge>
                <Badge
                  bg={statusColor(state.response.status, theme)}
                  fg={theme.backgroundPanel}
                >
                  {statusStr}
                </Badge>
              </box>
            )
          })()
        : null}
    </box>
  )

  return (
    <Frame
      visible={visible}
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
      titleRight={headerRight}
      onPaneFocus={onPaneFocus}
      onMouseDrag={(event) => {
        bodyEditorRef.current?.handleSelectionDrag(event.x, event.y)
      }}
      onMouseUp={() => {
        bodyEditorRef.current?.finishSelectionDrag()
      }}
    >
      <box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(tab) => {
            onPaneFocus?.()
            setActiveTab(tab as ResponseTabKind)
          }}
        >
          {activeTab === "network" ? (
            <NetworkTab
              events={networkEvents}
              scrollRef={scrollRef}
              emptyMessage={
                state.status === "error"
                  ? "Request did not reach the network."
                  : undefined
              }
            />
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
                <text fg={focused ? theme.primary : theme.textMuted}>
                  Sending
                </text>
              </box>
            </box>
          ) : activeTab === "timeline" ? (
            <TimelineTab
              entries={timelineEntries ?? []}
              focused={focused}
              onOpenEntry={onOpenTimelineEntry}
              onPaneFocus={onPaneFocus}
              layout={layout}
              expanded={expanded}
            />
          ) : activeTab === "body" ? (
            state.status === "idle" ? (
              <Tips />
            ) : state.status === "error" ? (
              <box
                border={[...LeftBar.border]}
                customBorderChars={LeftBar.customBorderChars}
                borderColor={theme.error}
              >
                <text fg={theme.error}> {state.error.message}</text>
              </box>
            ) : (
              <box
                style={{
                  flexDirection: "column",
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  overflow: "hidden",
                }}
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
                {isDone && bodySize > AUTO_RENDER_LIMIT && !showLargeBody ? (
                  <box
                    style={{
                      flexDirection: "column",
                      flexGrow: 1,
                      minHeight: 0,
                    }}
                  >
                    <box style={{ flexDirection: "column" }}>
                      <text
                        fg={theme.warning}
                      >{`Body is ${formatSize(bodySize)}. It was not rendered automatically.`}</text>
                      <box
                        onMouseDown={(event) => {
                          if (event.button !== MouseButton.LEFT) return
                          onPaneFocus?.()
                          setShowLargeBody(true)
                          event.stopPropagation()
                        }}
                        onMouseOver={() => setHoveringRawBody(true)}
                        onMouseOut={() => setHoveringRawBody(false)}
                        style={{
                          backgroundColor: hoveringRawBody
                            ? theme.backgroundElement
                            : undefined,
                        }}
                      >
                        <text fg={theme.textMuted}>
                          v view raw · ctrl+b copy
                        </text>
                      </box>
                    </box>
                  </box>
                ) : displayedBody === "" ? (
                  <text fg={theme.textMuted}>(no body)</text>
                ) : (
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
                      ref={setLineNumberRef}
                      minWidth={4}
                      paddingRight={1}
                      fg={theme.textMuted}
                      bg={theme.backgroundPanel}
                      lineSigns={RESERVED_FOLD_SIGN}
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
                      onMouseDown={(event) => {
                        const editor = bodyEditorRef.current
                        if (event.button !== MouseButton.LEFT || !editor) return
                        if (event.x >= editor.x) return
                        const displayLine =
                          editor.lineInfo.lineSources[
                            event.y - editor.y + editor.scrollY
                          ]
                        if (
                          displayLine === undefined ||
                          !editor.getFoldSigns().has(displayLine)
                        )
                          return
                        editor.toggleFold(displayLine)
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
                        id="response-body-editor"
                        ref={setBodyEditorRef}
                        filetype="json"
                        theme={theme}
                        value={displayedBody}
                        readOnly
                        foldable
                        onFoldsChange={syncFoldSigns}
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
                      id="response-body-scrollbar"
                      target={bodyEditor}
                      trackOptions={{
                        backgroundColor: theme.background,
                        foregroundColor: theme.borderActive,
                      }}
                      style={{ width: 1, flexShrink: 0, zIndex: 1 }}
                    />
                  </box>
                )}
              </box>
            )
          ) : activeTab === "cookies" ? (
            state.status === "done" ? (
              <scrollbox
                id="response-cookies-scrollbox"
                ref={scrollRef}
                scrollY
                verticalScrollbarOptions={{
                  trackOptions: {
                    backgroundColor: theme.background,
                    foregroundColor: theme.borderActive,
                  },
                }}
                style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
              >
                {cookieRows.length === 0 ? (
                  <text fg={theme.textMuted}>No cookies captured.</text>
                ) : (
                  <box style={{ flexDirection: "column", gap: 0 }}>
                    {cookieRows.map((row, idx) => {
                      const isSelected = idx === selectedCookieIdx
                      const isExpanded = idx === expandedCookieIdx
                      const deleted = row.kind === "received" && row.deleted
                      return (
                        <CookieRow
                          id={`response-cookie-${idx}`}
                          key={`${row.kind}:${row.name}:${idx}`}
                          kindLabel={row.kind.toUpperCase()}
                          kindColor={
                            row.kind === "sent" ? theme.info : theme.secondary
                          }
                          name={row.name}
                          value={row.value}
                          nameWidth={cookieNameColumnWidth}
                          selected={isSelected}
                          expanded={isExpanded}
                          hovered={hoveredCookieIdx === idx}
                          deleted={deleted}
                          valueColor={deleted ? theme.error : theme.textMuted}
                          details={
                            row.kind === "received"
                              ? [
                                  {
                                    label: "Value",
                                    value: row.deleted
                                      ? "Deleted"
                                      : row.value || "(empty)",
                                  },
                                  ...cookieDetails(row.cookie, row.deleted),
                                ]
                              : undefined
                          }
                          onSelect={() => setSelectedCookieIdx(idx)}
                          onToggleExpanded={() =>
                            setExpandedCookieIdx((prev) =>
                              prev === idx ? null : idx,
                            )
                          }
                          onHover={(isHovered) =>
                            setHoveredCookieIdx(isHovered ? idx : null)
                          }
                          onPaneFocus={onPaneFocus}
                        />
                      )
                    })}
                  </box>
                )}
              </scrollbox>
            ) : state.status === "error" ? (
              <text fg={theme.textMuted}>No cookies available.</text>
            ) : (
              <Tips />
            )
          ) : state.status === "done" ? (
            <scrollbox
              id="response-headers-scrollbox"
              ref={scrollRef}
              scrollY
              verticalScrollbarOptions={{
                trackOptions: {
                  backgroundColor: theme.background,
                  foregroundColor: theme.borderActive,
                },
              }}
              style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
            >
              <HeaderTable entries={responseHeaders} theme={theme} />
            </scrollbox>
          ) : state.status === "error" ? (
            <text fg={theme.textMuted}>No response headers available.</text>
          ) : (
            <Tips />
          )}
        </Tabs>
      </box>
    </Frame>
  )
}
