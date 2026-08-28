import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react"
import {
  MouseButton,
  TextAttributes,
  type InputRenderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Focus } from "./focus"
import type { FieldKind } from "./editMode"
import type {
  RunnerResultRow,
  UseCollectionRunnerResult,
} from "../hooks/useCollectionRunner"
import { useTheme } from "./theme"
import { Frame } from "./Frame"
import { FullBorder } from "./borders"
import { Tabs, type TabDef } from "./Tabs"
import { Checkbox } from "./Checkbox"
import { Select } from "./Select"
import { ResponseResults } from "./ResponseResults"
import { statusColor } from "./format"

const OPTION_LABELS = [
  "Scope",
  "Environment",
  "Include tag",
  "Exclude tag",
  "Fail fast",
  "Run",
] as const

function resultLabel(row: RunnerResultRow): string {
  if (row.kind === "skipped") return `- ${row.id}  skipped`
  const status = row.result.response
    ? `${row.result.response.status} ${row.result.response.statusText}`
    : "error"
  return `${row.result.ok ? "✓" : "✗"} ${row.id}  ${status}`
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
  const resultScrollRef = useRef<ScrollBoxRenderable | null>(null)
  const activeResult = runner.resultRows[runner.resultIndex]
  const activeRequest = activeResult
    ? runner.requests.find((request) => request.id === activeResult.id)
    : undefined
  const tabs = useMemo<TabDef[]>(
    () => [
      { id: "configure", label: "Configure" },
      ...(runner.result ? [{ id: "results", label: "Results" }] : []),
    ],
    [runner.result],
  )

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
      `runner-request-${runner.requestIndex}`,
    )
  }, [runner.requestIndex])
  useEffect(() => {
    resultScrollRef.current?.scrollChildIntoView(
      `runner-result-${runner.resultIndex}`,
    )
    detailScrollRef.current?.scrollTo(0)
  }, [runner.resultIndex])

  const paneDirection = stacked ? "column" : "row"
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
  const activePage = runner.phase === "results" ? "results" : "configure"
  const configurationLocked =
    runner.phase === "running" ||
    runner.editingOption !== null ||
    runner.selectOpen

  useLayoutEffect(() => {
    if (
      activePage === "results" &&
      focus !== "runner-results" &&
      focus !== "runner-detail"
    ) {
      onPaneFocus("runner-results")
    } else if (
      activePage === "configure" &&
      focus !== "runner-options" &&
      focus !== "runner-requests"
    ) {
      onPaneFocus("runner-options")
    }
  }, [activePage, focus, onPaneFocus])

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
      <Tabs
        tabs={tabs}
        activeId={activePage}
        onChange={(id) => {
          if (configurationLocked) return
          if (id === "results") runner.showResults()
          else runner.showConfigure()
        }}
      >
        {activePage === "configure" ? (
          <box
            style={{
              flexDirection: paneDirection,
              flexGrow: 1,
              minHeight: 0,
              gap: 1,
            }}
          >
            <Frame
              title="Options"
              border={[...FullBorder.border]}
              customBorderChars={FullBorder.customBorderChars}
              borderColor={
                focus === "runner-options" ? theme.primary : theme.borderSubtle
              }
              style={paneStyle}
              onPaneFocus={() => onPaneFocus("runner-options")}
            >
              <scrollbox
                ref={optionScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <box style={{ flexDirection: "column", gap: 1 }}>
                  {OPTION_LABELS.map((label, index) => {
                    const active =
                      focus === "runner-options" && runner.optionIndex === index
                    const backgroundColor = active
                      ? theme.backgroundElement
                      : undefined
                    return (
                      <box
                        key={label}
                        id={`runner-option-${index}`}
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
                          else if (index === 3)
                            runner.beginOptionEdit("exclude")
                          else if (index === 4) runner.toggleFailFast()
                          else if (index === 5) void runner.run()
                          event.stopPropagation()
                        }}
                      >
                        {index === 0 ? (
                          <>
                            <text fg={theme.textMuted}>{label}</text>
                            <text fg={theme.text}>{runner.scopeLabel}</text>
                          </>
                        ) : index === 1 ? (
                          <box style={{ flexDirection: "row", gap: 1 }}>
                            <text fg={theme.textMuted}>{`${label}:`}</text>
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
                            <text fg={theme.textMuted}>{`${label}:`}</text>
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
                            <text fg={theme.textMuted}>{`${label}:`}</text>
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
            <Frame
              title={`Requests · ${runner.matchedIds.size} matched`}
              border={[...FullBorder.border]}
              customBorderChars={FullBorder.customBorderChars}
              borderColor={
                focus === "runner-requests" ? theme.primary : theme.borderSubtle
              }
              style={paneStyle}
              onPaneFocus={() => onPaneFocus("runner-requests")}
            >
              <scrollbox
                ref={requestScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <box style={{ flexDirection: "column" }}>
                  {runner.requests.map((request, index) => {
                    const selected = runner.selectedIds.has(request.id)
                    const matched = runner.matchedIds.has(request.id)
                    const active =
                      focus === "runner-requests" &&
                      runner.requestIndex === index
                    return (
                      <box
                        key={request.id}
                        id={`runner-request-${index}`}
                        style={{
                          flexDirection: "row",
                          gap: 1,
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
                        <Checkbox checked={selected} theme={theme} />
                        <text fg={matched ? theme.text : theme.textMuted}>
                          {request.id}
                        </text>
                        {selected && !matched ? (
                          <text fg={theme.textMuted}>filtered</text>
                        ) : null}
                      </box>
                    )
                  })}
                </box>
              </scrollbox>
            </Frame>
          </box>
        ) : (
          <box
            style={{
              flexDirection: paneDirection,
              flexGrow: 1,
              minHeight: 0,
              gap: 1,
            }}
          >
            <Frame
              title="Run Results"
              border={[...FullBorder.border]}
              customBorderChars={FullBorder.customBorderChars}
              borderColor={
                focus === "runner-results" ? theme.primary : theme.borderSubtle
              }
              style={paneStyle}
              onPaneFocus={() => onPaneFocus("runner-results")}
            >
              <scrollbox
                ref={resultScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                <box style={{ flexDirection: "column", gap: 1 }}>
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
                    const active =
                      focus === "runner-results" && runner.resultIndex === index
                    return (
                      <box
                        key={row.id}
                        id={`runner-result-${index}`}
                        style={{
                          backgroundColor: active
                            ? theme.backgroundElement
                            : undefined,
                        }}
                        onMouseDown={(event) => {
                          if (event.button !== MouseButton.LEFT) return
                          onPaneFocus("runner-results")
                          runner.setResultIndex(index)
                          event.stopPropagation()
                        }}
                      >
                        <text
                          fg={
                            row.kind === "skipped"
                              ? theme.textMuted
                              : row.result.ok
                                ? theme.success
                                : theme.error
                          }
                        >
                          {resultLabel(row)}
                        </text>
                      </box>
                    )
                  })}
                </box>
              </scrollbox>
            </Frame>
            <Frame
              title="Request Detail"
              border={[...FullBorder.border]}
              customBorderChars={FullBorder.customBorderChars}
              borderColor={
                focus === "runner-detail" ? theme.primary : theme.borderSubtle
              }
              style={paneStyle}
              onPaneFocus={() => onPaneFocus("runner-detail")}
            >
              <scrollbox
                ref={detailScrollRef}
                scrollY
                style={{ flexGrow: 1, minHeight: 0 }}
              >
                {!activeResult ? (
                  <text fg={theme.textMuted}>No request result.</text>
                ) : activeResult.kind === "skipped" ? (
                  <box style={{ flexDirection: "column", gap: 1 }}>
                    <text fg={theme.text}>{activeResult.id}</text>
                    <text fg={theme.textMuted}>Skipped by fail-fast.</text>
                  </box>
                ) : (
                  <box style={{ flexDirection: "column", gap: 1 }}>
                    <text fg={theme.text} attributes={TextAttributes.BOLD}>
                      {`${activeResult.result.method} ${activeResult.id}`}
                    </text>
                    <text fg={theme.textMuted}>{activeResult.result.url}</text>
                    {activeResult.result.response ? (
                      <>
                        <text
                          fg={statusColor(
                            activeResult.result.response.status,
                            theme,
                          )}
                        >
                          {`${activeResult.result.response.status} ${activeResult.result.response.statusText} · ${Math.round(activeResult.result.response.timeMs)}ms`}
                        </text>
                        <text fg={theme.text} attributes={TextAttributes.BOLD}>
                          Headers
                        </text>
                        {Object.entries(
                          activeResult.result.response.headers,
                        ).map(([name, value]) => (
                          <text key={name} fg={theme.textMuted}>
                            {`${name}: ${value}`}
                          </text>
                        ))}
                        <text fg={theme.text} attributes={TextAttributes.BOLD}>
                          Body
                        </text>
                        <text fg={theme.textMuted}>
                          {activeResult.result.response.body || "(no body)"}
                        </text>
                      </>
                    ) : null}
                    {activeResult.result.error ? (
                      <text fg={theme.error}>{activeResult.result.error}</text>
                    ) : null}
                    {(activeResult.result.warnings ?? []).map(
                      (warning, index) => (
                        <text key={index} fg={theme.warning}>
                          {`Warning: ${warning}`}
                        </text>
                      ),
                    )}
                    <ResponseResults
                      execution={activeResult.result}
                      request={activeRequest}
                      captureLifetimeNote="Available to later requests in this collection run."
                      scrollRef={detailScrollRef}
                      focused={focus === "runner-detail"}
                      onPaneFocus={() => onPaneFocus("runner-detail")}
                    />
                  </box>
                )}
              </scrollbox>
              {activeResult ? (
                <box style={{ flexDirection: "row", gap: 2 }}>
                  <text
                    fg={theme.primary}
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onEditRequestTab(activeResult.id, "assertions")
                      event.stopPropagation()
                    }}
                  >
                    [a] Edit Assert
                  </text>
                  <text
                    fg={theme.primary}
                    onMouseDown={(event) => {
                      if (event.button !== MouseButton.LEFT) return
                      onEditRequestTab(activeResult.id, "captures")
                      event.stopPropagation()
                    }}
                  >
                    [c] Edit Capture
                  </text>
                </box>
              ) : null}
            </Frame>
          </box>
        )}
      </Tabs>
      <text fg={theme.textMuted}>
        {runner.phase === "running"
          ? "Run in progress"
          : "Tab switch pane · ←/→ switch Configure/Results · Esc close"}
      </text>
    </box>
  )
}
