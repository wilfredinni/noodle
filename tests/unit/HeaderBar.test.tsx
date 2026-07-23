import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { HeaderBar } from "../../src/ui/HeaderBar"
import pkg from "../../package.json" with { type: "json" }

describe("HeaderBar", () => {
  it("renders Noodle title and version", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <HeaderBar />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("Noodle")
    expect(frame).toContain(`v${pkg.version}`)
    expect(frame).toContain("change collection")
  })

  it("renders collection name and key hint when provided", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <HeaderBar collectionName="My API Collection" />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("My API Collection")
    expect(frame).toContain("change collection")
    expect(frame).toContain("Noodle")
    expect(frame).toContain(`v${pkg.version}`)
  })
})
