import { describe, expect, it } from "bun:test"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestKeymap } from "@opentui/keymap/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ResponsePane, hasResponseResults } from "../../src/ui/ResponsePane"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import type { SendState } from "../../src/ui/sendState"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})

const testRender = createTestRender()
const response = {
  status: 200,
  statusText: "OK",
  headers: {},
  body: '{"token":"secret"}',
  timeMs: 4,
}

describe("response Results", () => {
  it("marks Results only for evaluated or explicitly unevaluated groups", () => {
    expect(hasResponseResults({ status: "done", response })).toBe(false)
    expect(
      hasResponseResults({
        status: "done",
        response,
        execution: { assertions: { evaluated: true, results: [] } },
      }),
    ).toBe(true)
    expect(
      hasResponseResults({
        status: "error",
        request: {
          id: "request",
          name: "Request",
          method: "GET",
          url: "https://example.com",
          headers: {},
          params: [],
          timeout: 0,
        },
        error: new Error("before response"),
        execution: { captures: { evaluated: false, results: [] } },
      }),
    ).toBe(true)
  })

  it("keeps empty Results present and selectable without an indicator", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    const changes: string[] = []
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponsePane
            state={{ status: "done", response }}
            initialTab="results"
            onTabChange={(tab) => changes.push(tab)}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 14 },
    )
    await render.renderOnce()
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("Results")
    expect(frame).not.toContain("Results •")
    expect(frame).toContain("No execution results.")
    expect(changes).toEqual([])
    cleanup()
  })

  it("renders manual capture totals and redacted values", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    const state: SendState = {
      status: "done",
      response,
      execution: {
        captures: {
          evaluated: true,
          results: [
            {
              variable: "token",
              expression: "body.token",
              success: true,
              value: "[REDACTED]",
              type: "string",
            },
          ],
        },
      },
    }
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponsePane state={state} initialTab="results" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 16 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toMatch(/Captures 1 captured · 0 failed/)
    expect(frame).toContain("1 captured · 0 failed")
    expect(frame).not.toContain("This send only.")
    cleanup()
  })

  it("places populated Results last with the request-tab value indicator", async () => {
    const { keymap, cleanup } = createTestKeymap()
    keymap.setData("app.overlay", "none")
    const render = await testRender(
      <KeymapProvider
        keymap={
          keymap as unknown as Parameters<typeof KeymapProvider>[0]["keymap"]
        }
      >
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ResponsePane
            state={{
              status: "done",
              response,
              execution: { assertions: { evaluated: true, results: [] } },
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 14 },
    )
    await render.renderOnce()
    const frame = render.captureCharFrame()
    expect(frame).toContain("Results •")
    expect(frame.indexOf("Results •")).toBeGreaterThan(frame.indexOf("Cookies"))
    cleanup()
  })
})
