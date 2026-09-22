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
  it("shows every inherited test error and schema detail with its origin", async () => {
    const { keymap, host } = setupKeymap()
    const source = { scope: "collection" as const, path: "settings.yml" }
    const error = { name: "Error", message: "collection failed", source }
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              tests: {
                evaluated: true,
                results: [
                  {
                    name: "schema",
                    passed: false,
                    message: "/email: format must match email",
                    durationMs: 1,
                    source,
                  },
                ],
                logs: [],
                errors: [
                  error,
                  {
                    name: "Error",
                    message: "folder failed",
                    source: { scope: "folder", path: "users/folder.yml" },
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("1 failed · script error")
    expect(render.captureCharFrame()).toMatch(
      /ERROR\s+Test script\s+collection failed/,
    )
    await act(async () => {
      host.press("return")
    })
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain("collection failed")
    expect(render.captureCharFrame()).toContain("users/folder.yml")
    await act(async () => {
      host.press("down")
    })
    await render.renderOnce()
    await act(async () => {
      host.press("return")
    })
    await render.renderOnce()
    expect(render.captureCharFrame()).toContain(
      "/email: format must match email",
    )
    expect(render.captureCharFrame()).toContain("settings.yml")
  })
  it("shows caught child failures inside a successful script at narrow widths", async () => {
    const { keymap, host } = setupKeymap()
    const { renderOnce, captureCharFrame, resize } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              scripts: {
                evaluated: true,
                results: [
                  {
                    phase: "pre",
                    scope: "request",
                    sourceKind: "inline",
                    success: true,
                    durationMs: 12,
                    logs: [],
                    requests: [
                      {
                        kind: "saved",
                        requestId: "login",
                        depth: 1,
                        method: "POST",
                        url: "https://example.test/login",
                        status: 401,
                        durationMs: 8,
                        success: false,
                        failureCategories: ["http"],
                      },
                    ],
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 72, height: 14 },
    )
    await renderOnce()
    expect(captureCharFrame()).toMatch(/Scripts\s+Passed/)
    expect(captureCharFrame()).toContain("1 call")
    await act(async () => {
      host.press("return")
      await renderOnce()
    })
    expect(captureCharFrame()).toContain("FAIL POST login (401), 8ms, http")
    expect(captureCharFrame()).toContain("https://example.test/login")
    await act(async () => {
      resize(44, 14)
      await renderOnce()
    })
    expect(captureCharFrame()).toContain("FAIL POST login")
  })

  it("uses available width for test names while preserving duration spacing", async () => {
    const { keymap } = setupKeymap()
    const { renderOnce, captureCharFrame, resize } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              tests: {
                evaluated: true,
                logs: [],
                results: [
                  {
                    name: "response is successful JSON",
                    passed: true,
                    message: "Test passed",
                    durationMs: 1,
                  },
                  {
                    name: "post has the expected identity and content",
                    passed: false,
                    message: "Expected values to be equal",
                    durationMs: 12,
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 6 },
    )
    await renderOnce()
    const lines = captureCharFrame().split("\n")
    const shortRow = lines.find((line) => line.includes("PASS"))
    const longRow = lines.find((line) => line.includes("FAIL"))
    expect(shortRow).toMatch(/response is successful JSON\s+1ms/)
    expect(longRow).toMatch(
      /post has the expected identity and content {2}12ms/,
    )
    expect(shortRow?.indexOf("1ms")).toBe(longRow?.indexOf("12ms"))

    await act(async () => {
      resize(44, 6)
      await renderOnce()
    })
    const narrowLines = captureCharFrame().split("\n")
    expect(narrowLines.find((line) => line.includes("PASS"))).toMatch(
      /\S 1ms\s*$/,
    )
    expect(narrowLines.find((line) => line.includes("FAIL"))).toMatch(
      /\S 12ms\s*$/,
    )

    await act(async () => {
      resize(90, 6)
      await renderOnce()
    })
    expect(captureCharFrame()).toBe(lines.join("\n"))
  })

  it("renders expandable script status, timing, errors, and redacted logs", async () => {
    const { keymap, host } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              scripts: {
                evaluated: true,
                results: [
                  {
                    phase: "pre",
                    scope: "request",
                    sourceKind: "inline",
                    success: false,
                    durationMs: 4.25,
                    logs: [
                      { level: "info", message: "token [REDACTED]" },
                      { level: "info", message: "second message" },
                    ],
                    error: {
                      name: "ScriptRuntimeError",
                      message: "safe failure",
                      line: 2,
                      column: 3,
                    },
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 18 },
    )
    await renderOnce()
    expect(captureCharFrame()).toMatch(/Scripts\s+Failed/)
    expect(captureCharFrame()).toMatch(/FAIL\s+Pre-request\s+4.25ms, 2 logs/)
    expect(captureCharFrame()).not.toContain("token [REDACTED]")

    await act(async () => host.press("return"))
    await act(async () => renderOnce())
    const expanded = captureCharFrame()
    expect(expanded).toMatch(/Duration\s+4.25ms/)
    expect(expanded).toMatch(/Message\s+safe failure/)
    expect(expanded).toMatch(/Location\s+pre-request.js:2:3/)
    expect(expanded).toMatch(/INFO\s+token \[REDACTED\]/)
    expect(expanded).toMatch(/INFO\s+second message/)
  })

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

  it("uses available row width for assertion expressions", async () => {
    const { keymap } = setupKeymap()
    const { renderOnce, captureCharFrame, resize } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponseResults
            execution={{
              assertions: {
                evaluated: true,
                results: [
                  {
                    expression: "body.consentimientoCliente",
                    operator: "exists",
                    actual: true,
                    passed: true,
                    message: "Assertion passed",
                  },
                  {
                    expression: "body.id",
                    operator: "equals",
                    expected: 1,
                    actual: 2,
                    passed: false,
                    message: "Expected values to be equal",
                  },
                ],
              },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 6 },
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const row = lines.find((line) => line.includes("PASS"))
    const shortRow = lines.find((line) => line.includes("FAIL"))
    expect(row).toMatch(/body\.consentimientoCliente {2}exists/)
    expect(row?.indexOf("exists")).toBe(shortRow?.indexOf("equals"))

    await act(async () => {
      resize(44, 6)
      await renderOnce()
    })
    const narrowRow = captureCharFrame()
      .split("\n")
      .find((line) => line.includes("PASS"))
    expect(narrowRow).toMatch(/body\..* exists/)
    expect(narrowRow).not.toContain("body.consentimientoCliente")
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
