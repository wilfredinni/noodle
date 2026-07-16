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

  it("masks bearer token when explicit Authorization header present", async () => {
    const entry = makeEntry({
      request: {
        id: "req-auth",
        name: "Auth test",
        method: "GET",
        url: "https://example.com",
        headers: {
          Authorization: {
            value: "Bearer secret-leak-123",
            enabled: true,
          },
          "Content-Type": {
            value: "application/json",
            enabled: true,
          },
        },
        params: [],
        auth: { type: "bearer", token: "secret-leak-123" },
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: {},
        body: "{}",
        timeMs: 5,
        size: 2,
      },
    })
    const { renderOnce, captureCharFrame, mockInput, cleanup } =
      await renderOverlay(entry, () => {})
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_LEFT"))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Bearer ")
    expect(frame).not.toContain("secret-leak-123")
    expect(frame).toContain("Content-Type")
    expect(frame).toContain("application/json")
    cleanup()
  })

  it("masks api_key header when raw key matches auth config", async () => {
    const entry = makeEntry({
      request: {
        id: "req-apikey",
        name: "API Key test",
        method: "GET",
        url: "https://example.com",
        headers: {
          "X-API-Key": { value: "secret-api-key", enabled: true },
        },
        params: [],
        auth: {
          type: "api_key",
          key: "X-API-Key",
          value: "secret-api-key",
          placement: "header",
        },
      },
    })
    const { renderOnce, captureCharFrame, mockInput, cleanup } =
      await renderOverlay(entry, () => {})
    await renderOnce()
    await act(async () => mockInput.pressKey("ARROW_LEFT"))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("X-API-Key")
    expect(frame).not.toContain("secret-api-key")
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
