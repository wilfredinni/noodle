import { describe, expect, it } from "bun:test"
import { createTestRender } from "../testRender"
import { MouseButtons } from "@opentui/core/testing"
import { Frame } from "../../src/ui/Frame"

const testRender = createTestRender()

describe("Frame", () => {
  it("focuses its pane only on a left click", async () => {
    let focusCount = 0
    const { renderOnce, mockMouse } = await testRender(
      <Frame onPaneFocus={() => focusCount++}>
        <text>content</text>
      </Frame>,
      { width: 20, height: 4 },
    )
    await renderOnce()

    await mockMouse.click(1, 0, MouseButtons.RIGHT)
    expect(focusCount).toBe(0)

    await mockMouse.click(1, 0, MouseButtons.LEFT)
    expect(focusCount).toBe(1)
  })
})
