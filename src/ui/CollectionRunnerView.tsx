import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"
import {
  MouseButton,
  TextAttributes,
  type BoxRenderable,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { stringWidth } from "bun"
import { useTerminalDimensions } from "@opentui/react"
import type { Focus } from "./focus"
import type { FieldKind } from "./editMode"
import type {
  RunnerResultRow,
  UseCollectionRunnerResult,
} from "../hooks/useCollectionRunner"
import type { CollectionItem, Request } from "../schema"
import { useTheme } from "./theme"
import { Frame } from "./Frame"
import { FullBorder, LeftBar } from "./borders"
import { Tabs } from "./Tabs"
import { Checkbox } from "./Checkbox"
import { Select } from "./Select"
import { COOKIE_CHEVRON_WIDTH, CookieRow } from "./CookieRow"
import { ResponseResults } from "./ResponseResults"
import { methodColor } from "./formatRequest"
import { statusColor, truncateToWidth } from "./format"
import { flattenRequests } from "./tree"

const OPTION_LABELS = [
  "Scope",
  "Environment",
  "Include tag",
  "Exclude tag",
  "Fail fast",
  "Run",
] as const

const OPTION_DESCRIPTIONS = [
  "Run every request in the collection or selected folder.",
  "Select the environment used for this run.",
  "Only run requests with this tag.",
  "Skip requests with this tag.",
  "Stop running after the first failed request.",
  "Run the selected requests with the options above.",
] as const

function resultStatusLabel(row: RunnerResultRow): string {
  if (row.kind === "skipped") return "Skipped"
  if (!row.result.response) return "error"
  return `${row.result.response.status} ${row.result.response.statusText}`
}

function resultRowValue(row: RunnerResultRow): string {
  if (row.kind === "skipped") return resultStatusLabel(row)
  const status = resultStatusLabel(row)
  const timing = row.result.response
    ? ` · ${Math.round(row.result.response.timeMs)}ms`
    : ""
  return `${row.result.method} ${status}${timing}`
}

function resultDetails(row: RunnerResultRow) {
  if (row.kind === "skipped") {
    return [{ label: "Status", value: "Skipped by fail-fast." }]
  }

  const details = [
    { label: "Method", value: row.result.method },
    { label: "URL", value: row.result.url },
  ]
  if (row.result.response) {
    details.push(
      {
        label: "Status",
        value: `${row.result.response.status} ${row.result.response.statusText} · ${Math.round(row.result.response.timeMs)}ms`,
      },
      {
        label: "Headers",
        value:
          Object.entries(row.result.response.headers)
            .map(([name, value]) => `${name}: ${value}`)
            .join("\n") || "(none)",
      },
      { label: "Body", value: row.result.response.body || "(no body)" },
    )
  }
  if (row.result.error)
    details.push({ label: "Error", value: row.result.error })
  for (const [index, warning] of (row.result.warnings ?? []).entries()) {
    details.push({ label: `Warning ${index + 1}`, value: warning })
  }
  return details
}

function requestTagLabel(tags: string[]): string {
  return tags.map((tag) => `#${tag}`).join(" ")
}

interface ResizeClick {
  time: number
  x: number
  y: number
}

const DOUBLE_CLICK_INTERVAL = 300

function isDoubleClick(
  previous: ResizeClick | null,
  current: ResizeClick,
): boolean {
  return (
    previous !== null &&
    current.time - previous.time <= DOUBLE_CLICK_INTERVAL &&
    Math.abs(current.x - previous.x) <= 1 &&
    Math.abs(current.y - previous.y) <= 1
  )
}

type RunnerListRow =
  | {
      kind: "folder"
      path: string
      name: string
      requestIds: string[]
      depth: number
    }
  | { kind: "request"; request: Request; index: number; depth: number }

function flattenRunnerRows(
  items: CollectionItem[],
  requestIndexById: Map<string, number>,
  depth = 0,
): RunnerListRow[] {
  const rows: RunnerListRow[] = []
  for (const item of items) {
    if (item.type === "folder") {
      rows.push({
        kind: "folder",
        path: item.data.path,
        name: item.data.name,
        requestIds: flattenRequests(item.data.children).map(
          (request) => request.id,
        ),
        depth,
      })
      rows.push(
        ...flattenRunnerRows(item.data.children, requestIndexById, depth + 1),
      )
      continue
    }
    const index = requestIndexById.get(item.data.id)
    if (index !== undefined) {
      rows.push({ kind: "request", request: item.data, index, depth })
    }
  }
  return rows
}

export function CollectionRunnerView({
  runner,
  focus,
  hasUnsavedChanges,
  detailScrollRef,
  onPaneFocus,
  onEditRequestTab,
}: {
  runner: UseCollectionRunnerResult
  focus: Focus
  hasUnsavedChanges: boolean
  detailScrollRef: RefObject<ScrollBoxRenderable | null>
  onPaneFocus: (focus: Focus) => void
  onEditRequestTab: (requestId: string, tab: FieldKind) => void
}) {
  const theme = useTheme()
  const { width = 100 } = useTerminalDimensions()
  const stacked = width < 100
  const inputRef = useRef<InputRenderable | null>(null)
  const optionScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const requestScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const splitContainerRef = useRef<BoxRenderable | null>(null)
  const resizingSplitRef = useRef(false)
  const splitDraggedRef = useRef(false)
  const lastSplitClickRef = useRef<(ResizeClick & { stacked: boolean }) | null>(
    null,
  )
  const [splitRatio, setSplitRatio] = useState(0.5)

  useEffect(() => {
    optionScrollRef.current?.scrollChildIntoView(
      `runner-option-${runner.optionIndex}`,
    )
  }, [runner.optionIndex])
  useEffect(() => {
    if (runner.editingOption) inputRef.current?.focus()
  }, [runner.editingOption])
  useEffect(() => {
    requestScrollRef.current?.scrollChildIntoView(
      `runner-row-${runner.requestRowIndex}`,
    )
  }, [runner.requestRowIndex])
  useEffect(() => {
    detailScrollRef.current?.scrollChildIntoView(
      `runner-result-${runner.resultIndex}`,
    )
  }, [runner.resultIndex])

  const paneDirection = stacked ? "column" : "row"
  const requestPaneWidth = stacked
    ? width
    : Math.floor((width - 1) * (1 - splitRatio))
  const requestContentWidth = Math.max(0, requestPaneWidth - 4)
  const requestIndexById = new Map(
    runner.requests.map((request, index) => [request.id, index]),
  )
  const runnerRows = flattenRunnerRows(runner.items, requestIndexById)
  const requestBaseLabelWidth = Math.max(0, requestContentWidth - 11)
  const requestTagLabels = runner.requests.map((request) =>
    requestTagLabel(runner.requestTags.get(request.id) ?? []),
  )
  const requestTagColumnWidth = Math.min(
    Math.max(0, ...requestTagLabels.map((label) => stringWidth(label))),
    Math.floor(requestBaseLabelWidth / 2),
  )
  const hasFilteredRequests = runner.requests.some(
    (request) =>
      runner.selectedIds.has(request.id) && !runner.matchedIds.has(request.id),
  )
  const filteredColumnWidth = hasFilteredRequests
    ? stringWidth("filtered") + 1
    : 0
  const requestLabelWidth = Math.max(
    0,
    requestBaseLabelWidth -
      filteredColumnWidth -
      (requestTagColumnWidth > 0 ? requestTagColumnWidth + 1 : 0),
  )
  const resultNameAvailable = Math.max(0, requestContentWidth - 14)
  const resultValueWidth = Math.min(
    resultNameAvailable,
    Math.max(
      8,
      ...runner.resultRows.map((row) => stringWidth(` ${resultRowValue(row)}`)),
    ),
  )
  const resultNameWidth = Math.max(0, resultNameAvailable - resultValueWidth)
  const paneStyle = {
    flexDirection: "column" as const,
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
    paddingLeft: 1,
    paddingRight: 1,
    backgroundColor: theme.backgroundPanel,
  }
  const activeTab = runner.phase === "results" ? "results" : "select"
  const configurationLocked =
    runner.phase === "running" ||
    runner.editingOption !== null ||
    runner.selectOpen

  const splitPaneStyle = (first: boolean) => {
    const ratio = first ? splitRatio : 1 - splitRatio
    return {
      ...paneStyle,
      flexGrow: 0,
      flexBasis: "auto",
      width: stacked ? "100%" : `${ratio * 100}%`,
      height: stacked ? `${ratio * 100}%` : "100%",
    }
  }

  const startSplitResize = (event: {
    button: MouseButton
    preventDefault: () => void
    stopPropagation: () => void
  }) => {
    if (event.button !== MouseButton.LEFT) return
    resizingSplitRef.current = true
    splitDraggedRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const splitHandle = (
    <box
      id="runner-resize-handle"
      style={{
        width: stacked ? "100%" : 1,
        height: stacked ? 1 : "100%",
        flexShrink: 0,
        zIndex: 1,
      }}
      onMouseDown={startSplitResize}
    />
  )

  useLayoutEffect(() => {
    if (runner.phase === "results" && focus !== "runner-requests") {
      onPaneFocus("runner-requests")
    } else if (
      runner.phase !== "results" &&
      focus !== "runner-options" &&
      focus !== "runner-requests"
    ) {
      onPaneFocus("runner-options")
    }
  }, [focus, onPaneFocus, runner.phase])

  return (
    <box
      id="collection-runner"
      onMouseDrag={(event) => {
        if (!resizingSplitRef.current || !splitContainerRef.current) return
        splitDraggedRef.current = true
        const size =
          (stacked
            ? splitContainerRef.current.height
            : splitContainerRef.current.width) - 1
        const minimum = stacked ? 6 : 16
        const position = stacked
          ? event.y - splitContainerRef.current.y
          : event.x - splitContainerRef.current.x
        setSplitRatio(
          size <= minimum * 2
            ? 0.5
            : Math.max(minimum, Math.min(size - minimum, position)) / size,
        )
        event.preventDefault()
        event.stopPropagation()
      }}
      onMouseUp={(event) => {
        if (!resizingSplitRef.current) return
        resizingSplitRef.current = false
        const click = { time: Date.now(), x: event.x, y: event.y }
        const previous = lastSplitClickRef.current
        if (splitDraggedRef.current) {
          lastSplitClickRef.current = null
        } else if (
          previous?.stacked === stacked &&
          isDoubleClick(previous, click)
        ) {
          lastSplitClickRef.current = null
          setSplitRatio(0.5)
        } else {
          lastSplitClickRef.current = { ...click, stacked }
        }
        event.preventDefault()
        event.stopPropagation()
      }}
      style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}
    >
      <box
        id="runner-split"
        ref={splitContainerRef}
        style={{
          flexDirection: paneDirection,
          flexGrow: 1,
          minHeight: 0,
          gap: 0,
        }}
      >
        <Frame
          title="Options"
          titleAlignment="right"
          border={[...FullBorder.border]}
          customBorderChars={FullBorder.customBorderChars}
          borderColor={
            focus === "runner-options" ? theme.primary : theme.borderSubtle
          }
          style={splitPaneStyle(true)}
          onPaneFocus={() => onPaneFocus("runner-options")}
        >
          <scrollbox
            ref={optionScrollRef}
            scrollY
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
              minHeight: 0,
            }}
          >
            <box style={{ flexDirection: "column", gap: 1 }}>
              {OPTION_LABELS.map((label, index) => {
                const active =
                  focus === "runner-options" && runner.optionIndex === index
                const backgroundColor = active
                  ? theme.backgroundElement
                  : undefined
                return (
                  <box key={label} style={{ flexDirection: "column" }}>
                    <box
                      id={`runner-option-${index}`}
                      border={[...LeftBar.border]}
                      customBorderChars={LeftBar.customBorderChars}
                      borderColor={active ? theme.primary : theme.borderSubtle}
                      style={{ flexDirection: "column", backgroundColor }}
                      onMouseDown={(event) => {
                        if (event.button !== MouseButton.LEFT) return
                        if (configurationLocked) {
                          event.stopPropagation()
                          return
                        }
                        onPaneFocus("runner-options")
                        runner.setOptionIndex(index)
                        if (index === 2) runner.beginOptionEdit("include")
                        else if (index === 3) runner.beginOptionEdit("exclude")
                        else if (index === 4) runner.toggleFailFast()
                        else if (index === 5) void runner.run()
                        event.stopPropagation()
                      }}
                    >
                      {index === 0 ? (
                        <text fg={theme.text}>
                          {`${label}: ${runner.scopeLabel}`}
                        </text>
                      ) : index === 1 ? (
                        <box style={{ flexDirection: "row", gap: 1 }}>
                          <text fg={theme.text}>{`${label}:`}</text>
                          <Select
                            items={[
                              { id: "", label: "Collection default" },
                              ...runner.environmentNames.map((name) => ({
                                id: name,
                                label: name,
                              })),
                            ]}
                            value={runner.environmentName ?? ""}
                            focused={active}
                            visualFocused={active}
                            interactive={!configurationLocked}
                            onActivate={() => runner.setOptionIndex(1)}
                            onOpenChange={runner.setSelectOpen}
                            onChange={(name) =>
                              runner.setEnvironmentName(name || null)
                            }
                            fitContent
                          />
                        </box>
                      ) : index === 2 || index === 3 ? (
                        <box style={{ flexDirection: "row", gap: 1 }}>
                          <text fg={theme.text}>{`${label}:`}</text>
                          {runner.editingOption ===
                          (index === 2 ? "include" : "exclude") ? (
                            <input
                              ref={inputRef}
                              value={runner.editValue}
                              onInput={runner.setEditValue}
                              placeholder="tag"
                              backgroundColor={theme.backgroundElement}
                              focusedBackgroundColor={theme.backgroundElement}
                              textColor={theme.text}
                              cursorColor={theme.primary}
                              style={{ flexGrow: 1 }}
                            />
                          ) : (
                            <text fg={theme.text}>
                              {(index === 2
                                ? runner.includeTag
                                : runner.excludeTag) || "Any"}
                            </text>
                          )}
                        </box>
                      ) : index === 4 ? (
                        <box style={{ flexDirection: "row", gap: 1 }}>
                          <text fg={theme.text}>{`${label}:`}</text>
                          <Checkbox checked={runner.failFast} theme={theme} />
                        </box>
                      ) : (
                        <text
                          fg={runner.canRun ? theme.primary : theme.textMuted}
                          attributes={TextAttributes.BOLD}
                        >
                          Run {runner.matchedIds.size} request
                          {runner.matchedIds.size === 1 ? "" : "s"}
                        </text>
                      )}
                    </box>
                    <text fg={theme.textMuted}>
                      {OPTION_DESCRIPTIONS[index]}
                    </text>
                  </box>
                )
              })}
            </box>
          </scrollbox>
          {hasUnsavedChanges ? (
            <text fg={theme.warning}>
              Save pending changes in the request workspace before running.
            </text>
          ) : null}
          {runner.previewError ? (
            <text fg={theme.error}>{runner.previewError}</text>
          ) : null}
          {runner.runError ? (
            <text fg={theme.error}>{runner.runError}</text>
          ) : null}
          {runner.phase === "running" ? (
            <>
              <text fg={theme.primary}>
                {`Running ${runner.progress.completed}/${runner.progress.total}`}
              </text>
              <text fg={theme.textMuted}>
                Run in progress. Escape is unavailable.
              </text>
            </>
          ) : null}
        </Frame>
        {splitHandle}
        <Frame
          title="Requests"
          titleAlignment="right"
          border={[...FullBorder.border]}
          customBorderChars={FullBorder.customBorderChars}
          borderColor={
            focus === "runner-requests" ? theme.primary : theme.borderSubtle
          }
          style={splitPaneStyle(false)}
          onPaneFocus={() => onPaneFocus("runner-requests")}
        >
          <Tabs
            tabs={[
              { id: "select", label: "Select" },
              ...(runner.result ? [{ id: "results", label: "Results" }] : []),
            ]}
            activeId={activeTab}
            onChange={(id) => {
              if (configurationLocked) return
              onPaneFocus("runner-requests")
              if (id === "results") runner.showResults()
              else runner.showConfigure()
            }}
          >
            {activeTab === "select" ? (
              <scrollbox
                ref={requestScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <box style={{ flexDirection: "column", gap: 0 }}>
                  {runnerRows.map((row, rowIndex) => {
                    if (row.kind === "folder") {
                      const selectedCount = row.requestIds.filter((id) =>
                        runner.selectedIds.has(id),
                      ).length
                      const selected =
                        row.requestIds.length > 0 &&
                        selectedCount === row.requestIds.length
                      const indeterminate = selectedCount > 0 && !selected
                      const nameWidth = Math.max(
                        0,
                        requestBaseLabelWidth - row.depth * 2,
                      )
                      const active =
                        focus === "runner-requests" &&
                        runner.requestRowIndex === rowIndex
                      return (
                        <box
                          key={`folder-${row.path}`}
                          id={`runner-row-${rowIndex}`}
                          style={{
                            flexDirection: "row",
                            height: 1,
                            paddingLeft: row.depth * 2,
                            backgroundColor: active
                              ? theme.backgroundElement
                              : undefined,
                          }}
                          onMouseDown={(event) => {
                            if (event.button !== MouseButton.LEFT) return
                            if (configurationLocked) {
                              event.stopPropagation()
                              return
                            }
                            onPaneFocus("runner-requests")
                            runner.setRequestRowIndex(rowIndex)
                            runner.toggleFolder(row.path)
                            event.stopPropagation()
                          }}
                        >
                          <box style={{ width: 4, flexShrink: 0 }}>
                            <Checkbox
                              checked={selected}
                              indeterminate={indeterminate}
                              theme={theme}
                            />
                          </box>
                          <text
                            fg={theme.textMuted}
                            style={{ width: 7, flexShrink: 0 }}
                            wrapMode="none"
                          >
                            {"FOLDER".padEnd(7)}
                          </text>
                          <text
                            fg={theme.text}
                            style={{ width: nameWidth, flexShrink: 0 }}
                            wrapMode="none"
                          >
                            {truncateToWidth(row.name, nameWidth, false)}
                          </text>
                        </box>
                      )
                    }

                    const { request, index } = row
                    const selected = runner.selectedIds.has(request.id)
                    const matched = runner.matchedIds.has(request.id)
                    const filteredLabel = selected && !matched ? "filtered" : ""
                    const tagsLabel = requestTagLabel(
                      runner.requestTags.get(request.id) ?? [],
                    )
                    const nameWidth = Math.max(
                      0,
                      requestLabelWidth - row.depth * 2,
                    )
                    const active =
                      focus === "runner-requests" &&
                      runner.requestRowIndex === rowIndex
                    return (
                      <box
                        key={request.id}
                        id={`runner-row-${rowIndex}`}
                        style={{
                          flexDirection: "row",
                          height: 1,
                          paddingLeft: row.depth * 2,
                          backgroundColor: active
                            ? theme.backgroundElement
                            : undefined,
                        }}
                        onMouseDown={(event) => {
                          if (event.button !== MouseButton.LEFT) return
                          if (configurationLocked) {
                            event.stopPropagation()
                            return
                          }
                          onPaneFocus("runner-requests")
                          runner.setRequestIndex(index)
                          runner.toggleSelected(index)
                          event.stopPropagation()
                        }}
                      >
                        <box style={{ width: 4, flexShrink: 0 }}>
                          <Checkbox checked={selected} theme={theme} />
                        </box>
                        <text
                          fg={methodColor(request.method, theme)}
                          style={{ width: 7, flexShrink: 0 }}
                          wrapMode="none"
                        >
                          {request.method.padEnd(7)}
                        </text>
                        <text
                          fg={matched ? theme.text : theme.textMuted}
                          style={{ width: nameWidth, flexShrink: 0 }}
                          wrapMode="none"
                        >
                          {truncateToWidth(request.name, nameWidth, false)}
                        </text>
                        {requestTagColumnWidth > 0 ? (
                          <text
                            fg={theme.textMuted}
                            style={{
                              width: requestTagColumnWidth,
                              flexShrink: 0,
                            }}
                            wrapMode="none"
                          >
                            {tagsLabel
                              ? ` ${truncateToWidth(
                                  tagsLabel,
                                  requestTagColumnWidth,
                                  false,
                                )}`
                              : ""}
                          </text>
                        ) : null}
                        {filteredColumnWidth > 0 ? (
                          <text
                            fg={theme.textMuted}
                            style={{
                              width: filteredColumnWidth,
                              flexShrink: 0,
                            }}
                            wrapMode="none"
                          >
                            {filteredLabel ? ` ${filteredLabel}` : ""}
                          </text>
                        ) : null}
                      </box>
                    )
                  })}
                </box>
              </scrollbox>
            ) : (
              <scrollbox
                ref={detailScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <box style={{ flexDirection: "column", gap: 0 }}>
                  {runner.result ? (
                    <>
                      <text
                        fg={runner.result.failed ? theme.error : theme.success}
                      >
                        {`${runner.result.summary.requestSuccesses} passed · ${runner.result.summary.requestFailures} failed · ${runner.result.summary.executed}/${runner.result.summary.selected} executed · ${runner.result.summary.skipped} skipped`}
                      </text>
                      <text fg={theme.textMuted}>
                        {`Assertions ${runner.result.summary.assertionPasses} passed, ${runner.result.summary.assertionFailures} failed · Capture failures ${runner.result.summary.captureFailures} · ${runner.result.summary.durationMs}ms`}
                      </text>
                      {runner.result.summary.failureCategories.length > 0 ? (
                        <text fg={theme.warning}>
                          {`Failure categories: ${runner.result.summary.failureCategories.join(", ")}`}
                        </text>
                      ) : null}
                      {runner.result.failure ? (
                        <text fg={theme.error}>
                          {`Configuration: ${runner.result.failure.message}`}
                        </text>
                      ) : null}
                      {(runner.result.warnings ?? []).map((warning, index) => (
                        <text key={index} fg={theme.warning}>
                          {`Warning: ${warning}`}
                        </text>
                      ))}
                    </>
                  ) : null}
                  {runner.resultRows.map((row, index) => {
                    const active = runner.resultIndex === index
                    const expanded = runner.resultExpandedId === row.id
                    const resultRequest =
                      row.kind === "result"
                        ? runner.requests.find(
                            (request) => request.id === row.id,
                          )
                        : undefined
                    const resultColor =
                      row.kind === "skipped"
                        ? theme.textMuted
                        : row.result.ok
                          ? theme.success
                          : theme.error
                    return (
                      <box key={row.id} style={{ flexDirection: "column" }}>
                        <CookieRow
                          id={`runner-result-${index}`}
                          kindLabel={
                            row.kind === "skipped"
                              ? "SKIPPED"
                              : row.result.ok
                                ? "PASS"
                                : "FAIL"
                          }
                          kindColor={resultColor}
                          name={row.id}
                          value={` ${resultRowValue(row)}`}
                          nameWidth={resultNameWidth}
                          selected={active}
                          expanded={expanded}
                          hovered={false}
                          valueColor={
                            row.kind === "skipped"
                              ? theme.textMuted
                              : row.result.response
                                ? statusColor(row.result.response.status, theme)
                                : theme.error
                          }
                          details={resultDetails(row)}
                          onSelect={() => runner.setResultIndex(index)}
                          onToggleExpanded={() =>
                            runner.toggleResultExpanded(index)
                          }
                          onHover={() => {}}
                          onPaneFocus={() => onPaneFocus("runner-requests")}
                        />
                        {expanded && row.kind === "result" ? (
                          <box
                            style={{
                              flexDirection: "column",
                              gap: 1,
                              paddingLeft: COOKIE_CHEVRON_WIDTH + 1,
                            }}
                          >
                            <ResponseResults
                              execution={row.result}
                              request={resultRequest}
                              captureLifetimeNote="Available to later requests in this collection run."
                              scrollRef={detailScrollRef}
                              focused={active}
                              onPaneFocus={() => onPaneFocus("runner-requests")}
                            />
                            <box style={{ flexDirection: "row", gap: 2 }}>
                              <text
                                fg={theme.primary}
                                onMouseDown={(event) => {
                                  if (event.button !== MouseButton.LEFT) return
                                  onEditRequestTab(row.id, "assertions")
                                  event.stopPropagation()
                                }}
                              >
                                [a] Edit Assert
                              </text>
                              <text
                                fg={theme.primary}
                                onMouseDown={(event) => {
                                  if (event.button !== MouseButton.LEFT) return
                                  onEditRequestTab(row.id, "captures")
                                  event.stopPropagation()
                                }}
                              >
                                [c] Edit Capture
                              </text>
                            </box>
                          </box>
                        ) : null}
                      </box>
                    )
                  })}
                </box>
              </scrollbox>
            )}
          </Tabs>
        </Frame>
      </box>
    </box>
  )
}
