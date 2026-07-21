import { act } from "react"
import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { ThemeProvider, THEMES } from "../src/ui/theme"
import { JsonBodyViewer } from "../src/ui/editor/JsonBodyViewer"

describe("JsonBodyViewer", () => {
  it("keeps JSON syntax highlighting when variables make raw JSON invalid", async () => {
    const theme = THEMES[0]!
    const { renderOnce, captureSpans } = await testRender(
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
    const title = spans.find((span) => span.text === '"my album"')
    const variable = spans.find((span) => span.text === "$user_id")

    expect(title).toBeDefined()
    expect(title!.fg.equals(RGBA.fromHex(theme.success))).toBe(true)
    expect(variable).toBeDefined()
    expect(variable!.fg.equals(RGBA.fromHex(theme.primary))).toBe(true)
  })

  it("handles large JSON payloads (>200KB) in JsonBodyViewer without freezing or errors", async () => {
    const theme = THEMES[0]!
    const item =
      '    {\n      "id": "1288d7d4-3c95-4dbe-9d74-c34977478ee8",\n      "status": "completed"\n    }'
    const items = new Array(3000).fill(item).join(",\n")
    const largeBody = `{\n  "results": [\n${items}\n  ]\n}`

    const { renderOnce, renderer } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <JsonBodyViewer body={largeBody} theme={theme} readOnly />
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    // Wait for chunked async highlights to complete
    await new Promise((resolve) => setTimeout(resolve, 50))
    await renderOnce()
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
          <JsonBodyViewer
            body={body}
            theme={theme}
            readOnly
            scrollRef={scrollRef}
          />
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
})
