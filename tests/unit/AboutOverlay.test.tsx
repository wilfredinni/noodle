import { describe, expect, it } from "bun:test"
import { act } from "react"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { AboutOverlay } from "../../src/ui/overlays/AboutOverlay"
import type { UpdateFlowState } from "../../src/ui/appState"
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

  it("renders exact update status copy and colors", async () => {
    const cases: Array<{
      flow: UpdateFlowState
      line: string
      status?: string
      color?: string
    }> = [
      { flow: { phase: "idle" }, line: `Noodle v${pkg.version}` },
      {
        flow: { phase: "up_to_date" },
        line: `Noodle v${pkg.version} ✓`,
        status: "✓",
        color: THEMES[0]!.success,
      },
      {
        flow: { phase: "checking" },
        line: `Noodle v${pkg.version} ⟳ Checking for updates…`,
        status: "Checking for updates",
        color: THEMES[0]!.secondary,
      },
      {
        flow: {
          phase: "downloading",
          version: "v0.7.5",
          installType: "binary",
        },
        line: `Noodle v${pkg.version} ↓ Downloading v0.7.5…`,
        status: "Downloading v0.7.5",
        color: THEMES[0]!.secondary,
      },
      {
        flow: {
          phase: "installing",
          version: "v0.7.5",
          installType: "brew",
        },
        line: `Noodle v${pkg.version} ⚙ Installing v0.7.5…`,
        status: "Installing v0.7.5",
        color: THEMES[0]!.warning,
      },
      {
        flow: { phase: "done", version: "v0.7.5" },
        line: `Noodle v${pkg.version} ↻ Restart to apply v0.7.5`,
        status: "Restart to apply v0.7.5",
        color: THEMES[0]!.warning,
      },
      {
        flow: { phase: "failed", message: "network down" },
        line: `Noodle v${pkg.version} ✕ Update failed`,
        status: "Update failed",
        color: THEMES[0]!.error,
      },
    ]

    for (const testCase of cases) {
      const { renderOnce, captureCharFrame, captureSpans } = await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <AboutOverlay visible updateFlow={testCase.flow} />
        </ThemeProvider>,
        { width: 80, height: 20 },
      )
      await renderOnce()

      const versionLine = captureCharFrame()
        .split("\n")
        .find((line) => line.includes(`Noodle v${pkg.version}`))
      expect(versionLine?.trim()).toBe(testCase.line)
      if (testCase.status && testCase.color) {
        const spans = captureSpans().lines.flatMap((line) => line.spans)
        const statusSpan = spans.find((span) =>
          span.text.includes(testCase.status!),
        )
        expect(statusSpan?.fg.equals(RGBA.fromHex(testCase.color))).toBe(true)
      }
    }
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
