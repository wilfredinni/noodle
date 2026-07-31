import { describe, expect, it } from "bun:test"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { HintSegment } from "../../src/ui/keybindingHints"

const kb = bindingDefaults()
const emptyHints: HintSegment[] = []

function textPosition(frame: string, text: string): [number, number] {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  return [lines[y].indexOf(text), y]
}

function sidebarHints(): HintSegment[] {
  return getKeybindingHints({
    view: "main",
    focus: "sidebar",
    paneMode: "base",
    collectionMode: "collection",
    overlayActive: false,
    jumpMode: false,
    sendState: { status: "idle" },
    keybinds: kb,
  }).footer
}

describe("StatusBar component", () => {
  it("renders environment label", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })

  it("does not append a dirty marker to environment", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={true}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).not.toContain("dev •")
  })

  it("renders contextual shortcuts when focused on sidebar", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          collectionMode="collection"
          footerHints={sidebarHints()}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("save")
    expect(frame).toContain("new")
    expect(frame).toContain("new folder")
    expect(frame).toContain("delete")
    expect(frame).not.toContain("·")
  })

  it("returns empty contextual shortcuts when overlay is active", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          collectionMode="collection"
          overlayActive={true}
          footerHints={emptyHints}
        />
      </ThemeProvider>,
      { width: 100, height: 3 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).toContain("dev")
  })

  it("activates footer and send hints on left click only", async () => {
    const activated: string[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={[{ key: "^s", word: "save", command: "request.save" }]}
          sendCommand="request.send"
          onHintActivate={(command) => activated.push(command)}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    const [saveX, saveY] = textPosition(frame, "save")
    const [sendX, sendY] = textPosition(frame, "send")
    await mockMouse.click(saveX, saveY, MouseButtons.RIGHT)
    await mockMouse.click(sendX, sendY, MouseButtons.RIGHT)
    expect(activated).toEqual([])

    await mockMouse.click(saveX, saveY, MouseButtons.LEFT)
    await mockMouse.click(sendX, sendY, MouseButtons.LEFT)
    expect(activated).toEqual(["request.save", "request.send"])
  })

  it("leaves a gap between footer hints", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={[
            { key: "^s", word: "save", command: "request.save" },
            { key: "^n", word: "new", command: "request.new" },
          ]}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame.indexOf("^n") - frame.indexOf("save") - 4).toBe(3)
  })

  it("opens the environment editor on left click of the environment", async () => {
    let opened = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          method="GET"
          url="/users"
          isDirty={false}
          sendState={{ status: "idle" }}
          envLabel="dev"
          saveState={{ kind: "idle" }}
          kb={kb}
          footerHints={emptyHints}
          onEnvironmentActivate={() => opened++}
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "dev")
    await mockMouse.click(x, y, MouseButtons.RIGHT)
    expect(opened).toBe(0)

    await mockMouse.click(x, y, MouseButtons.LEFT)
    expect(opened).toBe(1)
  })
})
