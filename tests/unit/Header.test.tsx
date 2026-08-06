import { describe, expect, it } from "bun:test"
import { act } from "react"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { Header } from "../../src/ui/Header"
import { ThemeProvider, THEMES } from "../../src/ui/theme"

function textPosition(frame: string, text: string): [number, number] {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  return [lines[y].indexOf(text), y]
}

describe("Header", () => {
  it("renders the environment at the top right and opens its editor", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            envLabel="development"
            envColor="warning"
            onEnvironmentActivate={() => opened++}
          />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("⛁ development")
    expect(frame.indexOf("⛁ development")).toBeGreaterThan(
      frame.indexOf("Noodle"),
    )
    const iconSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text === "⛁")
    const labelSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("development"))
    expect(iconSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.warning))).toBe(true)
    expect(labelSpan!.fg.equals(RGBA.fromHex(THEMES[0]!.text))).toBe(true)

    const [x, y] = textPosition(frame, "development")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(opened).toBe(1)
  })

  it("opens About on left click of the brand only", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header envLabel="development" onAboutActivate={() => opened++} />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "Noodle")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(opened).toBe(1)
  })

  it("clears the environment hover when it is activated", async () => {
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header envLabel="dev" onEnvironmentActivate={() => {}} />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "dev")
    await act(async () => {
      await mockMouse.moveTo(x, y)
    })
    await renderOnce()

    const hoverColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("dev"))
    expect(hoveredSpan!.bg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()

    const clickedSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("dev"))
    expect(clickedSpan!.bg.equals(hoverColor)).toBe(false)
  })

  it("truncates a long environment instead of crowding the title", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header envLabel="a-very-long-development-environment" />
      </ThemeProvider>,
      { width: 30, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Noodle")
    expect(frame).toContain("⛁ a-very-long-dev…")
  })

  it("keeps the title visible with a wide Unicode environment name", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header envLabel="开发😀development" />
      </ThemeProvider>,
      { width: 20, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Noodle")
    expect(frame).not.toContain("�")
  })
})
