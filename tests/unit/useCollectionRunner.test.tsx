import { describe, expect, it } from "bun:test"
import { act } from "react"
import { createTestRender } from "../testRender"
import {
  useCollectionRunner,
  type UseCollectionRunnerResult,
} from "../../src/hooks/useCollectionRunner"
import type { Collection, Request } from "../../src/schema"
import type { collectionRun } from "../../src/app/services"

const testRender = createTestRender()
const request = (id: string, tags?: string[]): Request => ({
  id,
  name: id,
  method: "GET",
  url: `https://example.com/${id}`,
  headers: {},
  params: [],
  timeout: 0,
  tags,
})
const collection: Collection = {
  id: "runner",
  name: "Runner",
  items: [
    { type: "request", data: request("root", ["smoke"]) },
    {
      type: "folder",
      data: {
        id: "admin",
        name: "Admin",
        path: "admin",
        tags: ["smoke", "destructive"],
        children: [
          { type: "request", data: request("admin/first") },
          {
            type: "request",
            data: request("admin/second", ["safe"]),
          },
        ],
      },
    },
  ],
}

function renderHook(
  options: Partial<Parameters<typeof useCollectionRunner>[0]> = {},
) {
  let runner: UseCollectionRunnerResult | null = null
  function Harness() {
    runner = useCollectionRunner({
      collection,
      collectionDir: "/tmp/runner",
      folderPath: null,
      activeEnvironment: "development",
      environmentNames: ["development", "staging"],
      hasUnsavedChanges: false,
      noProxy: false,
      systemProxy: { bypass: [] },
      insecure: false,
      resetKey: 1,
      ...options,
    })
    return null
  }
  return {
    render: testRender(<Harness />, { width: 20, height: 4 }),
    get: () => runner!,
  }
}

describe("useCollectionRunner", () => {
  it("initializes a folder scope with every request selected in collection order", async () => {
    const harness = renderHook({ folderPath: "admin" })
    const render = await harness.render
    await render.renderOnce()
    expect(harness.get().scopeLabel).toBe("Folder: admin")
    expect(harness.get().requests.map((item) => item.id)).toEqual([
      "admin/first",
      "admin/second",
    ])
    expect(harness.get().requestTags.get("admin/first")).toEqual([
      "smoke",
      "destructive",
    ])
    expect([...harness.get().selectedIds]).toEqual([
      "admin/first",
      "admin/second",
    ])
  })

  it("navigates folder rows and toggles the focused folder", async () => {
    const harness = renderHook()
    const render = await harness.render
    await render.renderOnce()

    await act(async () => harness.get().requestDown())
    await render.renderOnce()
    expect(harness.get().requestRowIndex).toBe(1)

    await act(async () => harness.get().toggleSelected())
    expect([...harness.get().selectedIds]).toEqual(["root"])

    await act(async () => harness.get().toggleSelected())
    expect([...harness.get().selectedIds]).toEqual([
      "root",
      "admin/first",
      "admin/second",
    ])
  })

  it("previews inherited filters with exclusion precedence", async () => {
    const harness = renderHook()
    const render = await harness.render
    await render.renderOnce()
    await act(async () => {
      harness.get().setOptionIndex(2)
      harness.get().beginOptionEdit("include")
      harness.get().setEditValue("smoke")
    })
    await render.renderOnce()
    await act(async () => harness.get().commitOptionEdit())
    await render.renderOnce()
    expect([...harness.get().matchedIds]).toEqual([
      "root",
      "admin/first",
      "admin/second",
    ])

    await act(async () => {
      harness.get().beginOptionEdit("exclude")
      harness.get().setEditValue("destructive")
    })
    await render.renderOnce()
    await act(async () => harness.get().commitOptionEdit())
    await render.renderOnce()
    expect([...harness.get().matchedIds]).toEqual(["root"])
  })

  it("keeps environment local and routes selection, filters, progress, and fail-fast through collectionRun", async () => {
    let args: Parameters<typeof collectionRun> | undefined
    const runCollection = (async (
      ...received: Parameters<typeof collectionRun>
    ) => {
      args = received
      received[2]?.(0, 1)
      received[2]?.(1, 1)
      return {
        results: [
          {
            id: "root",
            method: "GET",
            url: "https://example.com/root",
            ok: false,
            failureCategories: ["assertion"],
            assertions: { evaluated: true, results: [] },
          },
        ],
        skipped: [
          { id: "admin/first", reason: "fail-fast" as const },
          { id: "admin/second", reason: "fail-fast" as const },
        ],
        failed: true,
        summary: {
          selected: 3,
          executed: 1,
          skipped: 2,
          requestSuccesses: 0,
          requestFailures: 1,
          assertionPasses: 0,
          assertionFailures: 1,
          captureFailures: 0,
          durationMs: 2,
          failureCategories: ["assertion"],
        },
      }
    }) as typeof collectionRun
    const harness = renderHook({ runCollection })
    const render = await harness.render
    await render.renderOnce()
    await act(async () => {
      harness.get().setEnvironmentName("staging")
      harness.get().toggleFailFast()
    })
    await render.renderOnce()
    await act(async () => await harness.get().run())
    await render.renderOnce()
    expect(args?.[1]).toBe("staging")
    expect(args?.[6]).toEqual(["root", "admin/first", "admin/second"])
    expect(args?.[9]).toBe(true)
    expect(harness.get().progress).toEqual({ completed: 1, total: 1 })
    expect(harness.get().resultRows.map((row) => row.id)).toEqual([
      "root",
      "admin/first",
      "admin/second",
    ])
    expect(harness.get().phase).toBe("results")
  })

  it("blocks Run while workspace drafts are dirty", async () => {
    let calls = 0
    const runCollection = (async () => {
      calls++
      throw new Error("must not run")
    }) as typeof collectionRun
    const harness = renderHook({ hasUnsavedChanges: true, runCollection })
    const render = await harness.render
    await render.renderOnce()
    expect(harness.get().canRun).toBe(false)
    await harness.get().run()
    expect(calls).toBe(0)
  })

  it("does not run with an uncommitted tag filter", async () => {
    let calls = 0
    const runCollection = (async () => {
      calls++
      throw new Error("must not run")
    }) as typeof collectionRun
    const harness = renderHook({ runCollection })
    const render = await harness.render
    await render.renderOnce()
    await act(async () => {
      harness.get().beginOptionEdit("include")
      harness.get().setEditValue("smoke")
    })
    await render.renderOnce()

    expect(harness.get().canRun).toBe(false)
    await harness.get().run()
    expect(calls).toBe(0)
  })

  it("starts only one run when Run is activated twice before rendering", async () => {
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof collectionRun>>>()
    let calls = 0
    const runCollection = (() => {
      calls++
      return pending.promise
    }) as typeof collectionRun
    const harness = renderHook({ runCollection })
    const render = await harness.render
    await render.renderOnce()

    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    act(() => {
      first = harness.get().run()
      second = harness.get().run()
    })
    expect(calls).toBe(1)
    await act(async () => {
      pending.resolve({
        results: [],
        skipped: [],
        failed: false,
        summary: {
          selected: 0,
          executed: 0,
          skipped: 0,
          requestSuccesses: 0,
          requestFailures: 0,
          assertionPasses: 0,
          assertionFailures: 0,
          captureFailures: 0,
          durationMs: 0,
          failureCategories: [],
        },
      })
      await Promise.all([first, second])
    })
  })
})
