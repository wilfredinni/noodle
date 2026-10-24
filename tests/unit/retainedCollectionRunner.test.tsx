import { describe, expect, it } from "bun:test"
import { act, useRef, useState } from "react"
import { KeymapProvider } from "@opentui/keymap/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import {
  summarizeRun,
  type collectionRun,
  type CollectionRunResult,
} from "../../src/app/services"
import type { Collection } from "../../src/schema"
import type { RunnerSnapshot } from "../../src/runnerSession"
import { CollectionRunnerView } from "../../src/ui/CollectionRunnerView"
import { ThemeProvider } from "../../src/ui/theme"
import { createTestRender, waitForHookState } from "../testRender"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()
const collection: Collection = {
  id: "collection",
  name: "Collection",
  items: [
    {
      type: "request",
      data: {
        id: "same",
        name: "Original request",
        method: "GET",
        url: "https://example.com",
        headers: {},
        params: [],
        timeout: 0,
      },
    },
  ],
}
function completed(status = 200): CollectionRunResult {
  const results = [0, 1].map((iteration) => ({
    id: "same",
    iteration,
    method: "GET" as const,
    url: "https://example.com",
    ok: status === 200,
    failureCategories: status === 200 ? [] : ["http" as const],
    response: {
      status,
      statusText: "Status",
      headers: {},
      timeMs: iteration + 1,
    },
  }))
  return {
    iterations: 2,
    results,
    skipped: [],
    failed: status !== 200,
    summary: summarizeRun(results, 2, 0, performance.now()),
  }
}

async function harness() {
  let runner!: UseCollectionRunnerResult
  let switchCollection!: (dir: string) => void
  let show!: (visible: boolean) => void
  let update!: (collection: Collection) => void
  let reset!: () => void
  let runService = async (_args: Parameters<typeof collectionRun>) =>
    completed()
  const session = new Map<string, RunnerSnapshot>()
  const { keymap } = setupKeymap()
  const runCollection: typeof collectionRun = async (...args) => {
    const result = await runService(args)
    for (const row of result.results)
      args[10]?.({
        requestId: row.id,
        iteration: row.iteration,
        entry: {
          timestamp: 1,
          request: {
            id: row.id,
            name: "Original request",
            method: "GET",
            url: row.url,
            headers: {},
            params: [],
          },
          response: { ...row.response!, body: `row ${row.iteration}`, size: 5 },
        },
      })
    return result
  }
  function Child({ dir }: { dir: string }) {
    const [current, setCurrent] = useState(collection)
    const [visible, setVisible] = useState(true)
    const [resetKey, setResetKey] = useState(0)
    const detailScrollRef = useRef<ScrollBoxRenderable | null>(null)
    update = setCurrent
    show = setVisible
    reset = () => setResetKey((key) => key + 1)
    runner = useCollectionRunner({
      collection: current,
      collectionDir: dir,
      folderPath: null,
      activeEnvironment: "dev",
      environmentNames: ["dev", "next"],
      hasUnsavedChanges: false,
      noProxy: true,
      insecure: false,
      systemProxy: { bypass: [] },
      resetKey,
      session,
      runCollection,
    })
    return visible ? (
      <CollectionRunnerView
        runner={runner}
        focus="runner-requests"
        detailScrollRef={detailScrollRef}
        hasUnsavedChanges={false}
        onPaneFocus={() => {}}
        onEditTagFilter={() => {}}
        onOpenResultDetail={() => {}}
      />
    ) : null
  }
  function Harness() {
    const [dir, setDir] = useState("/collection/a")
    switchCollection = setDir
    return (
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Child key={dir} dir={dir} />
        </ThemeProvider>
      </KeymapProvider>
    )
  }
  const render = await testRender(<Harness />, { width: 100, height: 30 })
  return {
    render,
    get: () => runner,
    session,
    switchCollection: (dir: string) => switchCollection(dir),
    show: (visible: boolean) => show(visible),
    update: (c: Collection) => update(c),
    reset: () => reset(),
    service: (next: typeof runService) => {
      runService = next
    },
  }
}

