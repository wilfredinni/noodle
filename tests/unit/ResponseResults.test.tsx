import { describe, expect, it } from "bun:test"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponseResults } from "../../src/ui/ResponseResults"

const testRender = createTestRender()

describe("ResponseResults", () => {
  it("renders assertion and redacted capture details at constrained widths", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <box style={{ width: 44, height: 18 }}>
          <ResponseResults
            execution={{
              assertions: {
                evaluated: true,
                results: [
                  {
                    expression: "status",
                    operator: "equals",
                    expected: 201,
                    actual: 200,
                    passed: false,
                    message: "Expected values to be equal",
                  },
                ],
              },
              captures: {
                evaluated: true,
                results: [
                  {
                    variable: "token",
                    expression: "body.token",
                    success: true,
                    type: "string",
                    value: "[REDACTED]",
                  },
                ],
              },
            }}
          />
        </box>
      </ThemeProvider>,
      { width: 44, height: 18 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toMatch(/Assertions 0 passed · 1 failed/)
    expect(frame).toMatch(/Captures 1 captured · 0 failed/)
    expect(frame).toContain("0 passed · 1 failed")
    expect(frame).toContain("expected: 201")
    expect(frame).toContain("actual: 200")
    expect(frame).toContain("token ← body.token")
    expect(frame).toContain("[REDACTED]")
  })

  it("renders declarations in the not-evaluated state", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <ResponseResults
          execution={{
            assertions: { evaluated: false, results: [] },
            captures: { evaluated: false, results: [] },
          }}
          request={{
            assertions: [{ expression: "status", operator: "exists" }],
            captures: { token: "headers.x-token" },
          }}
        />
      </ThemeProvider>,
      { width: 50, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.match(/Not evaluated/g)).toHaveLength(2)
    expect(frame).toContain("status exists")
    expect(frame).toContain("token ← headers.x-token")
  })
})
