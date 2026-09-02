import { useEffect, useState, type RefObject } from "react"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeymap } from "@opentui/keymap/react"
import type { JsonValue, Request } from "../schema"
import type { ResponseExecutionResults } from "../executionResults"
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
  request?: Pick<Request, "assertions" | "captures">
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
  const assertions = execution?.assertions
  const captures = execution?.captures
  const assertionResults = assertions?.evaluated ? assertions.results : []
  const captureResults = captures?.evaluated ? captures.results : []
  const rowIds = [
    ...(assertions?.evaluated
      ? assertionResults.map((_, index) => `response-assertion-${index}`)
      : []),
    ...(showCaptures && captures?.evaluated
      ? captureResults.map((_, index) => `response-capture-${index}`)
      : []),
  ]
  const rowKey = [
    ...assertionResults.map((result) => `assertion:${result.expression}`),
    ...(showCaptures
      ? captureResults.map((result) => `capture:${result.variable}`)
      : []),
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
  const hasAssertions = Boolean(assertions || activeAssertions.length)
  const hasCaptures = Boolean(
    showCaptures && (captures || activeCaptures.length > 0),
  )

  if (!hasAssertions && !hasCaptures) {
    return <text fg={theme.textMuted}>No execution results.</text>
  }

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
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
                    selected={selectedRowIdx === index}
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
                      selectedRowIdx === assertionResults.length + index
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
                      setSelectedRowIdx(assertionResults.length + index)
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
    </box>
  )
}
