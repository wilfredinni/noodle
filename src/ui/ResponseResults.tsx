import { TextAttributes } from "@opentui/core"
import type { JsonValue, Request } from "../schema"
import type { ResponseExecutionResults } from "../executionResults"
import { useTheme } from "./theme"

function formatValue(value: JsonValue | undefined): string {
  if (value === undefined) return "—"
  return typeof value === "string" ? value : JSON.stringify(value)
}

export function ResponseResults({
  execution,
  request,
  showCaptures = true,
  captureLifetimeNote,
}: {
  execution?: ResponseExecutionResults
  request?: Pick<Request, "assertions" | "captures">
  showCaptures?: boolean
  captureLifetimeNote?: string
}) {
  const theme = useTheme()
  const assertions = execution?.assertions
  const captures = execution?.captures
  const assertionPassed =
    assertions?.results.filter((result) => result.passed).length ?? 0
  const capturePassed =
    captures?.results.filter((result) => result.success).length ?? 0
  const hasAssertions = Boolean(assertions || request?.assertions?.length)
  const hasCaptures = Boolean(
    showCaptures &&
    (captures || Object.keys(request?.captures ?? {}).length > 0),
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
              {(request?.assertions ?? []).map((assertion, index) => (
                <text key={index} fg={theme.textMuted}>
                  {`  – ${assertion.expression} ${assertion.operator}`}
                </text>
              ))}
            </>
          ) : assertions ? (
            <>
              {assertions.results.map((result, index) => (
                <box key={index} style={{ flexDirection: "column" }}>
                  <text fg={result.passed ? theme.success : theme.error}>
                    {`${result.passed ? "✓" : "✗"} ${result.expression} ${result.operator}`}
                  </text>
                  {Object.hasOwn(result, "expected") ? (
                    <text fg={theme.textMuted}>
                      {`  expected: ${formatValue(result.expected)}`}
                    </text>
                  ) : null}
                  <text fg={theme.textMuted}>
                    {`  actual: ${formatValue(result.actual)}`}
                  </text>
                  {!result.passed ? (
                    <text fg={theme.error}>{`  ${result.message}`}</text>
                  ) : null}
                </box>
              ))}
            </>
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
              {Object.entries(request?.captures ?? {}).map(
                ([variable, expression]) => (
                  <text key={variable} fg={theme.textMuted}>
                    {`  – ${variable} ← ${expression}`}
                  </text>
                ),
              )}
            </>
          ) : captures ? (
            <>
              {captures.results.map((result, index) => (
                <box key={index} style={{ flexDirection: "column" }}>
                  <text fg={result.success ? theme.success : theme.error}>
                    {`${result.success ? "✓" : "✗"} ${result.variable} ← ${result.expression}`}
                  </text>
                  <text fg={theme.textMuted}>
                    {result.success
                      ? `  ${result.type}: ${formatValue(result.value)}`
                      : `  ${result.message}`}
                  </text>
                </box>
              ))}
            </>
          ) : null}
        </box>
      ) : null}
    </box>
  )
}
