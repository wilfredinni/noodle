import { describe, expect, it } from "bun:test"
import { act } from "react"
import { RGBA } from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import { StatusBar } from "../../src/ui/StatusBar"
import { bindingDefaults } from "../../src/ui/keybind"
import { getKeybindingHints } from "../../src/ui/keybindingHints"
import type { HintSegment } from "../../src/ui/keybindingHints"

const testRender = createTestRender()
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
  it("keeps cookie storage warnings visible", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={sidebarHints()}
          cookieStatus={{
            state: "plaintext-warning",
            warning: "Cookie storage is plaintext.",
          }}
        />
      </ThemeProvider>,
      { width: 100, height: 1 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("cookies plaintext")
  })

  it("renders three contextual actions, Commands, and pinned Send", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={sidebarHints()}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 140, height: 1 },
    )

    await renderOnce()
    const frame = captureCharFrame()

    expect(frame).not.toContain("SIDEBAR")
    expect(frame).toContain("new folder")
    expect(frame).toContain("clone")
    expect(frame).toContain("commands")
    expect(frame).toContain("send")
    expect(frame).not.toContain("delete")
    expect(frame).not.toContain("save")
    expect(frame).not.toContain("jump")
    expect(frame).not.toContain("help")
    expect(frame.indexOf("send")).toBeGreaterThan(frame.indexOf("commands"))
  })

  it("replaces the footer with transient overlay and jump instructions", async () => {
    const overlay = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          overlayActive={true}
          globalHints={[{ key: "Esc", word: "close" }]}
          footerHints={sidebarHints()}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 120, height: 1 },
    )
    await overlay.renderOnce()
    const overlayFrame = overlay.captureCharFrame()
    expect(overlayFrame).toContain("Esc")
    expect(overlayFrame).toContain("close")
    expect(overlayFrame).not.toContain("SIDEBAR")
    expect(overlayFrame).not.toContain("send")

    const jump = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          jumpMode={true}
          globalHints={[
            { key: "Type key", word: "to jump" },
            { key: "Esc", word: "dismiss" },
          ]}
          footerHints={sidebarHints()}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 120, height: 1 },
    )
    await jump.renderOnce()
    const jumpFrame = jump.captureCharFrame()
    expect(jumpFrame).toContain("Type key")
    expect(jumpFrame).toContain("to jump")
    expect(jumpFrame).toContain("Esc")
    expect(jumpFrame).toContain("dismiss")
    expect(jumpFrame).not.toContain("SIDEBAR")
    expect(jumpFrame).not.toContain("send")
  })

  it("activates contextual, Commands, and Send actions on left click only", async () => {
    const activated: string[] = []
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[
            { key: "^s", word: "save", command: "request.save" },
            { key: "^d", word: "revert", command: "browse.delete" },
            { key: "^r", word: "revert all", command: "browse.revert-all" },
            { key: "f2", word: "expand", command: "request.expand-toggle" },
          ]}
          sendCommand="request.send"
          onHintActivate={(command) => activated.push(command)}
        />
      </ThemeProvider>,
      { width: 140, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    const [saveX, saveY] = textPosition(frame, "save")
    const [commandsX, commandsY] = textPosition(frame, "commands")
    const [sendX, sendY] = textPosition(frame, "send")
    await mockMouse.click(saveX, saveY, MouseButtons.RIGHT)
    await mockMouse.click(commandsX, commandsY, MouseButtons.RIGHT)
    await mockMouse.click(sendX, sendY, MouseButtons.RIGHT)
    expect(activated).toEqual([])

    await mockMouse.click(saveX, saveY, MouseButtons.LEFT)
    await mockMouse.click(commandsX, commandsY, MouseButtons.LEFT)
    await mockMouse.click(sendX, sendY, MouseButtons.LEFT)
    expect(activated).toEqual([
      "request.save",
      "app.command-palette",
      "request.send",
    ])
  })

  it("uses key-only hints on compact terminals", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[
            { key: "Space", word: "toggle" },
            { key: "^d", word: "revert" },
            { key: "^s", word: "save" },
            { key: "^r", word: "revert all" },
          ]}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 80, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("Space")
    expect(frame).toContain("^d")
    expect(frame).toContain("^s")
    expect(frame).toContain("^p")
    expect(frame).not.toContain("toggle")
    expect(frame).not.toContain("commands")
    expect(frame).toContain("send")
  })

  it("keeps Commands and Send on narrow terminals", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[
            { key: "Space", word: "toggle" },
            { key: "^d", word: "revert" },
            { key: "^s", word: "save" },
            { key: "^r", word: "revert all" },
          ]}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 50, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("^p")
    expect(frame).toContain("send")
  })

  it("pins pane expand at the left edge when contextual actions overflow", async () => {
    const footerHints = getKeybindingHints({
      view: "main",
      focus: "response",
      paneMode: "base",
      collectionMode: "collection",
      overlayActive: false,
      jumpMode: false,
      tab: "body",
      sendState: {
        status: "done",
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          timeMs: 10,
        },
      },
      responseBodyEditorAvailable: true,
      keybinds: kb,
    }).footer
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={footerHints}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 50, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("f2")
    expect(frame.indexOf("f2")).toBeLessThan(frame.indexOf("^g"))
    expect(frame.indexOf("f2")).toBeLessThan(frame.indexOf("^return"))
  })

  it("keeps pane expand intact when the terminal cannot also fit Send", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[
            { key: "f2", word: "expand", command: "request.expand-toggle" },
          ]}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 20, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("f2 expand")
    expect(frame).not.toContain("^return")
    expect(frame).not.toContain("send")
  })

  it("keeps Commands visible on sparse Response tabs", async () => {
    const footerHints = getKeybindingHints({
      view: "main",
      focus: "response",
      paneMode: "base",
      collectionMode: "collection",
      overlayActive: false,
      jumpMode: false,
      tab: "headers",
      sendState: {
        status: "done",
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          timeMs: 10,
        },
      },
      keybinds: kb,
    }).footer
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={footerHints}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 120, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("f2")
    expect(frame).toContain("commands")
    expect(frame).toContain("send")
  })

  it("shows Commands in browse and empty collection modes", async () => {
    const activated: string[] = []

    for (const collectionMode of ["browse", "empty"] as const) {
      const { renderer, renderOnce, captureCharFrame, mockMouse } =
        await testRender(
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <StatusBar
              kb={kb}
              collectionMode={collectionMode}
              globalHints={emptyHints}
              footerHints={emptyHints}
              onHintActivate={(command) => activated.push(command)}
            />
          </ThemeProvider>,
          { width: 120, height: 1 },
        )
      await renderOnce()

      const frame = captureCharFrame()
      expect(frame).toContain("commands")
      const [x, y] = textPosition(frame, "commands")
      await mockMouse.click(x, y, MouseButtons.LEFT)
      act(() => renderer.destroy())
    }

    expect(activated).toEqual(["app.command-palette", "app.command-palette"])
  })

  it("adds Commands when width fitting hides one of three actions", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[
            { key: "Space", word: "toggle" },
            { key: "^d", word: "revert" },
            { key: "^s", word: "save" },
          ]}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 30, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("^p")
    expect(frame).toContain("send")
    expect(["Space", "^d", "^s"].some((key) => !frame.includes(key))).toBe(true)
  })

  it("renders environment hints without a pinned right-side action", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          view="env-editor"
          globalHints={emptyHints}
          footerHints={[{ key: "^s", word: "save" }]}
        />
      </ThemeProvider>,
      { width: 120, height: 1 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("save")
    expect(frame).not.toContain("commands")
    expect(frame).not.toContain("send")
  })

  it("uses the previous plain shortcut styling for actions and Send", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <StatusBar
          kb={kb}
          globalHints={emptyHints}
          footerHints={[{ key: "^s", word: "save" }]}
          sendCommand="request.send"
        />
      </ThemeProvider>,
      { width: 120, height: 1 },
    )
    await renderOnce()

    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const shortcut = spans.find((span) => span.text.includes("^s"))!
    const send = spans.find((span) => span.text.includes("send"))!
    expect(shortcut.bg.equals(send.bg)).toBe(true)
    expect(shortcut.fg.equals(RGBA.fromHex(THEMES[0]!.text))).toBe(true)
    expect(send.fg.equals(RGBA.fromHex(THEMES[0]!.textMuted))).toBe(true)
  })

  it("clears a hint hover when it is activated", async () => {
    const { renderOnce, captureCharFrame, captureSpans, mockMouse } =
      await testRender(
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <StatusBar
            kb={kb}
            globalHints={emptyHints}
            footerHints={[{ key: "^s", word: "save", command: "request.save" }]}
            onHintActivate={() => {}}
          />
        </ThemeProvider>,
        { width: 120, height: 1 },
      )
    await renderOnce()

    const [x, y] = textPosition(captureCharFrame(), "save")
    await act(async () => {
      await mockMouse.moveTo(x, y)
    })
    await renderOnce()

    const hoverColor = RGBA.fromHex(THEMES[0]!.backgroundElement)
    const hoveredSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("save"))
    expect(hoveredSpan!.bg.equals(hoverColor)).toBe(true)

    await act(async () => {
      await mockMouse.click(x, y, MouseButtons.LEFT)
    })
    await renderOnce()

    const clickedSpan = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("save"))
    expect(clickedSpan!.bg.equals(hoverColor)).toBe(false)
  })
})
