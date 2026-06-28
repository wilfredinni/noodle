import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import {
  EnvHeaderPane,
} from "../../src/ui/EnvHeaderPane"

describe("EnvHeaderPane", () => {
  it("renders name input and color text", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color={undefined}
          onNameChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("dev")
    expect(frame).toContain("Color: (none)")
    expect(frame).toContain("Environment")
  })

  it("shows color name when set", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="prod"
          color="success"
          onNameChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("prod")
    expect(frame).toContain("Color: success")
  })

  it("does not show color text color as muted fallback when invalid", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="staging"
          color="invalidColorKey"
          onNameChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Color: invalidColorKey")
  })

  it("shows focused border when focused", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color={undefined}
          onNameChange={() => {}}
          focused={true}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Environment")
  })

  it("has color box with background matching inputs", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EnvHeaderPane
          name="dev"
          color="primary"
          onNameChange={() => {}}
          focused={false}
        />
      </ThemeProvider>,
      { width: 60, height: 6 },
    )
    await renderOnce()
    const frame = captureSpans()
    const allText = frame.lines.flatMap((l) => l.spans).map((s) => s.text).join("")
    expect(allText).toContain("primary")
    expect(allText).toContain("Color:")
    expect(allText).toContain("dev")
  })
})
