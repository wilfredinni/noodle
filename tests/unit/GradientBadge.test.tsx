import { describe, it, expect } from "bun:test"
import { createTestRender } from "../testRender"
import { RGBA } from "@opentui/core"
import { GradientBadge } from "../../src/ui/GradientBadge"

const testRender = createTestRender()

function rgbaFromHex(hex: string): RGBA {
  return RGBA.fromHex(hex)
}

describe("GradientBadge", () => {
  it("renders text content", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <GradientBadge colors={["#ff0000", "#0000ff"]} fg="#ffffff">
        OK
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("OK")
  })

  it("first char background matches first gradient color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <GradientBadge colors={["#ff0000", "#00ff00", "#0000ff"]} fg="#ffffff">
        ABC
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // left pad + A merge (both bg=#ff0000) → text " A"
    const spanA = allSpans.find((s) => s.text.startsWith(" A"))
    expect(spanA).toBeDefined()
    expect(spanA!.bg.equals(rgbaFromHex("#ff0000"))).toBe(true)
  })

  it("middle char has interpolated color in 3-stop gradient", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <GradientBadge colors={["#ff0000", "#00ff00", "#0000ff"]} fg="#ffffff">
        ABC
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // B at t=0.5 → #00ff00, standalone span (different bg from neighbors)
    const spanB = allSpans.find((s) => s.text === "B")
    expect(spanB).toBeDefined()
    expect(spanB!.bg.equals(rgbaFromHex("#00ff00"))).toBe(true)
  })

  it("last char background matches last gradient color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <GradientBadge colors={["#ff0000", "#00ff00", "#0000ff"]} fg="#ffffff">
        ABC
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // C + right pad merge (both bg=#0000ff) → text "C"
    const spanC = allSpans.find((s) => s.text.includes("C"))
    expect(spanC).toBeDefined()
    expect(spanC!.bg.equals(rgbaFromHex("#0000ff"))).toBe(true)
  })

  it("left padding span uses first color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <GradientBadge colors={["#ff0000", "#00ff00", "#0000ff"]} fg="#ffffff">
        ABC
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // first span = left pad + A merged, starts with space
    const firstSpan = allSpans[0]
    expect(firstSpan).toBeDefined()
    expect(firstSpan!.text.startsWith(" ")).toBe(true)
    expect(firstSpan!.bg.equals(rgbaFromHex("#ff0000"))).toBe(true)
  })

  it("applies foreground color to all spans", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <GradientBadge colors={["#ff0000", "#00ff00", "#0000ff"]} fg="#ff00ff">
        ABC
      </GradientBadge>,
      { width: 20, height: 3 },
    )
    await renderOnce()

    const frame = captureSpans()
    const allSpans = frame.lines.flatMap((l) => l.spans)
    // OpenTUI appends a fill-to-width span with default fg; skip it
    const target = rgbaFromHex("#ff00ff")
    let checked = 0
    for (const span of allSpans) {
      if (span.text.trim() === "" && !span.fg.equals(target)) continue
      expect(span.fg.equals(target)).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })
})
