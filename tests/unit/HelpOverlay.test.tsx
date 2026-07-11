import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { HelpOverlay } from "../../src/ui/HelpOverlay"
import { bindingDefaults } from "../../src/ui/keybind"

describe("HelpOverlay", () => {
  it("keeps spacing between long key hints and descriptions", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <HelpOverlay visible keybinds={bindingDefaults()} />
      </ThemeProvider>,
      { width: 80, height: 30 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("^alt+e          Edit YAML")
  })
})
