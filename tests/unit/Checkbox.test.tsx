import { describe, it, expect } from "bun:test"
import { createTestRender } from "../testRender"
import { RGBA } from "@opentui/core"
import { Checkbox } from "../../src/ui/Checkbox"
import { THEMES, type Theme } from "../../src/ui/theme"

const testRender = createTestRender()

const theme = THEMES[0]! as Theme

describe("Checkbox", () => {
  it("renders [x] in primary color when checked", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <Checkbox checked={true} theme={theme} />,
      { width: 20, height: 3 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const cb = spans.find((s) => s.text.includes("[x]"))
    expect(cb).toBeDefined()
    const primary = RGBA.fromHex(theme.primary)
    expect(cb!.fg).toEqual(primary)
  })

  it("renders [ ] in muted color when not checked", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <Checkbox checked={false} theme={theme} />,
      { width: 20, height: 3 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const cb = spans.find((s) => s.text.includes("[ ]"))
    expect(cb).toBeDefined()
    const muted = RGBA.fromHex(theme.textMuted)
    expect(cb!.fg).toEqual(muted)
  })
})
