import { expect, it } from "bun:test"
import { act } from "react"
import { extend } from "@opentui/react"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import { RUNNER_RETENTION_NOTICE } from "../../src/runnerSession"
import type { RunnerSourceTarget } from "../../src/ui/runnerSource"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
const testRender = createTestRender()

it("shows omitted results and their failure reason without claiming checks never ran, and opens the retained source", async () => {
  const { keymap, host, cleanup } = setupKeymap()
  const source = {
    scope: "folder" as const,
    path: "folder/folder.yml",
    scopeId: "folder",
    sourceKind: "external" as const,
    sourcePath: "./post.js",
  }
  let opened: RunnerSourceTarget[] = []
  const h = await act(async () =>
    testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TimelineDetailOverlay
            visible
            onClose={() => {}}
            entry={{
              timestamp: 1,
              request: {
                id: "folder/request",
                name: "Request",
                method: "GET",
                url: "https://example.com",
                headers: {},
                params: [],
              },
              error: { message: "post failed" },
            }}
            execution={{}}
            request={{
              scripts: {},
              tests: "",
              assertions: [{ expression: "status", operator: "exists" }],
              captures: { token: { value: "body.token", enabled: true } },
            }}
            retention={{
              resultsOmitted: true,
              failure: "post failed",
              phase: "post",
              source,
            }}
            onOpenSources={(targets) => {
              opened = targets
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 40 },
    ),
  )
  try {
    await h.renderOnce()
    expect(h.captureCharFrame()).toContain(RUNNER_RETENTION_NOTICE)
    expect(h.captureCharFrame()).toContain("Results")
    await act(async () => host.press("right"))
    await h.renderOnce()
    await act(async () => host.press("right"))
    await h.renderOnce()
    const frame = h.captureCharFrame()
    expect(frame).toContain(RUNNER_RETENTION_NOTICE)
    expect(frame).toContain("post failed")
    expect(frame).not.toContain("Not evaluated")
    expect(frame).not.toContain("No execution results")
    await act(async () => host.press("o"))
    expect(opened).toEqual([{ tab: "postScript", source }])
  } finally {
    cleanup()
    act(() => h.renderer.destroy())
  }
})
