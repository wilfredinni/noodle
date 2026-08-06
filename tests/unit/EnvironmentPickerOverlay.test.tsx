import { describe, expect, it } from "bun:test"
import { act } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { testRender } from "@opentui/react/test-utils"
import { EnvironmentPickerOverlay } from "../../src/ui/overlays/EnvironmentPickerOverlay"
import { ThemeProvider } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"

const environments = ["development", "staging", "production"]

function Picker({
  onSelect = () => {},
}: {
  onSelect?: (name: string) => void
}) {
  return (
    <ThemeProvider activeIndex={0} previewIndex={null}>
      <EnvironmentPickerOverlay
        visible
        environments={environments}
        activeEnvironment="production"
        onSelect={onSelect}
        onClose={() => {}}
      />
    </ThemeProvider>
  )
}

describe("EnvironmentPickerOverlay", () => {
  it("renders environments with the active marker", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <Picker />
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Environments")
    expect(frame).toContain("development")
    expect(frame).toContain("staging")
    expect(frame).toContain("● production")
    expect(frame).not.toContain("⛁")
    cleanup()
  })

  it("filters environments by name", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <Picker />
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("stag")
    })
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("staging")
    expect(frame).not.toContain("development")
    expect(frame).not.toContain("production")
    cleanup()
  })

  it("selects an environment with the mouse", async () => {
    const { keymap, cleanup } = setupKeymap()
    const selected: string[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <Picker onSelect={(name) => selected.push(name)} />
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()

    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("staging"))
    const x = rows[y]!.indexOf("staging")
    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })

    expect(selected).toEqual(["staging"])
    cleanup()
  })

  it("selects an environment with the keyboard", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const selected: string[] = []
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <Picker onSelect={(name) => selected.push(name)} />
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()

    act(() => {
      host.press("up")
      host.press("return")
    })

    expect(selected).toEqual(["staging"])
    cleanup()
  })

  it("shows the empty picker state when no environments exist", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvironmentPickerOverlay
            visible
            environments={[]}
            activeEnvironment={null}
            onSelect={() => {}}
            onClose={() => {}}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("No results found")
    cleanup()
  })
})
