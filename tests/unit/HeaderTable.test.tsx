import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { HeaderTable } from "../../src/ui/HeaderTable"
import { THEMES, type Theme } from "../../src/ui/theme"

const theme = THEMES[0]! as Theme

describe("HeaderTable", () => {
  it("renders empty text when no entries exist", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <HeaderTable entries={[]} theme={theme} emptyText="(no headers)" />,
      { width: 40, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const textFound = frame.lines.some((l) =>
      l.spans.some((s) => s.text.includes("(no headers)")),
    )
    expect(textFound).toBe(true)
  })

  it("renders key-value entries in rows", async () => {
    const entries = [
      { key: "Content-Type", value: "application/json" },
      { key: "Authorization", value: "Bearer token123" },
    ]
    const { renderOnce, captureSpans } = await testRender(
      <HeaderTable entries={entries} theme={theme} />,
      { width: 60, height: 10 },
    )
    await renderOnce()
    const frame = captureSpans()
    const keyFound = frame.lines.some((l) =>
      l.spans.some((s) => s.text.includes("Content-Type")),
    )
    const valFound = frame.lines.some((l) =>
      l.spans.some((s) => s.text.includes("application/json")),
    )
    expect(keyFound).toBe(true)
    expect(valFound).toBe(true)
  })
})
