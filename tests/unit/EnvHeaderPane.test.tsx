import { describe, it, expect } from "bun:test"
import { act, useState } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvHeaderPane } from "../../src/ui/env-editor/EnvHeaderPane"
import { setupKeymap } from "./_helpers"

describe("EnvHeaderPane", () => {
  it("renders name input and color select with placeholder", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="dev"
            color={undefined}
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("dev")
    expect(frame).toContain("(none)")
    expect(frame).not.toContain("Environment")
    cleanup()
  })

  it("shows color value in select trigger when set", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="prod"
            color="success"
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("prod")
    expect(frame).toContain("success")
    cleanup()
  })

  it("renders placeholder in color select when value has no matching item", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="staging"
            color="invalidColorKey"
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("staging")
    expect(frame).toContain("Select...")
    cleanup()
  })

  it("renders when focused without a pane title", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="dev"
            color={undefined}
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("dev")
    expect(frame).not.toContain("Environment")
    cleanup()
  })

  it("renders color select with color items", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="dev"
            color="primary"
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureSpans()
    const allText = frame.lines
      .flatMap((l) => l.spans)
      .map((s) => s.text)
      .join("")
    expect(allText).toContain("primary")
    expect(allText).toContain("dev")
    cleanup()
  })

  it("shows name and color jump badges in jump mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureSpans } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="dev"
            color={undefined}
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
            jumpMode
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    expect(spans.map((span) => span.text)).toContain("m")
    expect(spans.map((span) => span.text)).toContain("c")
    cleanup()
  })

  it("opens the color menu when clicked", async () => {
    const { keymap, cleanup } = setupKeymap()
    function Harness() {
      const [focused, setFocused] = useState(false)
      return (
        <EnvHeaderPane
          name="dev"
          color={undefined}
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={focused}
          onPaneFocus={() => setFocused(true)}
        />
      )
    }

    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <Harness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 16 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(50, 1, MouseButtons.LEFT)
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("primary")
    cleanup()
  })

  it("reports color focus when the color select is activated", async () => {
    const { keymap, cleanup } = setupKeymap()
    let colorFocused = false
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <EnvHeaderPane
            name="dev"
            color={undefined}
            onNameChange={() => {}}
            onColorChange={() => {}}
            focused={false}
            onColorFocus={() => {
              colorFocused = true
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 60, height: 16 },
    )
    await renderOnce()

    await act(async () => {
      await mockMouse.click(50, 1, MouseButtons.LEFT)
    })

    expect(colorFocused).toBe(true)
    cleanup()
  })
})
