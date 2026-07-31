import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { Header } from "../../src/ui/Header"
import { ThemeProvider } from "../../src/ui/theme"

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
          ]}
          onHintActivate={(command) => activated.push(command)}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "commands")
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
})
