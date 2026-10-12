import { describe, expect, it, spyOn } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scheduler } from "node:timers/promises"
import { act, useState } from "react"
import {
  saveTimelineEntry,
  loadTimeline,
  loadTimelineBody,
} from "../../src/filestore"
import {
  useTimeline,
  type UseTimelineResult,
} from "../../src/ui/timeline/useTimeline"
import { createTestRender, waitForHookState } from "../testRender"
import {
  useResponse,
  type UseResponseResult,
} from "../../src/hooks/useResponse"
import { executor } from "../../src/requests"
import { buildTimelineEntry } from "../../src/timelineEntry"
import { App } from "../../src/ui/App"
import * as appInner from "../../src/ui/AppInner"
import * as configHooks from "../../src/hooks/useConfig"
import * as secrets from "../../src/secrets"
import { bindingDefaults } from "../../src/ui/keybind"
import * as filestore from "../../src/filestore"

const testRender = createTestRender()

async function waitForText(
  renderOnce: () => Promise<void>,
  captureCharFrame: () => string,
  text: string,
) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    await act(async () => {
      await scheduler.yield()
      await renderOnce()
    })
    if (captureCharFrame().includes(text)) return
  }
  throw new Error(`timed out waiting for ${text}`)
}

describe("useTimeline", () => {
  it("continues the history save queue after a rejected write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-timeline-save-retry-"))
    const entry = {
      timestamp: 1,
      request: {
        id: "request",
        name: "Request",
        method: "GET" as const,
        url: "https://example.com",
        headers: {},
        params: [],
      },
    }
    const failure = new Error("disk full")
    const save = spyOn(filestore, "saveTimelineEntry").mockRejectedValueOnce(
      failure,
    )
    let timeline!: UseTimelineResult
    function Harness() {
      timeline = useTimeline(dir, "request")
      return null
    }
    let render: Awaited<ReturnType<typeof testRender>> | undefined
    try {
      render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await waitForHookState(render, () => !timeline.loading)
      await act(async () => {
        await expect(timeline.appendEntry(entry)).rejects.toBe(failure)
      })
      await act(async () => timeline.appendEntry({ ...entry, timestamp: 2 }))
      expect(timeline.entries.map((entry) => entry.timestamp)).toEqual([2])
      expect(
        (await loadTimeline(dir, "request")).map((entry) => entry.timestamp),
      ).toEqual([2])
    } finally {
      if (render) await act(async () => render!.renderer.destroy())
      save.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("keeps a saved entry when an older history load finishes later", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-timeline-load-race-"))
    const entry = {
      timestamp: 1,
      request: {
        id: "request",
        name: "Request",
        method: "GET" as const,
        url: "https://example.com",
        headers: {},
        params: [],
      },
    }
    await saveTimelineEntry(dir, "request", entry)
    const read = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const originalLoad = filestore.loadTimeline
    let held: Promise<Awaited<ReturnType<typeof originalLoad>>> | undefined
    const load = spyOn(filestore, "loadTimeline").mockImplementationOnce(
      (...args) => {
        held = (async () => {
          const snapshot = await originalLoad(...args)
          read.resolve()
          await release.promise
          return snapshot
        })()
        return held
      },
    )
    let timeline!: UseTimelineResult
    function Harness() {
      timeline = useTimeline(dir, "request")
      return null
    }
    let render: Awaited<ReturnType<typeof testRender>> | undefined
    try {
      render = await act(async () =>
        testRender(<Harness />, { width: 10, height: 3 }),
      )
      await act(async () => read.promise)
      await act(async () => timeline.appendEntry({ ...entry, timestamp: 2 }))
      await act(async () => {
        release.resolve()
        await held
      })
      await waitForHookState(render, () => !timeline.loading)
      expect(timeline.entries.map((entry) => entry.timestamp)).toEqual([2, 1])
    } finally {
      await act(async () => {
        release.resolve()
        await held
        render?.renderer.destroy()
      })
      load.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })

  for (const oldOutcome of ["done", "error"] as const) {
    it(`keeps a late ${oldOutcome} in its original collection after App switches collections`, async () => {
      const dirs = await Promise.all([
        mkdtemp(join(tmpdir(), "noodle-timeline-old-")),
        mkdtemp(join(tmpdir(), "noodle-timeline-new-")),
      ])
      const originalSend = executor.send
      const pending = [
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
        Promise.withResolvers<Awaited<ReturnType<typeof executor.send>>>(),
      ]
      const started = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ]
      let calls = 0
      executor.send = () => {
        const index = calls++
        started[index]!.resolve()
        return pending[index]!.promise
      }
      let manual!: UseResponseResult
      let timeline!: UseTimelineResult
      let switchCollection!: () => void
      let viewDir: string | undefined
      const saves: Promise<void>[] = []
      function View({ dir }: { dir: string }) {
        timeline = useTimeline(dir, "shared")
        const owner = timeline
        manual = useResponse(
          {
            id: "shared",
            name: dir,
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
            timeout: 0,
          },
          undefined,
          (req, result) => {
            saves.push(owner.appendEntry(buildTimelineEntry(req, result)))
          },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          dir,
        )
        return null
      }
      const spies = [
        spyOn(configHooks, "useConfig").mockReturnValue({
          config: {
            theme: "noodle",
            layout: "stacked",
            confirm_undo_all: false,
            collections: dirs,
          },
          updateConfig: () => {},
        }),
        spyOn(secrets, "loadCollectionProxyCredentials").mockResolvedValue({}),
        spyOn(secrets, "loadTlsPassphrases").mockResolvedValue({}),
        spyOn(appInner, "AppInner").mockImplementation((props) => {
          viewDir = props.collectionDir
          switchCollection = () => props.onCollectionChange(dirs[1]!)
          return <View dir={props.collectionDir} />
        }),
      ]
      let render: Awaited<ReturnType<typeof testRender>> | undefined
      try {
        await Promise.all(
          dirs.map((dir) =>
            writeFile(
              join(dir, "settings.yml"),
              "cookies:\n  enabled: false\n",
            ),
          ),
        )
        render = await act(async () =>
          testRender(
            <App
              collectionDir={dirs[0]!}
              envList={[]}
              initialSettings={{ cookies: { enabled: false } }}
              systemProxy={{ bypass: [] }}
              keybinds={bindingDefaults()}
              mode="collection"
            />,
            { width: 10, height: 3 },
          ),
        )
        await waitForHookState(render, () => !timeline.loading)
        await act(async () => manual.trySend())
        await act(async () => started[0]!.promise)
        await act(async () => switchCollection())
        await waitForHookState(
          render,
          () => viewDir === dirs[1] && !timeline.loading,
        )
        await act(async () => manual.trySend())
        await act(async () => started[1]!.promise)
        await act(async () => {
          pending[1]!.resolve({
            status: 200,
            statusText: "OK",
            headers: {},
            body: "new collection",
            timeMs: 1,
          })
          await pending[1]!.promise
        })
        await waitForHookState(render, () => saves.length === 1)
        await act(async () => saves[0])
        await act(async () => {
          if (oldOutcome === "error")
            pending[0]!.reject(new Error("old collection offline"))
          else
            pending[0]!.resolve({
              status: 200,
              statusText: "OK",
              headers: {},
              body: "old collection",
              timeMs: 1,
            })
          await pending[0]!.promise.catch(() => {})
        })
        await waitForHookState(render, () => saves.length === 2)
        await act(async () => Promise.all(saves))
        expect(manual.state).toMatchObject({
          status: "done",
          response: { body: "new collection" },
        })
        expect(timeline.entries.map((entry) => entry.request.name)).toEqual([
          dirs[1]!,
        ])
        const oldHistory = await loadTimeline(dirs[0]!, "shared")
        const newHistory = await loadTimeline(dirs[1]!, "shared")
        expect(oldHistory).toHaveLength(1)
        expect(oldHistory[0]?.request.name).toBe(dirs[0]!)
        expect(oldHistory[0]).toMatchObject(
          oldOutcome === "done"
            ? { response: { body: "old collection" } }
            : { error: { message: "old collection offline" } },
        )
        expect(newHistory).toHaveLength(1)
        expect(newHistory[0]?.request.name).toBe(dirs[1]!)
        expect(newHistory[0]?.response?.body).toBe("new collection")
      } finally {
        await act(async () => {
          manual?.cancelSend()
          for (const deferred of pending)
            deferred.resolve({
              status: 200,
              statusText: "OK",
              headers: {},
              body: "cleanup",
              timeMs: 1,
            })
          await Promise.allSettled(pending.map(({ promise }) => promise))
          await Promise.allSettled(saves)
          render?.renderer.destroy()
        })
        executor.send = originalSend
        for (const spy of spies) spy.mockRestore()
        await Promise.all(
          dirs.map((dir) => rm(dir, { recursive: true, force: true })),
        )
      }
    })
  }

  for (const capturedCallback of [false, true]) {
    it(`saves a completed response under its own request without changing another selection using the ${capturedCallback ? "captured" : "current"} callback`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "noodle-timeline-routing-"))
      const body = "retained response ".repeat(1000)
      const entry = {
        timestamp: 1,
        request: {
          id: "first",
          name: "First",
          method: "GET" as const,
          url: "https://example.com",
          headers: {},
          params: [],
        },
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body,
          timeMs: 1,
          size: body.length,
        },
      }
      let timeline!: UseTimelineResult
      let select!: (id: string) => void
      function Harness() {
        const [id, setId] = useState("first")
        select = setId
        timeline = useTimeline(dir, id)
        return (
          <text>
            {id}:{timeline.loading ? "loading" : "ready"}
          </text>
        )
      }
      try {
        await saveTimelineEntry(dir, "second", {
          ...entry,
          request: { ...entry.request, id: "second" },
          response: undefined,
        })
        const render = await testRender(<Harness />, { width: 30, height: 3 })
        await waitForText(
          render.renderOnce,
          render.captureCharFrame,
          "first:ready",
        )
        const append = timeline.appendEntry
        await act(async () => select("second"))
        await waitForHookState(
          render,
          () =>
            !timeline.loading && timeline.entries[0]?.request.id === "second",
        )
        await act(async () =>
          (capturedCallback ? append : timeline.appendEntry)(entry),
        )
        expect(timeline.entries.map((entry) => entry.request.id)).toEqual([
          "second",
        ])
        const first = await loadTimeline(dir, "first")
        expect(first).toHaveLength(1)
        expect(first[0]?.request.id).toBe("first")
        expect(first[0]?.response?.bodyRef).toBeDefined()
        expect(
          await loadTimelineBody(dir, "first", first[0]!.response!.bodyRef!),
        ).toBe(body)
        expect(
          (await loadTimeline(dir, "second")).map((entry) => entry.request.id),
        ).toEqual(["second"])
        await act(async () => select("first"))
        await waitForHookState(
          render,
          () =>
            !timeline.loading && timeline.entries[0]?.request.id === "first",
        )
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    })
  }

  it("hydrates the newest sidecar response body only when opted in", async () => {
    const dir = await mkdtemp(join(tmpdir(), "noodle-timeline-hook-"))
    const body = JSON.stringify({ hydratedField: "x".repeat(10_050) })
    try {
      const persisted = await saveTimelineEntry(
        dir,
        "request",
        {
          timestamp: 1,
          request: {
            id: "request",
            name: "Request",
            method: "GET",
            url: "https://example.com",
            headers: {},
            params: [],
          },
          response: {
            status: 200,
            statusText: "OK",
            headers: { "x-request-id": "123" },
            body,
            timeMs: 1,
            size: body.length,
          },
        },
        50,
      )
      expect(persisted.response?.body).toBeUndefined()
      expect(persisted.response?.bodyRef).toBeDefined()

      let enableHydration = () => {}
      function Harness() {
        const [hydrate, setHydrate] = useState(false)
        enableHydration = () => setHydrate(true)
        const timeline = useTimeline(dir, "request", 50, hydrate)
        const response = timeline.entries.find(
          (entry) => entry.response,
        )?.response
        return (
          <text>
            {!response
              ? "loading"
              : response.body === body
                ? "hydrated"
                : `sidecar:${response.headers["x-request-id"]}`}
          </text>
        )
      }

      const render = await testRender(<Harness />, { width: 40, height: 4 })
      await waitForText(
        render.renderOnce,
        render.captureCharFrame,
        "sidecar:123",
      )
      await act(async () => enableHydration())
      await waitForText(render.renderOnce, render.captureCharFrame, "hydrated")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
