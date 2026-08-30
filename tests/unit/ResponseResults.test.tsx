import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { act } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponseResults } from "../../src/ui/ResponseResults"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("ResponseResults", () => {
  it("renders assertion and redacted capture details at constrained widths", async () => {
    const { keymap, host } = setupKeymap()
    const { renderOnce, captureCharFrame, renderer, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
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
                        persisted: "secret",
                      },
                    ],
                  },
                }}
              />
            </box>
          </ThemeProvider>
        </KeymapProvider>,
        { width: 44, height: 18 },
      )
    await renderOnce()
    const collapsed = captureCharFrame()
    expect(collapsed).toMatch(/Assertions 0 passed · 1 failed/)
    expect(collapsed).toMatch(/Captures 1 captured · 0 failed/)
    expect(collapsed).toMatch(/FAIL\s+status\s+equals/)
    expect(collapsed).toMatch(/CAPTURED\s+token\s+body.token/)
    expect(collapsed).not.toContain("Expected 201")
    expect(collapsed).not.toContain("[REDACTED]")

    const assertionRow = renderer.root.findDescendantById(
      "response-assertion-0",
    )!
    await act(async () =>
      mockMouse.click(
        assertionRow.screenX + 3,
        assertionRow.screenY,
        MouseButtons.LEFT,
      ),
    )
    await act(async () => renderOnce())
    const expandedAssertion = captureCharFrame()
    expect(expandedAssertion).toMatch(/Expected\s+201/)
    expect(expandedAssertion).toMatch(/Actual\s+200/)

    await act(async () => host.press("down"))
    await act(async () => renderOnce())
    await act(async () => host.press("return"))
    await act(async () => renderOnce())
    const expandedCapture = captureCharFrame()
    expect(expandedCapture).toMatch(/Type\s+string/)
    expect(expandedCapture).toMatch(/Persisted\s+secret/)
    expect(expandedCapture).toMatch(/Value\s+\[REDACTED\]/)

    await act(async () => host.press("return"))
    await act(async () => renderOnce())
    expect(captureCharFrame()).not.toContain("[REDACTED]")
  })

  it("keeps detail labels compact and pretty-prints structured values", async () => {
    const { keymap, host } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              assertions: {
                evaluated: true,
                results: [
                  {
                    expression: "body.response.payload",
                    operator: "isObject",
                    actual: {
                      title: "Assertion example",
                      userId: 1,
                    },
                    passed: true,
                    message: "Assertion passed",
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 52, height: 14 },
    )
    await renderOnce()
    await act(async () => host.press("return"))
    await act(async () => renderOnce())

    const lines = captureCharFrame().split("\n")
    const actualIndex = lines.findIndex((line) => line.includes("Actual"))
    expect(actualIndex).toBeGreaterThanOrEqual(0)
    expect(lines[actualIndex]!.trimEnd()).toEndWith("Actual")
    expect(lines[actualIndex + 1]!.trim()).toBe("{")
    expect(lines[actualIndex + 2]).toContain('"title": "Assertion example"')
    expect(lines[actualIndex + 3]).toContain('"userId": 1')
  })

  it("renders declarations in the not-evaluated state", async () => {
    const { keymap } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              assertions: { evaluated: false, results: [] },
              captures: { evaluated: false, results: [] },
            }}
            request={{
              assertions: [{ expression: "status", operator: "exists" }],
              captures: {
                token: { value: "headers.x-token", enabled: true },
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 50, height: 12 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.match(/Not evaluated/g)).toHaveLength(2)
    expect(frame).toContain("status exists")
    expect(frame).toContain("token headers.x-token")
  })

  it("excludes disabled declarations from unevaluated Results", async () => {
    const { keymap } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{}}
            request={{
              assertions: [
                {
                  expression: "body.disabled",
                  operator: "exists",
                  enabled: false,
                },
              ],
              captures: {
                disabled: { value: "body.disabled", enabled: false },
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 50, height: 8 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("No execution results.")
  })

  it("leaves navigation keys to an open overlay", async () => {
    const { keymap, host } = setupKeymap()
    const overlayKeys: string[] = []
    const disposeOverlay = keymap.intercept(
      "key",
      ({ event }) => {
        overlayKeys.push(event.name)
        event.stopPropagation()
      },
      { priority: 100 },
    )
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              assertions: {
                evaluated: true,
                results: [
                  {
                    expression: "status",
                    operator: "equals",
                    expected: 200,
                    actual: 200,
                    passed: true,
                    message: "Assertion passed",
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 50, height: 8 },
    )
    await renderOnce()
    keymap.setData("app.overlay", "theme")
    host.press("down")
    host.press("return")
    await renderOnce()

    expect(overlayKeys).toEqual(["down", "return"])
    expect(captureCharFrame()).not.toContain("Actual 200")
    disposeOverlay()
  })
})
