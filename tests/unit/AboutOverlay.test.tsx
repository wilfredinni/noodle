import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { AboutOverlay } from "../../src/ui/overlays/AboutOverlay"
import pkg from "../../package.json" with { type: "json" }

describe("AboutOverlay", () => {
  it("renders Noodle information and links", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <AboutOverlay visible />
      </ThemeProvider>,
      { width: 80, height: 20 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain(`Noodle v${pkg.version}`)
    expect(frame).toContain("Free, open-source REST client")
    expect(frame).toContain("GitHub · Releases")
  })
})
