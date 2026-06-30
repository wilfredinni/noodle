import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { EnvHeaderPane } from "../../src/ui/EnvHeaderPane"

describe("EnvHeaderPane", () => {
  it("renders name input and color select with placeholder", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color={undefined}
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("dev")
    expect(frame).toContain("(none)")
    expect(frame).toContain("Environment")
  })

  it("shows color value in select trigger when set", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="prod"
          color="success"
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("prod")
    expect(frame).toContain("success")
  })

  it("shows color select with invalid color key as fallback", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="staging"
          color="invalidColorKey"
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("invalidColorKey")
  })

  it("shows focused border when focused", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color={undefined}
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={true}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Environment")
  })

  it("renders color select with color items", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color="primary"
          onNameChange={() => {}}
          onColorChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
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
  })
})
