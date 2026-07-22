import { act, useState } from "react"
import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { ThemeProvider, THEMES } from "../src/ui/theme"
import { JsonBodyViewer } from "../src/ui/editor/JsonBodyViewer"

describe("JsonBodyViewer", () => {
  it("keeps JSON syntax highlighting when variables make raw JSON invalid", async () => {
    const theme = THEMES[0]!
    const { renderOnce, captureCharFrame, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <JsonBodyViewer
          body={
            '{\n  "title": "my album",\n  "userId": $user_id,\n  "test": "$base_url"\n}'
          }
          theme={theme}
          activeEnv={{
            name: "production",
            vars: { user_id: "42", base_url: "https://example.com" },
          }}
        />
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    await renderOnce()

    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const key = spans.find((span) => span.text.includes("title"))
    const title = spans.find((span) => span.text.includes("my album"))

    expect(key?.fg.equals(RGBA.fromHex(theme.secondary))).toBe(true)
    expect(title).toBeDefined()
    expect(title!.fg.equals(RGBA.fromHex(theme.success))).toBe(true)
    expect(captureCharFrame()).toContain("$user_id")
  })

  it("keeps native colors aligned after multiple JSON lines", async () => {
    const theme = THEMES[0]!
    const body = `{
  "first": "value",
  "second": $resolved,
  "third": false,
  "fourth": null,
  "fifth": 42
}`
    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <JsonBodyViewer
          body={body}
          theme={theme}
          activeEnv={{ name: "production", vars: { resolved: "yes" } }}
        />
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    const spans = captureSpans().lines.flatMap((line) => line.spans)
    const spanFor = (text: string) =>
      spans.find((span) => span.text.includes(text))

    expect(spanFor("first")?.fg.equals(RGBA.fromHex(theme.secondary))).toBe(
      true,
    )
    expect(spanFor("value")?.fg.equals(RGBA.fromHex(theme.success))).toBe(true)
    expect(spanFor("second")?.fg.equals(RGBA.fromHex(theme.secondary))).toBe(
      true,
    )
    expect(spanFor("resolved")?.fg.equals(RGBA.fromHex(theme.primary))).toBe(
      true,
    )
    expect(spanFor("false")?.fg.equals(RGBA.fromHex(theme.info))).toBe(true)
    expect(spanFor("null")?.fg.equals(RGBA.fromHex(theme.info))).toBe(true)
    expect(spanFor("42")?.fg.equals(RGBA.fromHex(theme.warning))).toBe(true)
  })

  it("handles large JSON payloads (>200KB) in JsonBodyViewer without freezing or errors", async () => {
    const theme = THEMES[0]!
    const item =
      '    {\n      "id": "1288d7d4-3c95-4dbe-9d74-c34977478ee8",\n      "status": "completed"\n    }'
    const items = new Array(3000).fill(item).join(",\n")
    const largeBody = `{\n  "results": [\n${items}\n  ]\n}`

    const { renderOnce, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <JsonBodyViewer body={largeBody} theme={theme} />
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    // Wait for chunked async highlights to complete
    await new Promise((resolve) => setTimeout(resolve, 50))
    await renderOnce()
    await act(async () => renderer.destroy())
  })

  it("preserves string highlighting across large raw-body chunks", async () => {
    const theme = THEMES[0]!
    const body = `{"payload":"${"a".repeat(1024 * 1024)}"}`
    const scrollRef = { current: null as ScrollBoxRenderable | null }
    const { renderOnce, captureSpans, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <scrollbox ref={scrollRef} style={{ height: 10 }}>
          <JsonBodyViewer body={body} theme={theme} />
        </scrollbox>
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    await act(async () => {
      scrollRef.current!.scrollTop = 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      await renderOnce()
    })
    const stringPart = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("a"))
    expect(stringPart?.fg.equals(RGBA.fromHex(theme.success))).toBe(true)
    await act(async () => renderer.destroy())
  })

  it("renders the scrolled window for large bodies", async () => {
    const theme = THEMES[0]!
    const body = Array.from({ length: 300 }, (_, i) => `{"line": ${i}}`).join(
      "\n",
    )
    const scrollRef = { current: null as ScrollBoxRenderable | null }

    const { renderOnce, captureCharFrame, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <scrollbox ref={scrollRef} style={{ height: 10 }}>
          <JsonBodyViewer body={body} theme={theme} />
        </scrollbox>
      </ThemeProvider>,
      { width: 40, height: 10 },
    )

    await renderOnce()
    expect(captureCharFrame()).toContain('"line": 0')

    await act(async () => {
      scrollRef.current!.scrollTop = 290
      await new Promise((resolve) => setTimeout(resolve, 20))
      await renderOnce()
    })
    await renderOnce()
    expect(captureCharFrame()).toContain('"line": 299')
    await act(async () => renderer.destroy())
  })

  it("repaints tail-first when highlightPriority flips to end after start", async () => {
    const theme = THEMES[0]!
    const body = Array.from({ length: 300 }, (_, i) => `{"line": ${i}}`).join(
      "\n",
    )
    const scrollRef = { current: null as ScrollBoxRenderable | null }

    function Harness() {
      const [priority, setPriority] = useState<"start" | "end">("start")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__flip = () => setPriority("end")
      return (
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <scrollbox ref={scrollRef} style={{ height: 10 }}>
            <JsonBodyViewer
              body={body}
              theme={theme}
              highlightPriority={priority}
            />
          </scrollbox>
        </ThemeProvider>
      )
    }

    const { renderOnce, captureSpans, renderer } = await testRender(
      <Harness />,
      { width: 40, height: 10 },
    )

    await renderOnce()
    await act(async () => {
      scrollRef.current!.scrollTop = 290
      await renderOnce()
    })
    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).__flip()
      await renderOnce()
    })

    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      await renderOnce()
    }

    const tailNumbers = captureSpans()
      .lines.flatMap((line) => line.spans)
      .filter((span) => span.text.includes("299"))
    expect(
      tailNumbers.some((span) => span.fg.equals(RGBA.fromHex(theme.warning))),
    ).toBe(true)
    await act(async () => renderer.destroy())
  })
})
