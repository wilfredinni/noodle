import {
  act,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { describe, expect, it } from "bun:test"
import { scheduler } from "node:timers/promises"
import { createTestRender } from "./testRender"
import { RGBA } from "@opentui/core"
import type { ScrollBoxRenderable } from "@opentui/core"
import { ThemeProvider, THEMES } from "../src/ui/theme"
import { JsonBodyViewer } from "../src/ui/editor/JsonBodyViewer"

const testRender = createTestRender()

async function waitForHighlight(
  renderOnce: () => Promise<void>,
  isHighlighted: () => boolean,
) {
  const deadline = Date.now() + 2_000
  while (!isHighlighted()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for highlight")
    await act(async () => {
      await scheduler.wait(0)
      await renderOnce()
    })
  }
}

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

  it("finishes chunked highlighting for large JSON payloads", async () => {
    const theme = THEMES[0]!
    const item = `    {\n      "payload": "${"x".repeat(1024)}",\n      "status": "completed"\n    }`
    const items = new Array(220).fill(item).join(",\n")
    const largeBody = `{\n  "results": [\n${items}\n  ]\n}`
    const scrollRef = { current: null as ScrollBoxRenderable | null }

    const { renderOnce, captureSpans } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <scrollbox ref={scrollRef} style={{ height: 10 }}>
          <JsonBodyViewer body={largeBody} theme={theme} />
        </scrollbox>
      </ThemeProvider>,
      { width: 80, height: 10 },
    )

    await renderOnce()
    await act(async () => {
      scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight
      await renderOnce()
    })
    const tailIsHighlighted = () =>
      captureSpans()
        .lines.flatMap((line) => line.spans)
        .some(
          (span) =>
            span.text.includes("completed") &&
            span.fg.equals(RGBA.fromHex(theme.success)),
        )
    await waitForHighlight(renderOnce, tailIsHighlighted)
    expect(tailIsHighlighted()).toBe(true)
  })

  it("preserves string highlighting across large raw-body chunks", async () => {
    const theme = THEMES[0]!
    const body = `{"payload":"${"a".repeat(1024 * 1024)}"}`
    const scrollRef = { current: null as ScrollBoxRenderable | null }
    const { renderOnce, captureSpans } = await testRender(
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
      await renderOnce()
    })
    const stringPart = captureSpans()
      .lines.flatMap((line) => line.spans)
      .find((span) => span.text.includes("a"))
    expect(stringPart?.fg.equals(RGBA.fromHex(theme.success))).toBe(true)
  })

  it("renders the scrolled window for large bodies", async () => {
    const theme = THEMES[0]!
    const body = Array.from({ length: 300 }, (_, i) => `{"line": ${i}}`).join(
      "\n",
    )
    const scrollRef = { current: null as ScrollBoxRenderable | null }

    const { renderOnce, captureCharFrame } = await testRender(
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
      await renderOnce()
    })
    await renderOnce()
    expect(captureCharFrame()).toContain('"line": 299')
  })

  it("repaints tail-first when highlightPriority flips to end after start", async () => {
    const theme = THEMES[0]!
    const body = Array.from({ length: 300 }, (_, i) => `{"line": ${i}}`).join(
      "\n",
    )
    const scrollRef = { current: null as ScrollBoxRenderable | null }

    let setPriority: Dispatch<SetStateAction<"start" | "end">> | undefined

    function Harness({
      onReady,
    }: {
      onReady: (setter: Dispatch<SetStateAction<"start" | "end">>) => void
    }) {
      const [priority, setPriority] = useState<"start" | "end">("start")
      useEffect(() => onReady(setPriority), [onReady])
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

    const onReady = (setter: Dispatch<SetStateAction<"start" | "end">>) => {
      setPriority = setter
    }
    const { renderOnce, captureSpans } = await testRender(
      <Harness onReady={onReady} />,
      { width: 40, height: 10 },
    )

    await renderOnce()
    await act(async () => {
      scrollRef.current!.scrollTop = 290
      await renderOnce()
    })
    await act(async () => {
      setPriority!("end")
      await renderOnce()
    })

    const tailNumbers = () =>
      captureSpans()
        .lines.flatMap((line) => line.spans)
        .filter((span) => span.text.includes("299"))
    await waitForHighlight(renderOnce, () =>
      tailNumbers().some((span) => span.fg.equals(RGBA.fromHex(theme.warning))),
    )
    expect(
      tailNumbers().some((span) => span.fg.equals(RGBA.fromHex(theme.warning))),
    ).toBe(true)
  })
})
