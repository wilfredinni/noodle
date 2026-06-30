import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { CenterText, splitWords } from "../../src/ui/CenterText"

describe("splitWords", () => {
  it("splits single segment into words with trailing space", () => {
    const result = splitWords([{ text: "hello world", color: "#fff" }])
    expect(result).toEqual([
      { text: "hello ", color: "#fff" },
      { text: "world", color: "#fff" },
    ])
  })

  it("preserves isKey highlighting per segment", () => {
    const result = splitWords([
      { text: "press ", color: "#aaa" },
      { text: "Enter", color: "#0f0" },
      { text: " to continue", color: "#aaa" },
    ])
    expect(result).toEqual([
      { text: "press ", color: "#aaa" },
      { text: "Enter ", color: "#0f0" },
      { text: "to ", color: "#aaa" },
      { text: "continue", color: "#aaa" },
    ])
  })

  it("handles single word", () => {
    const result = splitWords([{ text: "hello", color: "#fff" }])
    expect(result).toEqual([{ text: "hello", color: "#fff" }])
  })

  it("handles empty input", () => {
    const result = splitWords([])
    expect(result).toEqual([])
  })

  it("trims trailing space from last word", () => {
    const result = splitWords([
      { text: "tip", color: "#fff" },
      { text: " here", color: "#aaa" },
    ])
    const last = result[result.length - 1]
    expect(last.text).not.toMatch(/ $/)
  })
})

describe("CenterText", () => {
  it("renders words as inline text elements in a row", async () => {
    const segments = [{ text: "hello world", color: "#ffffff" }]
    const { renderOnce, captureSpans } = await testRender(
      <CenterText segments={segments} />,
      { width: 40, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const fullText = spans.map((s) => s.text).join("")
    expect(fullText).toContain("hello ")
    expect(fullText).toContain("world")
  })

  it("renders multiple segments with different colors", async () => {
    const segments = [
      { text: "press ", color: "#aaa" },
      { text: "Enter", color: "#0f0" },
      { text: " to continue", color: "#aaa" },
    ]
    const { renderOnce, captureSpans } = await testRender(
      <CenterText segments={segments} />,
      { width: 60, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const fullText = spans.map((s) => s.text).join("")
    expect(fullText).toContain("press Enter to continue")
  })

  it("renders centered in the available width", async () => {
    const segments = [{ text: "tip", color: "#fff" }]
    const { renderOnce, captureCharFrame } = await testRender(
      <CenterText segments={segments} />,
      { width: 20, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    const lines = frame.split("\n").filter((l) => l.trim().length > 0)
    const nonEmpty = lines[0]
    expect(nonEmpty?.trim()).toBe("tip")
    // tip should be roughly centered (padded with spaces on both sides)
    expect(nonEmpty?.startsWith(" ")).toBe(true)
  })

  it("handles empty segments", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <CenterText segments={[]} />,
      { width: 40, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    expect(frame.lines.length).toBeGreaterThanOrEqual(0)
  })
})
