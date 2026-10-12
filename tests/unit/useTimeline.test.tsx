import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
