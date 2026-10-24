import { describe, expect, it } from "bun:test"
import {
  boundedExecutionResults,
  byteSize,
  INLINE_BODY_LIMIT,
} from "../../src/executionBounds"
import { formatScriptRequestSummary } from "../../src/scriptRequests"

describe("bounded execution diagnostics", () => {
  it("preserves cancelled child requests in retained diagnostics", () => {
    const bounded = boundedExecutionResults({
      scripts: {
        evaluated: true,
        results: [
          {
            phase: "pre",
            scope: "request",
            sourceKind: "inline",
            success: false,
            durationMs: 1,
            logs: [],
            requests: [
              {
                kind: "saved",
                requestId: "child",
                depth: 1,
                method: "GET",
                url: "https://example.com",
                success: false,
                cancelled: true,
                durationMs: 1,
                failureCategories: [],
              },
            ],
          },
        ],
      },
    })
    const child = bounded.scripts!.results[0]!.requests![0]!
    expect(child.cancelled).toBe(true)
    expect(formatScriptRequestSummary(child)).toContain("CANCELLED")
  })

  it("bounds assertion expressions and messages by UTF-8 bytes", () => {
    const large = "😀".repeat(INLINE_BODY_LIMIT / 2)
    const bounded = boundedExecutionResults({
      assertions: {
        evaluated: true,
        results: [
          {
            expression: large,
            operator: "exists",
            passed: false,
            message: `Invalid expression: ${large}`,
          },
          {
            expression: "status",
            operator: "exists",
            passed: true,
            message: "Exists",
          },
        ],
      },
    })
    const [largeResult, ordinary] = bounded.assertions!.results
    expect(byteSize(largeResult!.expression)).toBeLessThanOrEqual(
      INLINE_BODY_LIMIT,
    )
    expect(byteSize(largeResult!.message)).toBeLessThanOrEqual(
      INLINE_BODY_LIMIT,
    )
    expect(largeResult!.passed).toBe(false)
    expect(ordinary).toEqual({
      expression: "status",
      operator: "exists",
      passed: true,
      message: "Exists",
    })
  })
})
