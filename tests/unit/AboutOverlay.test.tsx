import { describe, expect, it } from "bun:test"
import { act } from "react"
import { type BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { AboutOverlay } from "../../src/ui/overlays/AboutOverlay"
import pkg from "../../package.json" with { type: "json" }

const testRender = createTestRender()

describe("AboutOverlay", () => {
  it("renders Noodle information and links", async () => {
    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <AboutOverlay visible />
      </ThemeProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("About")
    expect(frame).toContain(`Noodle v${pkg.version}`)
    expect(frame).toContain("Free, open-source REST client")
    expect(frame).toContain("GitHub")
    expect(frame).toContain("Releases")
    expect(renderer.root.findDescendantById("about-title")).toBeDefined()
  })

  it("opens links from a left click", async () => {
    let opened = ""
    const { renderOnce, renderer, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <AboutOverlay
          visible
          onOpenLink={(href) => {
            opened = href
          }}
        />
      </ThemeProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()
    const link = renderer.root.findDescendantById(
      "about-link-github",
    ) as BoxRenderable

    await act(async () => {
      await mockMouse.click(
        link.screenX + Math.floor(link.width / 2),
        link.screenY,
        MouseButtons.LEFT,
      )
    })

    expect(opened).toBe("https://github.com/wilfredinni/noodle")
  })
})
