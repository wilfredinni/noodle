import { describe, expect, it } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { EscapeClose } from "../../src/ui/overlays/EscapeClose"

const testRender = createTestRender()

describe("EscapeClose", () => {
  it("closes when clicked", async () => {
    let closed = false
    const { renderOnce, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EscapeClose onClose={() => (closed = true)} />
      </ThemeProvider>,
      { width: 10, height: 2 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(0, 0, MouseButtons.LEFT)
    })
    expect(closed).toBe(true)
  })
})
