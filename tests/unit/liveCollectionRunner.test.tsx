import { describe, expect, it } from "bun:test"
import { act, useLayoutEffect, useRef, useState } from "react"
import { KeymapProvider, useBindings } from "@opentui/keymap/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import {
  CodeEditorRenderable,
  CodeEditorScrollBarRenderable,
} from "../../src/ui/editor/CodeEditor"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender, waitForHookState } from "../testRender"
import { setupKeymap } from "./_helpers"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import {
  collectionRun,
  summarizeRun,
  type CollectionRunEvent,
  type RequestRunDetail,
  type RequestRunResult,
} from "../../src/app/services"
import { CollectionRunnerView } from "../../src/ui/CollectionRunnerView"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import { Header } from "../../src/ui/Header"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"
import { ThemeProvider } from "../../src/ui/theme"
import { createRunnerLayer } from "../../src/ui/keymap/runnerLayers"
import type { AppKeymapContext } from "../../src/ui/keymap/types"
import type { Focus } from "../../src/ui/focus"
import type { Collection } from "../../src/schema"

extend({
  "code-editor": CodeEditorRenderable,
  "code-editor-scrollbar": CodeEditorScrollBarRenderable,
})
const testRender = createTestRender()
const collection: Collection = {
  id: "live",
  name: "Live",
  items: ["first", "second", "third"].map((id) => ({
    type: "request",
    data: {
      id,
      name: id,
      method: "GET",
      url: `https://example.com/${id}`,
      headers: {},
      params: [],
      timeout: 0,
    },
  })),
}
const successful: RequestRunResult = {
  id: "first",
  method: "GET",
  url: "https://example.com/first",
  ok: true,
  failureCategories: [],
  response: {
    status: 200,
    statusText: "OK",
    headers: {},
    body: '{"ready":true}',
    timeMs: 12,
  },
  captures: {
    evaluated: true,
    results: [
      {
        variable: "token",
        expression: "status",
        success: true,
        value: 200,
        type: "number",
      },
    ],
  },
  assertions: {
    evaluated: true,
    results: [
      {
        expression: "status",
        operator: "equals",
        expected: 200,
        actual: 200,
        passed: true,
        message: "status matched",
      },
    ],
  },
  tests: {
    evaluated: true,
    results: [
      { name: "ready check", passed: true, message: "passed", durationMs: 1 },
    ],
    logs: [{ level: "log", message: "completed log", timeMs: 3 }],
  },
}
const detail: RequestRunDetail = {
  requestId: "first",
  entry: {
    timestamp: 1,
    request: {
      id: "first",
      name: "first",
      method: "GET",
      url: successful.url,
      headers: {},
      params: [],
    },
    response: { ...successful.response!, size: 14 },
  },
}