describe("session-retained Runner", () => {
  it("keeps the live selected iteration when completing and reopening a run", async () => {
    const h = await harness()
    const pending = Promise.withResolvers<CollectionRunResult>()
    h.service(async (args) => {
      args[14]?.onEvent?.({
        type: "run-start",
        requestIds: ["same"],
        iterations: 2,
      })
      return pending.promise
    })
    let running!: Promise<void>
    await act(async () => {
      running = h.get().run()
    })
    await waitForHookState(h.render, () => h.get().resultRows.length === 2)
    await act(async () => h.get().setResultIndex(1))
    await act(async () => {
      pending.resolve(completed())
      await running
    })
    expect(h.get().resultRows[h.get().resultIndex]?.id).toBe("1:same")
    await act(async () => h.switchCollection("/collection/b"))
    await act(async () => h.switchCollection("/collection/a"))
    expect(h.get().resultRows[h.get().resultIndex]?.id).toBe("1:same")
  })

  it("survives reopen, collection remounts, config edits, source removal and repeated iterations", async () => {
    const h = await harness()
    await act(async () => {
      await h.get().run()
    })
    const old = h.get().result
    expect(h.get().resultRows.map((row) => row.id)).toEqual([
      "0:same",
      "1:same",
    ])
    await act(async () => h.get().setResultIndex(1))
    await act(async () => h.show(false))
    await act(async () => h.show(true))
    expect(h.get().result).toBe(old)
    await act(async () => {
      h.get().showConfigure()
      h.get().setEnvironmentName("next")
      h.get().toggleFailFast()
      h.get().setDelayMsInput("25")
      h.get().setTagFilter("include", 0, "future")
    })
    expect(h.get().executedConfiguration).toMatchObject({
      environmentName: "dev",
      failFast: false,
      delayMs: 0,
      includeTags: [],
    })
    expect(h.get().result).toBe(old)
    await act(async () => h.reset())
    expect(h.get().result).toBe(old)
    await act(async () => h.switchCollection("/collection/b"))
    expect(h.get().result).toBeNull()
    h.service(async () => completed(500))
    await act(async () => {
      await h.get().run()
    })
    expect(h.get().result?.failed).toBe(true)
    await act(async () => h.switchCollection("/collection/a"))
    expect(h.get().result).toBe(old)
    expect(h.get().phase).toBe("results")
    expect(h.get().resultIndex).toBe(1)
    expect(h.get().resultDetails.get("1:same")!.entry.response!.body).toBe(
      "row 1",
    )
    await act(async () => h.update({ ...collection, items: [] }))
    await act(async () => h.render.renderOnce())
    expect(h.get().resultRows).toHaveLength(2)
    expect(h.render.captureCharFrame()).toContain("Original request")
    expect(h.get().resultDetails.size).toBe(2)
  })

  it("replaces only settled runs, preserves prior results after preflight failure, and retains cancellation", async () => {
    const h = await harness()
    await act(async () => {
      await h.get().run()
    })
    const old = h.session.get("/collection/a")
    const pending = Promise.withResolvers<CollectionRunResult>()
    h.service(() => pending.promise)
    let running!: Promise<void>
    await act(async () => {
      running = h.get().run()
    })
    expect(h.session.get("/collection/a")).toBe(old)
    await act(async () => {
      pending.resolve({
        results: [],
        skipped: [],
        failed: true,
        failure: { category: "configuration", message: "Invalid script" },
        summary: summarizeRun([], 2, 0, performance.now(), true),
      })
      await running
    })
    expect(h.get().result).toBe(old!.result)
    expect(h.get().runError).toBe("Invalid script")
    h.service(async () => ({
      ...completed(),
      cancelled: true,
      results: [completed().results[0]!],
      skipped: [{ id: "same", iteration: 1, reason: "cancelled" }],
      summary: summarizeRun([completed().results[0]!], 2, 1, performance.now()),
    }))
    await act(async () => {
      await h.get().run()
    })
    expect(h.session.get("/collection/a")).not.toBe(old)
    expect(h.get().result?.cancelled).toBe(true)
    await act(async () => h.switchCollection("/collection/b"))
    await act(async () => h.switchCollection("/collection/a"))
    expect(h.get().result?.cancelled).toBe(true)
    expect(h.get().resultRows[1]).toMatchObject({
      id: "1:same",
      kind: "skipped",
      reason: "cancelled",
    })
    h.service(async () => completed(500))
    await act(async () => {
      await h.get().run()
    })
    expect(h.get().result?.cancelled).toBeUndefined()
    expect(h.get().result?.failed).toBe(true)
    expect(h.session.size).toBe(1)
  })
})
