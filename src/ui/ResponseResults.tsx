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
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Assertions
          </text>
          {assertions?.evaluated === false ? (
            <>
              <text fg={theme.warning}>Not evaluated</text>
              {(request?.assertions ?? []).map((assertion, index) => (
                <text key={index} fg={theme.textMuted}>
                  {`  – ${assertion.expression} ${assertion.operator}`}
                </text>
              ))}
            </>
          ) : assertions ? (
            <>
              <text
                fg={
                  assertionPassed === assertions.results.length
                    ? theme.success
                    : theme.error
                }
              >
                {`${assertionPassed} passed · ${assertions.results.length - assertionPassed} failed`}
              </text>
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
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Captures
          </text>
          {captureLifetimeNote ? (
            <text fg={theme.textMuted}>{captureLifetimeNote}</text>
          ) : null}
          {captures?.evaluated === false ? (
            <>
              <text fg={theme.warning}>Not evaluated</text>
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
              <text
                fg={
                  capturePassed === captures.results.length
                    ? theme.success
                    : theme.error
                }
              >
                {`${capturePassed} captured · ${captures.results.length - capturePassed} failed`}
              </text>
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
