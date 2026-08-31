import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { scheduler } from "node:timers/promises"
import { act, useState } from "react"
import { saveTimelineEntry } from "../../src/filestore"
import { useTimeline } from "../../src/ui/timeline/useTimeline"
import { createTestRender } from "../testRender"

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
