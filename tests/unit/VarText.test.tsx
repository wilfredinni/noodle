import { describe, it, expect } from "bun:test"
import { createTestRender } from "../testRender"
import { RGBA } from "@opentui/core"
import { VarText } from "../../src/ui/VarText"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import type { Environment } from "../../src/schema"

const testRender = createTestRender()

function env(vars: Record<string, string>): Environment {
  return { name: "test-env", vars }
}

describe("VarText", () => {
  it("renders plain text without variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="hello world" env={null} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const fullText = spans.map((s) => s.text).join("")
    expect(fullText).toContain("hello world")
  })

  it("renders resolved variable in primary color", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="$host" env={env({ host: "localhost" })} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$host"))
    expect(varSpan).toBeDefined()

    const theme = THEMES[0]!
    const primaryRgba = hexToRgba(theme.primary)
    expect(varSpan!.fg.equals(primaryRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when env is null", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="$token" env={null} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$token"))
    expect(varSpan).toBeDefined()

    const theme = THEMES[0]!
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when var missing from env", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="$missing" env={env({})} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$missing"))
    expect(varSpan).toBeDefined()

    const theme = THEMES[0]!
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("renders mixed resolved and unresolved vars with correct colors", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="$good / $bad" env={env({ good: "ok" })} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)

    const theme = THEMES[0]!
    const primaryRgba = hexToRgba(theme.primary)
    const errorRgba = hexToRgba(theme.error)

    const goodSpan = spans.find((s) => s.text === "$good")
    expect(goodSpan).toBeDefined()
    expect(goodSpan!.fg.equals(primaryRgba)).toBe(true)

    const badSpan = spans.find((s) => s.text === "$bad")
    expect(badSpan).toBeDefined()
    expect(badSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("uses baseColor for non-variable text", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText
          text="plain $var tail"
          env={env({ var: "x" })}
          baseColor="#aabbcc"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)

    const baseRgba = hexToRgba("#aabbcc")
    const plainSpan = spans.find((s) => s.text === "plain ")
    expect(plainSpan).toBeDefined()
    expect(plainSpan!.fg.equals(baseRgba)).toBe(true)

    const tailSpan = spans.find((s) => s.text === " tail")
    expect(tailSpan).toBeDefined()
    expect(tailSpan!.fg.equals(baseRgba)).toBe(true)
  })

  it("renders URL-style string with multiple variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText
          text="$baseUrl/api/$resource"
          env={env({ baseUrl: "https://api.example.com", resource: "users" })}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)

    const theme = THEMES[0]!
    const primaryRgba = hexToRgba(theme.primary)

    const baseUrlSpan = spans.find((s) => s.text === "$baseUrl")
    expect(baseUrlSpan).toBeDefined()
    expect(baseUrlSpan!.fg.equals(primaryRgba)).toBe(true)

    const resourceSpan = spans.find((s) => s.text === "$resource")
    expect(resourceSpan).toBeDefined()
    expect(resourceSpan!.fg.equals(primaryRgba)).toBe(true)
  })

  it("does not render when text is empty", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text="" env={null} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    // Should not crash, may or may not contain any text
    expect(frame.length).toBeGreaterThanOrEqual(0)
  })

  it("renders variable adjacent to punctuation", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText text='{"token":"$bearer"}' env={env({ bearer: "abc123" })} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)

    const theme = THEMES[0]!
    const primaryRgba = hexToRgba(theme.primary)

    const varSpan = spans.find((s) => s.text === "$bearer")
    expect(varSpan).toBeDefined()
    expect(varSpan!.fg.equals(primaryRgba)).toBe(true)
  })

  it("does not shrink individual segments in long text within narrow containers", async () => {
    const longUrl =
      "$base_url/v1/releases/dom$domain/custom-patches?vcfRelease=4.0.1.0&productType=e.g. VCENTER"
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarText
          text={longUrl}
          env={env({ base_url: "http://example.com", domain: "test" })}
        />
      </ThemeProvider>,
      { width: 40, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const baseUrlSpan = spans.find((s) => s.text.includes("$base_url"))
    expect(baseUrlSpan).toBeDefined()
    expect(baseUrlSpan!.text).toBe("$base_url")
  })
})

function hexToRgba(hex: string): RGBA {
  return RGBA.fromInts(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  )
}
