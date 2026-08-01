import { describe, expect, it } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { showToast, Toast } from "../../src/ui/Toast"

describe("Toast", () => {
  it("renders above overlays", async () => {
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Toast />
      </ThemeProvider>,
      { width: 40, height: 10 },
    )
    await renderOnce()

    act(() => {
      showToast("Saved")
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("Saved")
    expect(
      renderer.root.getChildren().some((child) => child.zIndex === 10003),
    ).toBe(true)

    act(() => {
      renderer.destroy()
    })
  })
})
