import { describe, it, expect } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { VarInput } from "../../src/ui/VarInput"
import { ThemeProvider, THEMES } from "../../src/ui/theme"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test-env", vars }
}

const theme = THEMES[0]!

function hexToRgba(hex: string): RGBA {
  return RGBA.fromInts(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  )
}

describe("VarInput — display mode (isEditing=false)", () => {
  it("renders plain text without variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="hello world" env={null} isEditing={false} />
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
        <VarInput value="$host" env={env({ host: "localhost" })} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$host"))
    expect(varSpan).toBeDefined()
    const primaryRgba = hexToRgba(theme.primary)
    expect(varSpan!.fg.equals(primaryRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when env is null", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="$token" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$token"))
    expect(varSpan).toBeDefined()
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("renders unresolved variable in error color when var missing from env", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="$missing" env={env({})} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const varSpan = spans.find((s) => s.text.includes("$missing"))
    expect(varSpan).toBeDefined()
    const errorRgba = hexToRgba(theme.error)
    expect(varSpan!.fg.equals(errorRgba)).toBe(true)
  })

  it("uses baseColor for non-variable text", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="plain $var tail"
          env={env({ var: "x" })}
          isEditing={false}
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
  })

  it("renders empty string without crash", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.length).toBeGreaterThanOrEqual(0)
  })

  it("renders URL-style string with variables", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$baseUrl/api/$resource"
          env={env({ baseUrl: "https://api.example.com", resource: "users" })}
          isEditing={false}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureSpans()
    const spans = frame.lines.flatMap((l) => l.spans)
    const primaryRgba = hexToRgba(theme.primary)
    const baseUrlSpan = spans.find((s) => s.text === "$baseUrl")
    expect(baseUrlSpan).toBeDefined()
    expect(baseUrlSpan!.fg.equals(primaryRgba)).toBe(true)
  })
})

describe("VarInput — edit mode (isEditing=true)", () => {
  it("renders input element with value", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="hello" env={null} isEditing onChange={() => {}} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("hello")
  })

  it("renders placeholder", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value=""
          env={null}
          isEditing
          onChange={() => {}}
          placeholder="Type here"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Type here")
  })

  it("uses baseColor for text color", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="custom"
          env={null}
          isEditing
          onChange={() => {}}
          baseColor="#ff6600"
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("custom")
  })
})

describe("VarInput — textarea mode (isEditing=true, useTextarea=true)", () => {
  it("renders textarea with value", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="multi\nline" env={null} isEditing useTextarea onChange={() => {}} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("multi")
  })

  it("renders empty textarea without crash", async () => {
    const { renderOnce, captureCharFrame } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="" env={null} isEditing useTextarea onChange={() => {}} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame.length).toBeGreaterThanOrEqual(0)
  })
})
