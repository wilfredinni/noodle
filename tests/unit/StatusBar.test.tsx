import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"
import pkg from "../../package.json" with { type: "json" }

describe("StatusBar component", () => {
  it("renders Noodle title and version in footer right section", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={bindingDefaults()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("Noodle")
    expect(frame).toContain(`v${pkg.version}`)
  })

  it("renders branding even on narrow widths", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={bindingDefaults()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("Noodle")
    expect(frame).toContain(`v${pkg.version}`)
  })
})
