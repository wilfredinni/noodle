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
  it("activates command hints on left click only", async () => {
    const activated: string[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header
          headerHints={[
            { key: "^p", word: "commands", command: "app.command-palette" },
            { key: "F1", word: "help", command: "app.help" },
          ]}
          onHintActivate={(command) => activated.push(command)}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).not.toContain("·")
    expect(frame.indexOf("F1") - frame.indexOf("commands") - 8).toBe(3)
    const [x, y] = textPosition(frame, "commands")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(activated).toEqual([])

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(activated).toEqual(["app.command-palette"])
  })

  it("opens About on left click of the brand only", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Header headerHints={[]} onAboutActivate={() => opened++} />
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

  it("clears a hint hover when it is activated", async () => {
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Header
            headerHints={[
              { key: "^p", word: "commands", command: "app.command-palette" },
            ]}
            onHintActivate={() => {}}
          />
        </ThemeProvider>,
        { width: 80, height: 1 },
      )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "commands")
    await act(async () => {
      await mockMouse.moveTo(x, y)
    })
    await renderOnce()

    const hoverColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("commands"))
    expect(hoveredSpan!.bg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()

    const clickedSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("commands"))
    expect(clickedSpan!.bg.equals(hoverColor)).toBe(false)
  })
})
