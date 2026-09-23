import { useEffect, useState, type RefObject } from "react"
import { stringWidth } from "bun"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import type { JsonValue, Request } from "../schema"
import {
  testsSucceeded,
  type ResponseExecutionResults,
} from "../executionResults"
import { scriptExecutionSucceeded } from "../preRequestScript"
import { scriptSourceLabel } from "../scriptInheritance"
import { formatScriptRequestSummary } from "../scriptRequests"
import { CookieRow, cookieNameWidth } from "./CookieRow"
import { useTheme } from "./theme"

function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return "—"
  if (typeof value === "string") return value
  return typeof value === "object" && value !== null
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value)
}

export function ResponseResults({
  execution,
  request,
  showCaptures = true,
  captureLifetimeNote,
  scrollRef,
  focused = true,
  allowOverlayNavigation = false,
  onPaneFocus,
}: {
  execution?: ResponseExecutionResults
  request?: Pick<Request, "scripts" | "tests" | "assertions" | "captures">
  showCaptures?: boolean
  captureLifetimeNote?: string
  scrollRef?: RefObject<ScrollBoxRenderable | null>
  focused?: boolean
  allowOverlayNavigation?: boolean
  onPaneFocus?: () => void
}) {
  const theme = useTheme()
  const keymap = useKeymap()
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [selectedRowIdx, setSelectedRowIdx] = useState(0)
  const tests = execution?.tests
  const testResults = tests?.evaluated ? tests.results : []
  const testErrors = tests?.errors ?? (tests?.error ? [tests.error] : [])
  const hasTestErrors = testErrors.length > 0
  const scripts = execution?.scripts
  const assertions = execution?.assertions
  const captures = execution?.captures
  const scriptResults = scripts?.evaluated ? scripts.results : []
  const assertionResults = assertions?.evaluated ? assertions.results : []
  const captureResults = captures?.evaluated ? captures.results : []
  const testRowOffset =
    scriptResults.length +
    assertionResults.length +
    (showCaptures ? captureResults.length : 0)
  const rowIds = [
    ...(scripts?.evaluated
      ? scriptResults.map((_, index) => `response-script-${index}`)
      : []),
    ...(assertions?.evaluated
      ? assertionResults.map((_, index) => `response-assertion-${index}`)
      : []),
    ...(showCaptures && captures?.evaluated
      ? captureResults.map((_, index) => `response-capture-${index}`)
      : []),
    ...(tests?.evaluated
      ? [
          "response-test-script",
          ...testResults.map((_, index) => `response-test-${index}`),
        ]
      : []),
  ]
  const rowKey = [
    ...scriptResults.map(
      (result) =>
        `script:${JSON.stringify(result.source)}:${result.phase}:${scriptExecutionSucceeded(result)}:${result.durationMs}:${JSON.stringify(result.persistence ?? [])}:${JSON.stringify(result.requests ?? [])}`,
    ),
    ...assertionResults.map((result) => `assertion:${result.expression}`),
    ...(showCaptures
      ? captureResults.map((result) => `capture:${result.variable}`)
      : []),
    ...(tests ? [JSON.stringify(tests)] : []),
  ].join("\0")
  const selectedRowId = rowIds[selectedRowIdx]

  useEffect(() => {
    setSelectedRowIdx(0)
    setExpandedRow(null)
    setHoveredRow(null)
  }, [rowKey])

  useEffect(() => {
    if (!focused || !selectedRowId) return
    scrollRef?.current?.scrollChildIntoView(selectedRowId)
  }, [expandedRow, focused, scrollRef, selectedRowId])

  useEffect(() => {
    return keymap.intercept(
      "key",
      ({ event }) => {
        if (keymap.getData("app.overlay") !== "none" && !allowOverlayNavigation)
          return
        if (!focused || rowIds.length === 0) return
        if (event.name === "up" || event.name === "down") {
          event.preventDefault()
          event.stopPropagation()
          setSelectedRowIdx((prev) =>
            event.name === "up"
              ? prev <= 0
                ? rowIds.length - 1
                : prev - 1
              : prev >= rowIds.length - 1
                ? 0
                : prev + 1,
          )
        } else if (event.name === "return") {
          event.preventDefault()
          event.stopPropagation()
          if (!selectedRowId) return
          setExpandedRow((prev) =>
            prev === selectedRowId ? null : selectedRowId,
          )
        } else if (event.name === "pagedown") {
          event.preventDefault()
          event.stopPropagation()
          scrollRef?.current?.scrollBy(1, "viewport")
        } else if (event.name === "pageup") {
          event.preventDefault()
          event.stopPropagation()
          scrollRef?.current?.scrollBy(-1, "viewport")
        } else if (event.name === "home") {
          event.preventDefault()
          event.stopPropagation()
          setSelectedRowIdx(0)
          scrollRef?.current?.scrollTo(0)
        } else if (event.name === "end") {
          event.preventDefault()
          event.stopPropagation()
          setSelectedRowIdx(rowIds.length - 1)
          const scroll = scrollRef?.current
          scroll?.scrollTo(Math.max(0, scroll.scrollHeight - scroll.height))
        }
      },
      { priority: 110 },
    )
  }, [
    allowOverlayNavigation,
    focused,
    keymap,
    rowIds.length,
    scrollRef,
    selectedRowId,
  ])
  const assertionNameWidth = Math.max(
    9,
    ...assertionResults.map((result) => result.expression.length + 1),
  )
  const assertionOperatorWidth =
    Math.max(0, ...assertionResults.map((result) => result.operator.length)) + 1
  const captureNameWidth = cookieNameWidth(
    captureResults.map((result) => ({ name: result.variable })),
  )
  const testNameWidth = Math.max(
    1,
    ...testResults.map(
      (result) =>
        stringWidth(
          result.source
            ? `[${result.source.scope}] ${result.name}`
            : result.name,
        ) + 1,
    ),
  )
  const testDurationWidth =
    Math.max(
      0,
      ...testResults.map((result) => `${result.durationMs}ms`.length),
    ) + 1
  const assertionPassed =
    assertions?.results.filter((result) => result.passed).length ?? 0
  const capturePassed =
    captures?.results.filter((result) => result.success).length ?? 0
  const activeAssertions = (request?.assertions ?? []).filter(
    (assertion) => assertion.enabled !== false,
  )
  const activeCaptures = Object.entries(request?.captures ?? {}).filter(
    ([, capture]) => capture.enabled,
  )
  const hasTests = Boolean(tests || request?.tests !== undefined)
  const hasScripts = Boolean(scripts || request?.scripts)
  const hasAssertions = Boolean(assertions || activeAssertions.length)
  const hasCaptures = Boolean(
    showCaptures && (captures || activeCaptures.length > 0),
  )

  if (!hasScripts && !hasAssertions && !hasCaptures && !hasTests) {
    return <text fg={theme.textMuted}>No execution results.</text>
  }

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      {hasScripts ? (
        <box style={{ flexDirection: "column" }}>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Scripts
            </text>
            {scripts ? (
              <text
                fg={
                  scripts.evaluated
                    ? scripts.results.every(scriptExecutionSucceeded)
                      ? theme.success
                      : theme.error
                    : theme.warning
                }
              >
                {scripts.evaluated
                  ? scripts.results.every(scriptExecutionSucceeded)
                    ? "Passed"
                    : "Failed"
                  : "Not evaluated"}
              </text>
            ) : null}
          </box>
          {scripts?.evaluated === false ? (
            <text fg={theme.textMuted}> Request scripts</text>
          ) : scripts ? (
            <box style={{ flexDirection: "column" }}>
              {scripts.results.map((result, index) => {
                const id = `response-script-${index}`
                const logCount = `${result.logs.length} log${result.logs.length === 1 ? "" : "s"}`
                const passed = scriptExecutionSucceeded(result)
                const persistenceCount = result.persistence?.length
                return (
                  <CookieRow
                    id={id}
                    key={id}
                    kindLabel={passed ? "PASS" : "FAIL"}
                    kindColor={passed ? theme.success : theme.error}
                    name={
                      result.phase === "pre" ? "Pre-request" : "Post-response"
                    }
                    value={`${result.source ? scriptSourceLabel(result.source) + " · " : ""}${result.durationMs}ms, ${logCount}${result.requests?.length ? `, ${result.requests.length} call${result.requests.length === 1 ? "" : "s"}` : ""}${persistenceCount ? `, ${result.persistence?.some((outcome) => outcome.status === "failed") ? "persistence failed" : result.persistence?.every((outcome) => outcome.status === "transient") ? `${persistenceCount} transient` : `${persistenceCount} saved`}` : ""}`}
                    nameWidth={
                      execution?.scripts?.results.some(
                        (script) => script.phase === "post",
                      )
                        ? 14
                        : 12
                    }
                    selected={selectedRowIdx === index}
                    expanded={expandedRow === id}
                    hovered={hoveredRow === id}
                    details={[
                      { label: "Phase", value: result.phase },
                      {
                        label: "Scope",
                        value: `${result.scope}${result.source?.scopeId ? `: ${result.source.scopeId}` : ""}`,
                      },
                      { label: "Kind", value: result.sourceKind },
                      {
                        label: "Source",
                        value: result.source
                          ? scriptSourceLabel(result.source)
                          : result.sourceKind,
                      },
                      { label: "Duration", value: `${result.durationMs}ms` },
                      ...(result.requests ?? []).flatMap((request) => [
                        {
                          label: "Request",
                          value: formatScriptRequestSummary(request),
                        },
                        ...(request.requestId
                          ? [{ label: "URL", value: request.url }]
                          : []),
                        ...(request.error
                          ? [{ label: "Failure", value: request.error.message }]
                          : []),
                      ]),
                      ...(result.persistence
                        ? [
                            {
                              label: "Execution",
                              value: result.success ? "Passed" : "Failed",
                            },
                            ...result.persistence.map((outcome) => ({
                              label: "Persistence",
                              value: `${outcome.operation} ${outcome.variable} (${outcome.target}): ${outcome.status}${outcome.error ? `: ${outcome.error.message}` : ""}`,
                            })),
                          ]
                        : []),
                      ...(result.error
                        ? [
                            { label: "Error", value: result.error.name },
                            {
                              label: "Message",
                              value: result.error.message,
                            },
                            ...(result.error.line
                              ? [
                                  {
                                    label: "Location",
                                    value: `${result.source?.sourcePath ?? (result.phase === "pre" ? "pre-request.js" : "post-response.js")}:${result.error.line}${result.error.column ? `:${result.error.column}` : ""}`,
                                  },
                                ]
                              : []),
                          ]
                        : []),
                      ...result.logs.map((entry) => ({
                        label: entry.level.toUpperCase(),
                        value: entry.message,
                      })),
                    ]}
                    onSelect={() => setSelectedRowIdx(index)}
                    onToggleExpanded={() =>
                      setExpandedRow((prev) => (prev === id ? null : id))
                    }
                    onHover={(isHovered) =>
                      setHoveredRow(isHovered ? id : null)
                    }
                    onPaneFocus={onPaneFocus}
                  />
                )
              })}
            </box>
          ) : null}
        </box>
      ) : null}

      {hasAssertions ? (
        <box style={{ flexDirection: "column" }}>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Assertions
            </text>
            {assertions ? (
              <text
                fg={
                  assertions.evaluated
                    ? assertionPassed === assertions.results.length
                      ? theme.success
                      : theme.error
                    : theme.warning
                }
              >
                {assertions.evaluated
                  ? `${assertionPassed} passed · ${assertions.results.length - assertionPassed} failed`
                  : "Not evaluated"}
              </text>
            ) : null}
          </box>
          {assertions?.evaluated === false ? (
            <>
              {activeAssertions.map((assertion, index) => (
                <text key={index} fg={theme.textMuted}>
                  {`  – ${assertion.expression} ${assertion.operator}`}
                </text>
              ))}
            </>
          ) : assertions ? (
            <box style={{ flexDirection: "column" }}>
              {assertions.results.map((result, index) => {
                const id = `response-assertion-${index}`
                return (
                  <CookieRow
                    id={id}
                    key={id}
                    kindLabel={result.passed ? "PASS" : "FAIL"}
                    kindColor={result.passed ? theme.success : theme.error}
                    name={result.expression}
                    value={` ${result.operator}`}
                    valueWidth={assertionOperatorWidth}
                    nameWidth={assertionNameWidth}
                    selected={selectedRowIdx === scriptResults.length + index}
                    expanded={expandedRow === id}
                    hovered={hoveredRow === id}
                    details={[
                      ...(Object.hasOwn(result, "expected")
                        ? [
                            {
                              label: "Expected",
                              value: formatValue(result.expected),
                            },
                          ]
                        : []),
                      { label: "Actual", value: formatValue(result.actual) },
                      ...(!result.passed
                        ? [{ label: "Message", value: result.message }]
                        : []),
                    ]}
                    onSelect={() =>
                      setSelectedRowIdx(scriptResults.length + index)
                    }
                    onToggleExpanded={() =>
                      setExpandedRow((prev) => (prev === id ? null : id))
                    }
                    onHover={(isHovered) =>
                      setHoveredRow(isHovered ? id : null)
                    }
                    onPaneFocus={onPaneFocus}
                  />
                )
              })}
            </box>
          ) : null}
        </box>
      ) : null}

      {hasCaptures ? (
        <box style={{ flexDirection: "column" }}>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Captures
            </text>
            {captures ? (
              <text
                fg={
                  captures.evaluated
                    ? capturePassed === captures.results.length
                      ? theme.success
                      : theme.error
                    : theme.warning
                }
              >
                {captures.evaluated
                  ? `${capturePassed} captured · ${captures.results.length - capturePassed} failed`
                  : "Not evaluated"}
              </text>
            ) : null}
          </box>
          {captureLifetimeNote ? (
            <text fg={theme.textMuted}>{captureLifetimeNote}</text>
          ) : null}
          {captures?.evaluated === false ? (
            <>
              {activeCaptures.map(([variable, capture]) => (
                <text key={variable} fg={theme.textMuted}>
                  {`  – ${variable} ${capture.value}`}
                </text>
              ))}
            </>
          ) : captures ? (
            <box style={{ flexDirection: "column" }}>
              {captures.results.map((result, index) => {
                const id = `response-capture-${index}`
                return (
                  <CookieRow
                    id={id}
                    key={id}
                    kindLabel={result.success ? "CAPTURED" : "FAILED"}
                    kindColor={result.success ? theme.success : theme.error}
                    name={result.variable}
                    value={result.expression}
                    nameWidth={captureNameWidth}
                    selected={
                      selectedRowIdx ===
                      scriptResults.length + assertionResults.length + index
                    }
                    expanded={expandedRow === id}
                    hovered={hoveredRow === id}
                    details={
                      result.success
                        ? [
                            { label: "Type", value: result.type },
                            ...(result.persisted
                              ? [
                                  {
                                    label: "Persisted",
                                    value: result.persisted,
                                  },
                                ]
                              : []),
                            {
                              label: "Value",
                              value: formatValue(result.value),
                            },
                          ]
                        : [{ label: "Message", value: result.message }]
                    }
                    onSelect={() =>
                      setSelectedRowIdx(
                        scriptResults.length + assertionResults.length + index,
                      )
                    }
                    onToggleExpanded={() =>
                      setExpandedRow((prev) => (prev === id ? null : id))
                    }
                    onHover={(isHovered) =>
                      setHoveredRow(isHovered ? id : null)
                    }
                    onPaneFocus={onPaneFocus}
                  />
                )
              })}
            </box>
          ) : null}
        </box>
      ) : null}
      {hasTests ? (
        <box style={{ flexDirection: "column" }}>
          <box style={{ flexDirection: "row", gap: 1 }}>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>
              Scripted tests
            </text>
            {tests ? (
              <text
                fg={
                  !tests.evaluated
                    ? theme.warning
                    : testsSucceeded(tests)
                      ? theme.success
                      : theme.error
                }
              >
                {tests.evaluated
                  ? `${testResults.filter((result) => result.passed).length} passed · ${testResults.filter((result) => !result.passed).length} failed${hasTestErrors ? " · script error" : ""}`
                  : "Not evaluated"}
              </text>
            ) : null}
          </box>
          {tests?.evaluated ? (
            <>
              <CookieRow
                id="response-test-script"
                kindLabel={hasTestErrors ? "ERROR" : "LOGS"}
                kindColor={hasTestErrors ? theme.error : theme.textMuted}
                name="Test script"
                value={
                  hasTestErrors
                    ? testErrors[0]!.message
                    : `${tests.logs.length} log${tests.logs.length === 1 ? "" : "s"}`
                }
                nameWidth={12}
                selected={selectedRowIdx === testRowOffset}
                expanded={expandedRow === "response-test-script"}
                hovered={hoveredRow === "response-test-script"}
                details={[
                  ...(tests.invocations ?? []).flatMap((invocation) => [
                    { label: "Phase", value: "tests" },
                    {
                      label: "Source",
                      value: scriptSourceLabel(invocation.source),
                    },
                    { label: "Kind", value: invocation.sourceKind },
                    { label: "Duration", value: `${invocation.durationMs}ms` },
                  ]),
                  ...testErrors.flatMap((error) => [
                    ...(error.source
                      ? [
                          {
                            label: "Source",
                            value: scriptSourceLabel(error.source),
                          },
                        ]
                      : []),
                    { label: "Error", value: error.name },
                    { label: "Message", value: error.message },
                    ...(error.line
                      ? [
                          {
                            label: "Location",
                            value: `${error.source?.sourcePath ?? "tests.js"}:${error.line}${error.column ? `:${error.column}` : ""}`,
                          },
                        ]
                      : []),
                  ]),
                  ...tests.logs.map((log) => ({
                    label: log.level.toUpperCase(),
                    value: `${log.source ? scriptSourceLabel(log.source) + ": " : ""}${log.message}`,
                  })),
                ]}
                onSelect={() => setSelectedRowIdx(testRowOffset)}
                onToggleExpanded={() =>
                  setExpandedRow((prev) =>
                    prev === "response-test-script"
                      ? null
                      : "response-test-script",
                  )
                }
                onHover={(hovered) =>
                  setHoveredRow(hovered ? "response-test-script" : null)
                }
                onPaneFocus={onPaneFocus}
              />
              {testResults.map((result, index) => {
                const id = `response-test-${index}`
                return (
                  <CookieRow
                    id={id}
                    key={id}
                    kindLabel={result.passed ? "PASS" : "FAIL"}
                    kindColor={result.passed ? theme.success : theme.error}
                    name={
                      result.source
                        ? `[${result.source.scope}] ${result.name}`
                        : result.name
                    }
                    value={` ${result.durationMs}ms`}
                    valueWidth={testDurationWidth}
                    nameWidth={testNameWidth}
                    selected={selectedRowIdx === testRowOffset + index + 1}
                    expanded={expandedRow === id}
                    hovered={hoveredRow === id}
                    details={[
                      { label: "Name", value: result.name },
                      ...(result.source
                        ? [
                            {
                              label: "Source",
                              value: scriptSourceLabel(result.source),
                            },
                          ]
                        : []),
                      { label: "Message", value: result.message },
                      { label: "Duration", value: `${result.durationMs}ms` },
                    ]}
                    onSelect={() =>
                      setSelectedRowIdx(testRowOffset + index + 1)
                    }
                    onToggleExpanded={() =>
                      setExpandedRow((prev) => (prev === id ? null : id))
                    }
                    onHover={(hovered) => setHoveredRow(hovered ? id : null)}
                    onPaneFocus={onPaneFocus}
                  />
                )
              })}
            </>
          ) : null}
        </box>
      ) : null}
    </box>
  )
}
