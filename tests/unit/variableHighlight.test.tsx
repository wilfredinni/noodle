import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { act, useState } from "react"
import { ThemeProvider } from "../../src/ui/theme"
import { VarInput } from "../../src/ui/VarInput"
import type { Environment } from "../../src/schema"

function env(vars: Record<string, string>): Environment {
  return { name: "test", vars }
}

function hexToRgba(hex: string): RGBA {
  return RGBA.fromInts(
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  )
}

describe("variableHighlight", () => {
  it("highlights multiple variables on different display lines", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$host\n$port"
          env={env({ host: "localhost", port: "8080" })}
          isEditing={false}
        />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const hostSpan = spans.find((s) => s.text.includes("$host"))
    const portSpan = spans.find((s) => s.text.includes("$port"))
    expect(hostSpan).toBeDefined()
    expect(portSpan).toBeDefined()
  })

  it("highlights resolved and missing variables correctly in same content", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$host $missing"
          env={env({ host: "localhost" })}
          isEditing={false}
        />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const hostSpan = spans.find((s) => s.text.includes("$host"))
    const missingSpan = spans.find((s) => s.text.includes("$missing"))
    expect(hostSpan).toBeDefined()
    expect(missingSpan).toBeDefined()
    const t = await import("../../src/ui/theme")
    expect(hostSpan!.fg.equals(hexToRgba(t.THEMES[0]!.primary))).toBe(true)
    expect(missingSpan!.fg.equals(hexToRgba(t.THEMES[0]!.error))).toBe(true)
  })

  it("shows all variables as missing when env is null", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="$var1 $var2" env={null} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const var1 = spans.find((s) => s.text.includes("$var1"))
    const var2 = spans.find((s) => s.text.includes("$var2"))
    expect(var1).toBeDefined()
    expect(var2).toBeDefined()
    const t = await import("../../src/ui/theme")
    expect(var1!.fg.equals(hexToRgba(t.THEMES[0]!.error))).toBe(true)
    expect(var2!.fg.equals(hexToRgba(t.THEMES[0]!.error))).toBe(true)
  })

  it("does not highlight dollar sign without following word chars", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput value="price $5 and $" env={env({})} isEditing={false} />
      </ThemeProvider>,
      { width: 80, height: 5 },
    )
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const resolved = spans.filter((s) => s.fg.equals(hexToRgba("#7fd88f")))
    const error = spans.filter((s) => s.fg.equals(hexToRgba("#e06c75")))
    expect(resolved).toHaveLength(0)
    expect(error).toHaveLength(0)
  })

  it("highlights variables in edit mode with textarea", async () => {
    let setValue = (_v: string) => {}
    function Harness() {
      const [value, setVal] = useState("$host\n$port")
      setValue = (v: string) => setVal(v)
      return (
        <VarInput
          value={value}
          env={env({ host: "localhost", port: "8080" })}
          isEditing
          useTextarea
          onChange={setVal}
        />
      )
    }
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <Harness />
      </ThemeProvider>,
      { width: 80, height: 8 },
    )
    await renderOnce()
    await renderOnce()
    await act(async () => {
      setValue("$host\n$port")
    })
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const hostSpan = spans.find((s) => s.text.includes("$host"))
    const portSpan = spans.find((s) => s.text.includes("$port"))
    expect(hostSpan).toBeDefined()
    expect(portSpan).toBeDefined()
  })

  it("highlights a path token before query parameters in edit mode", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="$base_url/v1/nsx-alb-clusters/:id?forceDelete=false"
          env={env({ base_url: "https://api.example.com" })}
          isEditing
          pathParams={[{ name: "id", value: "cluster-123", enabled: true }]}
        />
      </ThemeProvider>,
      { width: 100, height: 5 },
    )
    await renderOnce()
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const pathSpan = spans.find((s) => s.text.includes(":id"))
    expect(pathSpan).toBeDefined()
    const t = await import("../../src/ui/theme")
    expect(pathSpan!.fg.equals(hexToRgba(t.THEMES[0]!.primary))).toBe(true)
  })

  it("does not highlight a path-like query-string value in edit mode", async () => {
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <VarInput
          value="https://api.example.com/search?redirect=/:id?next=true"
          env={env({})}
          isEditing
          pathParams={[{ name: "id", value: "42", enabled: true }]}
        />
      </ThemeProvider>,
      { width: 100, height: 5 },
    )
    await renderOnce()
    await renderOnce()
    const spans = captureSpans().lines.flatMap((l) => l.spans)
    const pathSpan = spans.find((s) => s.text.includes(":id"))
    expect(pathSpan).toBeDefined()
    const t = await import("../../src/ui/theme")
    expect(pathSpan!.fg.equals(hexToRgba(t.THEMES[0]!.text))).toBe(true)
  })
})
