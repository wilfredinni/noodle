import { describe, expect, it } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { PaneSplitRenderable } from "../../src/ui/PaneSplit"

describe("PaneSplit", () => {
  it("keeps both stacked panes within the available rows across resize and extreme ratios", async () => {
    const setup = await createTestRenderer({ width: 80, height: 20 })
    try {
      const split = new PaneSplitRenderable(setup.renderer, {
        id: "split",
        width: "100%",
        height: "100%",
        flexDirection: "column",
      })
      const request = new BoxRenderable(setup.renderer, {
        id: "request-pane-slot",
        minHeight: 6,
      })
      const response = new BoxRenderable(setup.renderer, {
        id: "response-pane-slot",
        minHeight: 6,
      })
      split.add(request)
      split.add(response)
      setup.renderer.root.add(split)
      for (const height of [20, 8, 3, 2, 11, 12, 20])
        for (const ratio of [0, 0.1, 0.5, 0.9, 1]) {
          setup.resize(80, height)
          split.splitRatio = ratio
          await setup.renderOnce()
          await setup.renderOnce()
          const minimum = Math.min(6, Math.floor(height / 2))
          expect(request.height).toBeGreaterThanOrEqual(minimum)
          expect(response.height).toBeGreaterThanOrEqual(minimum)
          expect(request.height + response.height).toBe(split.height)
          expect(response.screenY + response.height).toBe(
            split.screenY + split.height,
          )
        }
    } finally {
      setup.renderer.destroy()
    }
  })
})
