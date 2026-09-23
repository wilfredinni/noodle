import { describe, expect, it } from "bun:test"
import { act } from "react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { showToast, Toast } from "../../src/ui/Toast"
import { formatCollectionImportMessage } from "../../src/ui/collectionImport"

const testRender = createTestRender()

describe("Toast", () => {
  it("keeps import warning locations and phases visible when resized", async () => {
    const { renderOnce, captureCharFrame, renderer, resize } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Toast />
      </ThemeProvider>,
      { width: 80, height: 30 },
    )
    await renderOnce()
    act(() =>
      showToast(
        formatCollectionImportMessage([
          {
            code: "foreign-script-not-converted",
            format: "postman",
            itemPath: ["Demo", "Login"],
            phase: "pre-request",
            message: "",
          },
          {
            code: "foreign-script-not-converted",
            format: "insomnia",
            itemPath: ["Demo", "Users"],
            phase: "after-response",
            message: "",
          },
          {
            code: "foreign-script-not-converted",
            format: "postman",
            itemPath: ["Long".repeat(100)],
            phase: "test",
            message: "",
          },
          {
            code: "foreign-script-not-converted",
            format: "postman",
            itemPath: ["omitted"],
            phase: "test",
            message: "",
          },
        ]),
        "warning",
      ),
    )
    for (const width of [80, 40, 10, 80]) {
      act(() => resize(width, 30))
      await renderOnce()
      const frame = captureCharFrame()
      if (width >= 40) {
        expect(frame).toContain("Demo / Login (pre-request)")
        expect(frame).toContain("after-response")
        expect(frame).toContain("and 1 more")
        expect(frame).toContain("converted.")
      }
      const toast = renderer.root
        .getChildren()
        .find((child) => child.zIndex === 10003)!
      expect(toast.x).toBeGreaterThanOrEqual(0)
      expect(toast.x + toast.width).toBeLessThanOrEqual(width)
    }
  })

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