async function harness() {
  const { keymap, host } = setupKeymap()
  let runner!: UseCollectionRunnerResult
  let focus: Focus = "runner-options"
  let show = true
  let opened: RequestRunDetail | null = null
  let emit!: (event: CollectionRunEvent) => void
  let publishDetail!: (value: RequestRunDetail) => void
  let signal!: AbortSignal
  let reportProgress: Parameters<typeof collectionRun>[2]
  let calls = 0
  const done =
    Promise.withResolvers<Awaited<ReturnType<typeof collectionRun>>>()
  const runCollection: typeof collectionRun = async (...args) => {
    calls++
    signal = args[14]!.signal!
    reportProgress = args[2]
    emit = args[14]!.onEvent!
    publishDetail = args[10]!
    emit({ type: "run-start", requestIds: ["first", "second", "third"] })
    emit({ type: "request-start", id: "first" })
    return done.promise
  }
  function Content() {
    const state = useCollectionRunner({
      collection,
      collectionDir: "/tmp/live-runner",
      folderPath: null,
      activeEnvironment: null,
      environmentNames: ["other"],
      hasUnsavedChanges: false,
      noProxy: true,
      systemProxy: { bypass: [] },
      insecure: false,
      resetKey: 1,
      runCollection,
    })
    const [pane, setPane] = useState<Focus>("runner-options")
    const [visible, setVisible] = useState(true)
    const [entry, setEntry] = useState<RequestRunDetail | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state
    const focusRef = useRef(pane)
    focusRef.current = pane
    const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
    runner = state
    focus = pane
    show = visible
    opened = entry
    useLayoutEffect(() => {
      keymap.setData("app.view", visible ? "runner" : "main")
      keymap.setData("app.overlay", entry ? "timeline-detail" : "none")
    }, [visible, entry])
    const openDetail = (index = stateRef.current.resultIndex) => {
      const row = stateRef.current.resultRows[index]
      if (row?.kind === "result")
        setEntry(stateRef.current.resultDetails.get(row.id) ?? null)
    }
    useBindings(
      () =>
        createRunnerLayer({
          keymap,
          keybinds: { browse_delete: "ctrl+d" },
          global: { focusRef, setFocus: setPane },
          runner: {
            runnerRef: stateRef,
            detailScrollRef,
            openResultDetail: openDetail,
            close: () => setVisible(false),
          },
        } as unknown as AppKeymapContext),
      [],
    )
    return (
      <box flexDirection="column" width="100%" height="100%">
        <Header
          collectionLabel="Live acceptance"
          envLabel="no env"
          envStatus="none"
        />
        <box
          flexDirection="column"
          flexGrow={1}
          minHeight={0}
          paddingLeft={1}
          paddingRight={1}
        >
          {visible ? (
            <CollectionRunnerView
              runner={state}
              focus={pane}
              hasUnsavedChanges={false}
              detailScrollRef={detailScrollRef}
              onPaneFocus={setPane}
              onEditTagFilter={() => {}}
              onOpenResultDetail={openDetail}
            />
          ) : (
            <text onMouseDown={() => setVisible(true)}>Return to Runner</text>
          )}
        </box>
        <StatusBar
          kb={bindingDefaults()}
          globalHints={[]}
          footerHints={[]}
          runnerProgress={
            state.phase === "running" ? state.progress : undefined
          }
        />
        <TimelineDetailOverlay
          visible={!!entry}
          entry={entry?.entry ?? null}
          execution={successful}
          showCaptures
          request={{}}
          onClose={() => setEntry(null)}
          onStop={state.phase === "running" ? state.stop : undefined}
          stopping={state.stopping}
        />
      </box>
    )
  }
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Content />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 80, height: 24 },
  )
  await act(async () => {
    await render.renderOnce()
  })
  let running: Promise<void> | undefined
  return {
    render,
    host,
    get: () => runner,
    focus: () => focus,
    shown: () => show,
    opened: () => opened,
    start: async () => {
      await act(async () => {
        running = runner.run()
        void runner.run()
      })
      await act(async () => {
        await render.renderOnce()
      })
      await waitForHookState(
        render,
        () => runner.resultRows[0]?.kind === "running",
      )
      expect(calls).toBe(1)
    },
    firstDone: async () => {
      await act(async () => {
        publishDetail(detail)
        emit({ type: "request-complete", id: "first", result: successful })
        emit({ type: "request-start", id: "second" })
        reportProgress?.(1, 3)
      })
      await waitForHookState(
        render,
        () => runner.resultRows[0]?.kind === "result",
      )
      await act(async () => {
        await render.renderOnce()
      })
    },
    aborted: () => signal.aborted,
    fail: async (error = new Error("Invalid external script")) => {
      await act(async () => {
        done.reject(error)
        await running
      })
      await act(async () => {
        await render.renderOnce()
      })
    },
    finish: async (cancelled = false) => {
      await act(async () => {
        const results = cancelled
          ? [
              successful,
              {
                ...successful,
                id: "second",
                ok: false,
                cancelled: true as const,
              },
            ]
          : [successful]
        const skipped = cancelled
          ? [{ id: "third", reason: "cancelled" as const }]
          : []
        done.resolve({
          results,
          skipped,
          failed: cancelled,
          ...(cancelled ? { cancelled: true as const } : {}),
          summary: summarizeRun(results, 3, skipped.length, performance.now()),
        })
        await running
      })
      await act(async () => {
        await render.renderOnce()
      })
    },
  }
}

