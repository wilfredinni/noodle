import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"
import {
  fg,
  MouseButton,
  t,
  TextAttributes,
  type BoxRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { stringWidth } from "bun"
import { useTerminalDimensions } from "@opentui/react"
import type { Focus } from "./focus"
import type {
  RunnerResultRow,
  UseCollectionRunnerResult,
} from "../hooks/useCollectionRunner"
import { RUNNER_RUN_OPTION_INDEX } from "../hooks/useCollectionRunner"
import type { CollectionItem, Request } from "../schema"
import { useTheme } from "./theme"
import { Frame } from "./Frame"
import { FullBorder } from "./borders"
import { Tabs } from "./Tabs"
import { Checkbox } from "./Checkbox"
import { Select } from "./Select"
import { COOKIE_CHEVRON_WIDTH, CookieRow } from "./CookieRow"
import { methodColor } from "./formatRequest"
import { statusColor, truncateToWidth } from "./format"
import { flattenRequests } from "./tree"
import { ActionButton } from "./ActionButton"
import { Badge } from "./Badge"
import { SettingsField } from "./settings/SettingsField"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const OPTION_LABELS = [
  "Environment",
  "Include tags",
  "Exclude tags",
  "Fail fast",
] as const

const OPTION_DESCRIPTIONS = [
  "Select the environment used for this run.",
  "Only run requests with every included tag.",
  "Skip requests with any excluded tag.",
  "Stop running after the first failed request.",
] as const

function resultStatusLabel(row: RunnerResultRow): string {
  if (row.kind === "skipped") return "Skipped"
  if (!row.result.response) return "error"
  return `${row.result.response.status} ${row.result.response.statusText}`
}

function resultKindLabel(row: RunnerResultRow): string {
  if (row.kind === "skipped") return "SKIPPED"
  return row.result.ok ? "PASS" : "FAIL"
}

function resultMethodLabel(row: RunnerResultRow): string {
  return row.kind === "result" ? row.result.method : ""
}

function resultTimingLabel(row: RunnerResultRow): string {
  if (row.kind === "skipped" || !row.result.response) return ""
  return `${Math.round(row.result.response.timeMs)}ms`
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
  onEditTagFilter,
  onOpenResultDetail,
}: {
  runner: UseCollectionRunnerResult
  focus: Focus
  hasUnsavedChanges: boolean
  detailScrollRef: RefObject<ScrollBoxRenderable | null>
  onPaneFocus: (focus: Focus) => void
  onEditTagFilter: (filter: "include" | "exclude", index: number) => void
  onOpenResultDetail: (index: number) => void
}) {
  const theme = useTheme()
  const { width = 100 } = useTerminalDimensions()
  const stacked = width < 100
  const optionScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const requestScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const splitContainerRef = useRef<BoxRenderable | null>(null)
  const resizingSplitRef = useRef(false)
  const splitDraggedRef = useRef(false)
  const lastSplitClickRef = useRef<(ResizeClick & { stacked: boolean }) | null>(
    null,
  )
  const previousPhaseRef = useRef<typeof runner.phase | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [spinnerIndex, setSpinnerIndex] = useState(0)

  useEffect(() => {
    if (runner.phase !== "running") return
    const id = setInterval(() => {
      setSpinnerIndex((index) => (index + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(id)
  }, [runner.phase])

  useEffect(() => {
    optionScrollRef.current?.scrollChildIntoView(
      runner.optionIndex === RUNNER_RUN_OPTION_INDEX
        ? "runner-run-button"
        : `runner-option-${runner.optionIndex}`,
    )
  }, [runner.optionIndex])
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
  const requestNamePreferredWidth = Math.max(
    0,
    ...runnerRows.flatMap((row) =>
      row.kind === "request"
        ? [stringWidth(row.request.name) + row.depth * 2]
        : [],
    ),
  )
  const filteredColumnWidth = runner.requests.some(
    (request) =>
      runner.selectedIds.has(request.id) && !runner.matchedIds.has(request.id),
  )
    ? stringWidth(" filtered")
    : 0
  const requestColumnsWidth = Math.max(
    0,
    requestBaseLabelWidth - filteredColumnWidth,
  )
  const requestLabelWidth = Math.min(
    requestNamePreferredWidth,
    requestColumnsWidth,
  )
  const requestTagColumnWidth = Math.min(
    Math.max(
      0,
      ...requestTagLabels.map((label) =>
        label ? stringWidth(` ${label}`) : 0,
      ),
    ),
    Math.max(0, requestColumnsWidth - requestLabelWidth),
  )
  const resultKindWidth =
    Math.max(
      0,
      ...runner.resultRows.map((row) => stringWidth(resultKindLabel(row))),
    ) + 1
  const resultMethodWidth =
    Math.max(
      0,
      ...runner.resultRows.map((row) => stringWidth(resultMethodLabel(row))),
    ) + 1
  const resultStatusWidth = Math.max(
    0,
    ...runner.resultRows.map((row) => stringWidth(resultStatusLabel(row))),
  )
  const resultTimingWidth = Math.max(
    0,
    ...runner.resultRows.map((row) => stringWidth(resultTimingLabel(row))),
  )
  const resultTimingColumnWidth =
    resultTimingWidth > 0 ? resultTimingWidth + 1 : 0
  const resultNameAvailable = Math.max(
    0,
    requestContentWidth -
      COOKIE_CHEVRON_WIDTH -
      2 -
      resultKindWidth -
      resultMethodWidth,
  )
  const resultValueWidth = Math.min(resultNameAvailable, resultStatusWidth + 1)
  const resultPreferredNameWidth = Math.max(
    0,
    ...runner.resultRows.map((row) => stringWidth(row.id)),
  )
  const resultNameWidth = Math.min(
    resultPreferredNameWidth,
    Math.max(
      0,
      resultNameAvailable - resultValueWidth - resultTimingColumnWidth,
    ),
  )
  const maximumRequestCount = runner.requests.length
  const runButtonMinWidth =
    Math.max(
      stringWidth("r Run 0 requests"),
      stringWidth(
        `r Run ${maximumRequestCount} request${maximumRequestCount === 1 ? "" : "s"}`,
      ),
      stringWidth(
        `${SPINNER_FRAMES[0]} Running ${maximumRequestCount}/${maximumRequestCount}`,
      ),
    ) + 2
  const running = runner.phase === "running"
  const runFocused =
    focus === "runner-options" && runner.optionIndex === RUNNER_RUN_OPTION_INDEX
  const currentRequest = Math.min(
    runner.progress.completed + 1,
    runner.progress.total,
  )
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
  const configurationLocked = runner.phase === "running" || runner.selectOpen

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
    const previousPhase = previousPhaseRef.current
    previousPhaseRef.current = runner.phase
    if (runner.phase === "results" && previousPhase !== "results") {
      if (focus !== "runner-requests") onPaneFocus("runner-requests")
      return
    }
    if (focus !== "runner-options" && focus !== "runner-requests")
      onPaneFocus(
        runner.phase === "results" ? "runner-requests" : "runner-options",
      )
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
              <box style={{ flexDirection: "column" }}>
                <text fg={theme.text}>{`Scope: ${runner.scopeLabel}`}</text>
                <text fg={theme.textMuted} wrapMode="word">
                  Run every request in the collection or selected folder.
                </text>
              </box>
              {OPTION_LABELS.map((label, index) => {
                const active =
                  focus === "runner-options" && runner.optionIndex === index
                return (
                  <SettingsField
                    key={label}
                    id={`runner-option-${index}`}
                    title={label}
                    description={OPTION_DESCRIPTIONS[index]}
                    active={active}
                    alignItems={
                      index === 1 || index === 2 ? "flex-start" : "center"
                    }
                    onMouseDown={() => {
                      if (configurationLocked) return
                      onPaneFocus("runner-options")
                      runner.setOptionIndex(index)
                      if (index === 3) runner.toggleFailFast()
                    }}
                  >
                    {index === 0 ? (
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
                        interactive={runner.phase !== "running"}
                        onActivate={() => runner.setOptionIndex(0)}
                        onOpenChange={runner.setSelectOpen}
                        onChange={(name) =>
                          runner.setEnvironmentName(name || null)
                        }
                        fitContent
                      />
                    ) : index === 1 || index === 2 ? (
                      <box
                        id={
                          index === 1
                            ? "runner-include-tag-value"
                            : "runner-exclude-tag-value"
                        }
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 0,
                          flexGrow: 1,
                          minWidth: 0,
                        }}
                      >
                        {[
                          ...(index === 1
                            ? runner.includeTags
                            : runner.excludeTags),
                          null,
                        ].map((tag, tagIndex) => {
                          const filter = index === 1 ? "include" : "exclude"
                          const tagActive =
                            active &&
                            tagIndex ===
                              (index === 1
                                ? runner.includeTagIndex
                                : runner.excludeTagIndex)
                          return (
                            <box
                              key={`${filter}-${tag ?? "add"}-${tagIndex}`}
                              id={`runner-${filter}-tag-${tagIndex}`}
                              style={{
                                flexDirection: "column",
                                minHeight: 1,
                                marginRight: 1,
                              }}
                              onMouseDown={(event) => {
                                if (
                                  event.button !== MouseButton.LEFT ||
                                  configurationLocked
                                )
                                  return
                                onPaneFocus("runner-options")
                                runner.setOptionIndex(index)
                                runner.setTagFilterIndex(filter, tagIndex)
                                onEditTagFilter(filter, tagIndex)
                                event.stopPropagation()
                              }}
                            >
                              <Badge
                                bg={
                                  tagActive
                                    ? theme.primary
                                    : theme.backgroundElement
                                }
                                fg={
                                  tagActive
                                    ? theme.backgroundPanel
                                    : theme.textMuted
                                }
                              >
                                {tag === null ? "+ Add tag" : `#${tag}`}
                              </Badge>
                            </box>
                          )
                        })}
                      </box>
                    ) : (
                      <Checkbox checked={runner.failFast} theme={theme} />
                    )}
                  </SettingsField>
                )
              })}
              <ActionButton
                id="runner-run-button"
                shortcut={running ? SPINNER_FRAMES[spinnerIndex] : "r"}
                minWidth={runButtonMinWidth}
                focused={runFocused}
                highlightWhenDisabled
                label={
                  running
                    ? `Running ${currentRequest}/${runner.progress.total}`
                    : `Run ${runner.matchedIds.size} request${runner.matchedIds.size === 1 ? "" : "s"}`
                }
                disabled={!runner.runAvailable && !running}
                onAction={() => {
                  if (running) return
                  runner.setOptionIndex(RUNNER_RUN_OPTION_INDEX)
                  onPaneFocus("runner-options")
                  void runner.run()
                }}
              />
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
                              ? truncateToWidth(
                                  ` ${tagsLabel}`,
                                  requestTagColumnWidth,
                                  false,
                                )
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
                      <box style={{ flexDirection: "row" }}>
                        <text
                          fg={
                            runner.result.failed ? theme.error : theme.success
                          }
                          attributes={TextAttributes.BOLD}
                        >
                          {runner.result.failed ? "FAIL" : "PASS"}
                        </text>
                        <text fg={theme.text}>
                          {`  ${runner.result.summary.requestSuccesses}/${runner.result.summary.executed} request${runner.result.summary.executed === 1 ? "" : "s"} · ${runner.result.summary.durationMs}ms`}
                        </text>
                      </box>
                      <text
                        content={t`${fg(theme.textMuted)(`${runner.result.summary.assertionPasses} assertion${runner.result.summary.assertionPasses === 1 ? "" : "s"} passed`)}${fg(theme.error)(runner.result.summary.assertionFailures > 0 ? ` · ${runner.result.summary.assertionFailures} failed` : "")}${fg(runner.result.summary.captureFailures > 0 ? theme.error : theme.textMuted)(runner.result.summary.captureFailures > 0 ? ` · ${runner.result.summary.captureFailures} capture failure${runner.result.summary.captureFailures === 1 ? "" : "s"}` : " · no capture failures")}${fg(theme.warning)(runner.result.summary.skipped > 0 ? ` · ${runner.result.summary.skipped} skipped` : "")}`}
                        style={{ marginBottom: 1 }}
                      />
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
                    const timing = resultTimingLabel(row)
                    const canOpen =
                      row.kind === "result" && runner.resultDetails.has(row.id)
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
                          kindLabel={resultKindLabel(row)}
                          kindColor={resultColor}
                          kindWidth={resultKindWidth}
                          method={{
                            label: resultMethodLabel(row),
                            color:
                              row.kind === "result"
                                ? methodColor(row.result.method, theme)
                                : theme.textMuted,
                            width: resultMethodWidth,
                          }}
                          name={row.id}
                          value={` ${resultStatusLabel(row)}`}
                          trailingValue={
                            timing
                              ? {
                                  label: timing,
                                  width: resultTimingColumnWidth,
                                }
                              : undefined
                          }
                          nameWidth={resultNameWidth}
                          selected={active}
                          expanded={false}
                          hovered={false}
                          valueColor={
                            row.kind === "skipped"
                              ? theme.textMuted
                              : row.result.response
                                ? statusColor(row.result.response.status, theme)
                                : theme.error
                          }
                          onSelect={() => runner.setResultIndex(index)}
                          onActivate={
                            canOpen
                              ? () => onOpenResultDetail(index)
                              : undefined
                          }
                          onHover={() => {}}
                          onPaneFocus={() => onPaneFocus("runner-requests")}
                        />
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
