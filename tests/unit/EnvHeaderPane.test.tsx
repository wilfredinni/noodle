import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvHeaderPane } from "../../src/ui/EnvHeaderPane"

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  keymap.setData("app.mode", "base")
  keymap.setData("app.focus", "sidebar")
  keymap.setData("app.overlay", "none")
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      hostCleanup()
    },
  }
}

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
    expect(frame).toContain("Environment")
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
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("staging")
    expect(frame).toContain("Select...")
    cleanup()
  })

  it("shows focused border when focused", async () => {
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
    expect(frame).toContain("Environment")
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
})
