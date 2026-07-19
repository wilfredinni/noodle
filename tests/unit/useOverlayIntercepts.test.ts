import { describe, expect, it } from "bun:test"
import { shouldCancelSend } from "../../src/ui/useOverlayIntercepts"

describe("shouldCancelSend", () => {
  it("does not cancel a request while an overlay owns escape", () => {
    expect(
      shouldCancelSend("timeline-detail", {
        name: "escape",
        eventType: "press",
      }),
    ).toBe(false)
  })

  it("cancels a request from the unobscured main view", () => {
    expect(
      shouldCancelSend("none", { name: "escape", eventType: "press" }),
    ).toBe(true)
  })
})
