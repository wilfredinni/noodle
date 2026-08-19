import { describe, it, expect } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { ConfirmOverlay } from "../../src/ui/overlays/ConfirmOverlay"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

describe("Delete confirmation", () => {
  it("ConfirmOverlay shows delete environment message", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message='Delete environment "staging"?' />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Delete environment")
    expect(frame).toContain("staging")
    expect(frame).toContain("Confirm")
    expect(frame).toContain("y")
    expect(frame).toContain("n")
    cleanup()
  })

  it("ConfirmOverlay returns null when visible is false", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible={false}
            message='Delete environment "staging"?'
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).not.toContain("Delete environment")
    cleanup()
  })

  it("ConfirmOverlay shows Y and N with labels", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message="Delete?" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Confirm")
    expect(frame).toContain("cancel")
    cleanup()
  })

  it("renders esc hint", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay visible message="Delete?" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("esc")
    cleanup()
  })

  it("runs confirm and cancel callbacks when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    let confirmed = 0
    let cancelled = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ConfirmOverlay
            visible
            message="Delete?"
            onConfirm={() => confirmed++}
            onCancel={() => cancelled++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("confirm"))
    expect(rows[y]).not.toContain("·")
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("confirm"), y, MouseButtons.LEFT)
      await mockMouse.click(rows[y]!.indexOf("cancel"), y, MouseButtons.LEFT)
    })
    expect(confirmed).toBe(1)
    expect(cancelled).toBe(1)
    cleanup()
  })
})
