import { describe, expect, it, jest } from "bun:test"
import { act } from "react"
import { ScrollBoxRenderable } from "@opentui/core"
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

  it("keeps meaningful text visible at ten columns", async () => {
    const setup = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Toast />
      </ThemeProvider>,
      { width: 10, height: 30 },
    )
    act(() => showToast("Warning\nLogin failed\nCheck scripts", "warning"))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Login")
  })

  it("keeps the first import warning and overflow accessible in a short terminal", async () => {
    const setup = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <input id="request-url" focused />
        <Toast />
      </ThemeProvider>,
      { width: 40, height: 30 },
    )
    const message = formatCollectionImportMessage(
      ["Login", "Users", "Long".repeat(100), "omitted"].map((name) => ({
        code: "foreign-script-not-converted" as const,
        format: "postman" as const,
        itemPath: ["Demo", name],
        phase: "pre-request",
        message: "",
      })),
    )
    act(() => showToast(message, "warning"))
    act(() => setup.resize(40, 10))
    await setup.renderOnce()
    const toast = setup.renderer.root
      .getChildren()
      .find((child) => child.zIndex === 10003)!
    expect(toast.y).toBeGreaterThanOrEqual(0)
    expect(toast.y + toast.height).toBeLessThanOrEqual(10)
    expect(setup.captureCharFrame()).toContain("Demo / Login")
    expect(toast).toBeInstanceOf(ScrollBoxRenderable)
    const scroll = toast as ScrollBoxRenderable
    await act(async () => {
      await setup.mockMouse.scroll(
        scroll.viewport.x + 1,
        scroll.viewport.y + 1,
        "down",
      )
    })
    await setup.renderOnce()
    expect(scroll.scrollTop).toBeGreaterThan(0)
    await act(async () => {
      const { x, y, height } = scroll.verticalScrollBar
      await setup.mockMouse.pressDown(x, y + height - 1)
      await setup.mockMouse.release(x, y + height - 1)
      scroll.scrollTo(scroll.scrollHeight)
    })
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("and 1 more")
    expect(setup.captureCharFrame()).toContain("converted.")
    expect(setup.renderer.root.findDescendantById("request-url")?.focused).toBe(
      true,
    )
    act(() => showToast(message, "warning"))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Demo / Login")
    act(() => setup.resize(80, 30))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Demo / Login")
    expect(setup.captureCharFrame()).toContain("converted.")
  })

  it("pauses dismissal while reading without taking keyboard focus", async () => {
    const setup = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <input id="request-url" focused />
        <Toast />
      </ThemeProvider>,
      { width: 40, height: 10 },
    )
    jest.useFakeTimers()
    try {
      act(() => showToast("Warning\nLogin failed\nCheck scripts", "warning"))
      await setup.renderOnce()
      const toast = setup.renderer.root
        .getChildren()
        .find((child) => child.zIndex === 10003)!
      await act(async () => {
        await setup.mockMouse.moveTo(toast.x + 3, toast.y + 1)
        await setup.mockMouse.pressDown(toast.x + 3, toast.y + 1)
        await setup.mockMouse.release(toast.x + 3, toast.y + 1)
        jest.advanceTimersByTime(5001)
      })
      await setup.renderOnce()
      expect(setup.captureCharFrame()).toContain("Login failed")
      expect(
        setup.renderer.root.findDescendantById("request-url")?.focused,
      ).toBe(true)
      await act(async () => {
        await setup.mockMouse.moveTo(0, 0)
        jest.advanceTimersByTime(5001)
      })
      await setup.renderOnce()
      expect(setup.captureCharFrame()).not.toContain("Login failed")
    } finally {
      jest.useRealTimers()
    }
  })
})
