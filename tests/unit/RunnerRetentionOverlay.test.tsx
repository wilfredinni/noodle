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
import {
  RUNNER_RETENTION_NOTICE,
  retainRunnerSnapshot,
  type RunnerDetail,
} from "../../src/runnerSession"
import { summarizeRun, type RequestRunResult } from "../../src/app/services"
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

it.each([
  { omitRow: false, omitDetail: false },
  { omitRow: true, omitDetail: false },
  { omitRow: false, omitDetail: true },
  { omitRow: true, omitDetail: true },
])(
  "shows available execution when the row and detail budgets differ: %j",
  async ({ omitRow, omitDetail }) => {
    const row: RequestRunResult = {
      id: "request",
      method: "GET",
      url: "https://example.com",
      ok: false,
      failureCategories: ["assertion", "capture"],
      response: {
        status: 200,
        statusText: "OK",
        timeMs: 1,
        headers: omitRow ? { oversized: "r".repeat(6 * 1024 * 1024) } : {},
      },
      assertions: {
        evaluated: true,
        results: [
          {
            expression: "status",
            operator: "equals",
            expected: 201,
            actual: 200,
            passed: false,
            message: "Expected a created response",
          },
        ],
      },
      captures: {
        evaluated: true,
        results: [
          {
            variable: "token",
            expression: "body.token",
            success: false,
            failureReason: "missing",
            message: "Token missing",
          },
        ],
      },
    }
    const saved = retainRunnerSnapshot({
      configuration: {
        scope: null,
        selectedIds: [row.id],
        environmentName: null,
        includeTags: [],
        excludeTags: [],
        failFast: false,
        delayMs: 0,
        dataPath: "",
        noProxy: true,
        insecure: false,
      },
      items: [
        {
          type: "request",
          data: { id: row.id, name: "Request", method: row.method },
        },
      ],
      result: {
        results: [row],
        skipped: [],
        failed: true,
        summary: summarizeRun([row], 1, 0, performance.now()),
      },
      details: new Map<string, RunnerDetail>([
        [
          row.id,
          {
            requestId: row.id,
            entry: {
              timestamp: 1,
              assertions: row.assertions,
              request: {
                id: row.id,
                name: "Request",
                method: row.method,
                url: row.url,
                params: [],
                headers: omitDetail
                  ? {
                      oversized: {
                        value: "d".repeat(6 * 1024 * 1024),
                        enabled: true,
                      },
                    }
                  : {},
              },
            },
          },
        ],
      ]),
    })
    const detail = saved.details.get(row.id)!
    const execution = detail.execution ?? saved.result.results[0]!
    const allOmitted = omitRow && omitDetail
    expect(Boolean(detail.retention?.resultsOmitted)).toBe(allOmitted)
    expect(saved.result.results[0]!.assertions === undefined).toBe(omitRow)
    if (!allOmitted) {
      expect(execution.assertions).toEqual(row.assertions)
      // Captures are not part of TimelineEntry, but must survive through the detail execution.
      expect(execution.captures).toEqual(row.captures)
    }
    expect(
      new TextEncoder().encode(
        JSON.stringify({ ...saved, details: [...saved.details] }),
      ).length,
    ).toBeLessThanOrEqual(5 * 1024 * 1024)

    const { keymap, host, cleanup } = setupKeymap()
    let opened: RunnerSourceTarget[] = []
    const h = await act(async () =>
      testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <TimelineDetailOverlay
              visible
              onClose={() => {}}
              entry={detail.entry}
              execution={execution}
              retention={detail.retention}
              showCaptures
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
      await act(async () => host.press("right"))
      await h.renderOnce()
      await act(async () => host.press("right"))
      await h.renderOnce()
      let frame = h.captureCharFrame()
      expect(frame).not.toContain("No execution results")
      expect(frame).not.toContain("Not evaluated")
      if (allOmitted) {
        expect(frame).toContain(RUNNER_RETENTION_NOTICE)
        expect(frame).toContain("Expected a created response")
      } else {
        expect(frame).toContain("0 passed · 1 failed")
        expect(frame).toContain("0 captured · 1 failed")
        await act(async () => host.press("return"))
        await h.renderOnce()
        expect(h.captureCharFrame()).toContain("Expected a created response")
      }
      await act(async () => host.press("o"))
      expect(opened).toEqual([{ tab: "assertions", source: undefined }])
    } finally {
      cleanup()
      act(() => h.renderer.destroy())
    }
  },
)
