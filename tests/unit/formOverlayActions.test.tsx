import { describe, expect, it } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { CloneRequestOverlay } from "../../src/ui/overlays/CloneRequestOverlay"
import { NewFolderOverlay } from "../../src/ui/overlays/NewFolderOverlay"

describe("form overlay footer actions", () => {
  it("runs Clone Request actions without a separator", async () => {
    let saved = 0
    let closed = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <CloneRequestOverlay
          visible
          initialName="Users - Copy"
          onConfirm={() => saved++}
          onClose={() => closed++}
        />
      </ThemeProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("save"))
    expect(rows[y]).not.toContain("·")
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("save"), y, MouseButtons.LEFT)
      await mockMouse.click(rows[y]!.indexOf("close"), y, MouseButtons.LEFT)
    })
    expect(saved).toBe(1)
    expect(closed).toBe(1)
  })

  it("runs New Folder actions without a separator", async () => {
    let saved = 0
    let closed = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <NewFolderOverlay
          visible
          onConfirm={() => saved++}
          onClose={() => closed++}
        />
      </ThemeProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("save"))
    expect(rows[y]).not.toContain("·")
    await act(async () => {
      await mockMouse.click(rows[y]!.indexOf("save"), y, MouseButtons.LEFT)
      await mockMouse.click(rows[y]!.indexOf("close"), y, MouseButtons.LEFT)
    })
    expect(saved).toBe(1)
    expect(closed).toBe(1)
  })
})