describe("live Collection Runner", () => {
  it.each(["keyboard", "mouse", "focused", "detail"])(
    "publishes completed details and stops by %s at 80x24",
    async (input) => {
      const h = await harness()
      await h.start()
      expect(h.get().resultRows.map((row) => row.kind)).toEqual([
        "running",
        "pending",
        "pending",
      ])
      expect(h.focus()).toBe("runner-requests")
      await h.firstDone()
      expect(h.get().phase).toBe("running")
      expect(h.get().resultRows.map((row) => row.kind)).toEqual([
        "result",
        "running",
        "pending",
      ])
      expect(h.get().result?.summary).toMatchObject({
        completed: 1,
        requestSuccesses: 1,
        assertionPasses: 1,
        testPasses: 1,
      })
      const before = h.render.captureCharFrame()
      expect(before).toContain("PASS")
      expect(before).toContain("RUNNING")
      expect(before).toContain("PENDING")
      expect(before).toContain("s Stop 1/3")
      expect(before).toContain("v0.10.1")
      expect(before).toContain("Live acceptance")
      if (input === "detail") {
        await act(async () => h.host.press("return"))
        await act(async () => {
          await h.render.renderOnce()
        })
        expect(h.opened()?.requestId).toBe("first")
        await act(async () => h.host.press("right"))
        await act(async () => {
          await h.render.renderOnce()
        })
        expect(h.render.captureCharFrame()).toContain('"ready": true')
        await act(async () => h.host.press("right"))
        await act(async () => {
          await h.render.renderOnce()
        })
        expect(h.render.captureCharFrame()).toContain("completed log")
        await act(async () => h.host.press("right"))
        await act(async () => {
          await h.render.renderOnce()
        })
        expect(h.render.captureCharFrame()).toContain("ready check")
      }
      if (input === "mouse") {
        const button =
          h.render.renderer.root.findDescendantById("runner-run-button")!
        await act(async () =>
          h.render.mockMouse.click(
            button.screenX + 1,
            button.screenY,
            MouseButtons.LEFT,
          ),
        )
      } else if (input === "focused") {
        await act(async () => h.host.press("tab"))
        expect(h.focus()).toBe("runner-options")
        await act(async () => h.host.press("return"))
      } else await act(async () => h.host.press("s"))
      await waitForHookState(h.render, () => h.aborted())
      expect(h.aborted()).toBe(true)
      expect(h.get().stopping).toBe(true)
      expect(h.get().canRun).toBe(false)
      await h.finish(true)
      expect(h.get().result?.summary).toMatchObject({
        selected: 3,
        completed: 1,
        cancelled: 1,
        unstarted: 1,
        requestFailures: 0,
      })
      expect(h.get().resultDetails.get("first")).toEqual(detail)
      expect(h.get().stopping).toBe(false)
    },
  )

  it("restores options focus and reports a configuration failure", async () => {
    const h = await harness()
    await h.start()
    await h.fail()
    expect(h.get().phase).toBe("configure")
    expect(h.get().runError).toBe("Invalid external script")
    expect(h.focus()).toBe("runner-options")
    expect(h.get().canRun).toBe(true)
  })

  it.each(["signal", "AbortError"])(
    "reports rejected cancellation from %s without a configuration failure",
    async (source) => {
      const h = await harness()
      await h.start()
      await h.firstDone()
      if (source === "signal") await act(async () => h.host.press("s"))
      await h.fail(
        source === "AbortError"
          ? new DOMException("aborted", "AbortError")
          : new Error("aborted"),
      )
      expect(h.get().phase).toBe("results")
      expect(h.get().result?.cancelled).toBe(true)
      expect(h.get().result?.failure).toBeUndefined()
      expect(h.get().runError).toBeNull()
      expect(h.get().result?.results).toEqual([successful])
      expect(h.get().result?.summary.failureCategories).toEqual([])
      expect(h.get().resultDetails.get("first")).toEqual(detail)
    },
  )

  it("keeps an active run alive when Escape leaves its workspace", async () => {
    const h = await harness()
    await h.start()
    await act(async () => h.host.press("escape"))
    expect(h.shown()).toBe(false)
    expect(h.aborted()).toBe(false)
    await h.firstDone()
    await h.finish()
    expect(h.get().result?.results[0]).toEqual(successful)
    expect(h.get().phase).toBe("results")
  })
})
