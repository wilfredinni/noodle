import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { act } from "react"
import { createTestRender } from "../testRender"
import { ThemeProvider, opencodeTheme } from "../../src/ui/theme"
import { Overlay } from "../../src/ui/overlays/Overlay"

const testRender = createTestRender()

function OverlayFrame({
  visible,
  onClose = () => {},
}: {
  visible: boolean
  onClose?: () => void
}) {
  return (
    <ThemeProvider activeIndex={0} previewIndex={null}>
      <box
        style={{
          width: "100%",
          height: "100%",
          flexDirection: "column",
        }}
      >
        <box style={{ height: 1, backgroundColor: opencodeTheme.primary }}>
          <text>HEADER</text>
        </box>
        <box
          style={{
            flexGrow: 1,
            backgroundColor: opencodeTheme.primary,
          }}
        >
          <text>CONTENT</text>
        </box>
        <box style={{ height: 1, backgroundColor: opencodeTheme.primary }}>
          <text>FOOTER</text>
        </box>
        <Overlay visible={visible} width={20} padding={1} onClose={onClose}>
          <text>MODAL</text>
        </Overlay>
      </box>
    </ThemeProvider>
  )
}

describe("Overlay", () => {
  it("covers the full renderer, including header and footer", async () => {
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <OverlayFrame visible />,
      { width: 40, height: 10 },
    )

    await renderOnce()

    const frame = captureCharFrame().split("\n")
    const backdrop = renderer.root
      .getChildren()
      .find((child) => child.zIndex === 10000)

    expect(frame[0]).toContain("HEADER")
    expect(frame[9]).toContain("FOOTER")
    expect(backdrop?.x).toBe(0)
    expect(backdrop?.y).toBe(0)
    expect(backdrop?.width).toBe(40)
    expect(backdrop?.height).toBe(10)
  })

  it("renders nothing when hidden", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <OverlayFrame visible={false} />,
      { width: 40, height: 10 },
    )

    await renderOnce()

    expect(captureCharFrame()).not.toContain("MODAL")
  })

  it("closes only on left clicks outside the panel", async () => {
    let closeCount = 0
    const render = await testRender(
      <OverlayFrame visible onClose={() => closeCount++} />,
      { width: 40, height: 10 },
    )

    try {
      await render.renderOnce()
      const backdrop = render.renderer.root
        .getChildren()
        .find((child) => child.zIndex === 10000)
      const panel = backdrop?.getChildren()[0]

      expect(panel).toBeDefined()
      await act(async () => {
        await render.mockMouse.click(panel!.x, panel!.y, MouseButtons.LEFT)
        await render.mockMouse.click(0, 0, MouseButtons.RIGHT)
      })
      expect(closeCount).toBe(0)

      await act(async () => {
        await render.mockMouse.click(0, 0, MouseButtons.LEFT)
      })
      expect(closeCount).toBe(1)
    } finally {
      act(() => render.renderer.destroy())
    }
  })
})
