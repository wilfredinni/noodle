import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { TimelineDetailOverlay } from "../../src/ui/overlays/TimelineDetailOverlay"
import type { TimelineEntry } from "../../src/schema"
import { setupKeymap } from "./_helpers"

function makeEntry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    timestamp: 1,
    request: {
      id: "request-1",
      name: "Test request",
      method: "GET",
      url: "https://example.com",
      headers: {},
      params: [],
    },
    ...over,
  }
}

async function renderOverlay(
  entry: TimelineEntry,
  onClose: () => void,
  visible = true,
) {
  const { keymap, cleanup } = setupKeymap()
  ;(
    keymap as unknown as { setData: (key: string, value: string) => void }
  ).setData("app.overlay", "none")
  const render = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <TimelineDetailOverlay
          visible={visible}
          entry={entry}
          onClose={onClose}
        />
      </ThemeProvider>
    </KeymapProvider>,
    { width: 80, height: 30 },
  )
  return { ...render, cleanup, keymap }
}

describe("TimelineDetailOverlay", () => {
  it("renders response details", async () => {
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: '{"ok":true}',
          timeMs: 12,
          size: 11,
        },
      }),
      () => {},
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("200 OK")
    expect(frame).toContain("ok")
    cleanup()
  })

  it("renders error details", async () => {
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      makeEntry({ error: { message: "Connection refused" } }),
      () => {},
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Connection refused")
    expect(frame).toContain("No response")
    cleanup()
  })

  it("switches to request tab with left arrow", async () => {
    const { renderOnce, captureCharFrame, mockInput, cleanup } =
      await renderOverlay(makeEntry(), () => {})
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_LEFT"))
    await renderOnce()
    expect(captureCharFrame()).toContain("request-1")
    cleanup()
  })

  it("resets to response when reopened", async () => {
    const entry = makeEntry({
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "response",
        timeMs: 1,
        size: 8,
      },
    })
    const { keymap, cleanup } = setupKeymap()
    ;(
      keymap as unknown as { setData: (key: string, value: string) => void }
    ).setData("app.overlay", "none")
    let setVisible: ((visible: boolean) => void) | undefined
    const render = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TimelineDetailHarness
            entry={entry}
            setVisibleRef={(set) => (setVisible = set)}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 30 },
    )
    const { renderOnce, captureCharFrame, mockInput } = render
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_LEFT"))
    await renderOnce()
    expect(captureCharFrame()).toContain("request-1")

    await act(async () => setVisible?.(false))
    await renderOnce()
    await act(async () => setVisible?.(true))
    await renderOnce()
    expect(captureCharFrame()).toContain("response")
    cleanup()
  })
})

function TimelineDetailHarness({
  entry,
  setVisibleRef,
}: {
  entry: TimelineEntry
  setVisibleRef: (setVisible: (visible: boolean) => void) => void
}) {
  const [visible, setVisible] = useState(true)
  setVisibleRef(setVisible)
  return (
    <TimelineDetailOverlay visible={visible} entry={entry} onClose={() => {}} />
  )
}
