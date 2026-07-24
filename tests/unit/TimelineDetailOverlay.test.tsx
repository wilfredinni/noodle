import { describe, expect, it } from "bun:test"
import { act, useState, type ComponentProps } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  TimelineDetailOverlay,
  formatHeaderEntries,
} from "../../src/ui/overlays/TimelineDetailOverlay"
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
  actions: Partial<
    Pick<
      ComponentProps<typeof TimelineDetailOverlay>,
      "onLoadBody" | "onCopyHeaders" | "onCopyBody" | "onExportBody"
    >
  > = {},
) {
  const { keymap, host, cleanup } = setupKeymap()
  ;(
    keymap as unknown as { setData: (key: string, value: string) => void }
  ).setData("app.overlay", "none")
  const render = await act(async () =>
    testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TimelineDetailOverlay
            visible={visible}
            entry={entry}
            onClose={onClose}
            {...actions}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 30 },
    ),
  )
  return {
    ...render,
    cleanup: () => {
      cleanup()
      act(() => {
        render.renderer.destroy()
      })
    },
    keymap,
    host,
  }
}

describe("TimelineDetailOverlay", () => {
  it("renders response details", async () => {
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
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
    await act(async () => host.press("right"))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("200 OK")
    expect(frame).toContain("ok")
    cleanup()
  })

  it("keeps a large body visible when scrolling past headers", async () => {
    const body = JSON.stringify(
      {
        data: Array.from({ length: 1_000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
        })),
      },
      null,
      2,
    )
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [
              `x-header-${i}`,
              `value-${i}`,
            ]),
          ),
          body,
          timeMs: 12,
          size: body.length,
        },
      }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    await act(async () => host.press("end"))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await renderOnce()
    expect(captureCharFrame()).toContain('"name": "item-999"')
    cleanup()
  })

  it("requires an explicit view action for bodies larger than 5MB", async () => {
    const body = "x".repeat(5 * 1024 * 1024 + 1)
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body,
          timeMs: 12,
          size: body.length,
        },
      }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    expect(captureCharFrame()).toContain("not rendered automatically")
    cleanup()
  })

  it("loads a sidecar body before copying or exporting it", async () => {
    const copied: string[] = []
    const exported: string[] = []
    const { renderOnce, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          bodyRef: {
            file: "entry-response.gz",
            encoding: "gzip",
            size: 20_000,
          },
          timeMs: 1,
          size: 20_000,
        },
      }),
      () => {},
      true,
      {
        onLoadBody: async () => "saved sidecar body",
        onCopyBody: (body) => copied.push(body),
        onExportBody: async (_entry, _kind, body) => {
          if (body !== undefined) exported.push(body)
        },
      },
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    await act(async () => {
      host.press("b")
      host.press("e")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(copied).toEqual(["saved sidecar body"])
    expect(exported).toEqual(["saved sidecar body"])
    cleanup()
  })

  it("exports bodyless timeline entry when export shortcut is pressed", async () => {
    let exported = false
    let exportedBody: string | undefined = "not-called"
    const { renderOnce, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 204,
          statusText: "No Content",
          headers: {},
          timeMs: 5,
          size: 0,
        },
      }),
      () => {},
      true,
      {
        onExportBody: async (_entry, _kind, body) => {
          exported = true
          exportedBody = body
        },
      },
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    await act(async () => {
      host.press("e")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(exported).toBe(true)
    expect(exportedBody).toBeUndefined()
    cleanup()
  })

  it("displays error message when timeline export fails", async () => {
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "hello",
          timeMs: 1,
          size: 5,
        },
      }),
      () => {},
      true,
      {
        onExportBody: async () => {
          throw new Error("Disk write failure")
        },
      },
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    await act(async () => {
      host.press("e")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("Failed to export timeline entry")
    cleanup()
  })

  it("renders error details", async () => {
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({ error: { message: "Connection refused" } }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Connection refused")
    expect(frame).toContain("No response")
    cleanup()
  })

  it("opens with Request tab active by default", async () => {
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      makeEntry(),
      () => {},
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Test request")
    expect(frame).toContain("GET https://example.com")
    cleanup()
  })

  it("dynamically adjusts body container height to fit short bodies", async () => {
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          timeMs: 12,
          size: 2,
        },
      }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    const lines = captureCharFrame().split("\n")
    const bodyTitleIndex = lines.findIndex((l) => l.trim() === "Body")
    expect(bodyTitleIndex).toBeGreaterThanOrEqual(0)
    expect(lines[bodyTitleIndex + 2]).toContain("{}")
    cleanup()
  })

  it("switches to response tab with right arrow", async () => {
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body: "response body content",
          timeMs: 1,
          size: 8,
        },
      }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    expect(captureCharFrame()).toContain("response body content")
    cleanup()
  })

  it("wraps long request URL onto lines below method", async () => {
    const longUrl =
      "https://gci-leadhub.planok.dev/api/v1/leads/?status=incomplete&page=1&limit=50"
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      makeEntry({
        request: {
          id: "leads/get-leads",
          name: "Get Leads",
          method: "GET",
          url: longUrl,
          headers: {},
          params: [],
        },
      }),
      () => {},
    )
    await renderOnce()
    const frame = captureCharFrame()
    const lines = frame.split("\n")
    const methodLineIndex = lines.findIndex((l) =>
      l.includes("GET https://gci-leadhub.planok.dev"),
    )
    const headersLineIndex = lines.findIndex((l) => l.trim() === "Headers")
    expect(methodLineIndex).toBeGreaterThanOrEqual(0)
    expect(lines[methodLineIndex + 1]).toContain("status=incomplete")
    expect(frame).toContain("leads/Get Leads")
    expect(headersLineIndex).toBeGreaterThan(methodLineIndex)
    cleanup()
  })

  it("keeps the body directly below a short request header list", async () => {
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      makeEntry({
        request: {
          id: "request-1",
          name: "Test request",
          method: "GET",
          url: "https://example.com",
          headers: {
            "X-Request-Id": { value: "abc123", enabled: true },
          },
          params: [],
        },
      }),
      () => {},
    )
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const headerLine = lines.findIndex((line) => line.includes("X-Request-Id"))
    const bodyLine = lines.findIndex((line) => line.trim() === "Body")
    expect(bodyLine - headerLine).toBeLessThanOrEqual(15)
    cleanup()
  })

  it("consumes modal keys before background handlers", async () => {
    let closed = false
    const { renderOnce, host, keymap, cleanup } = await renderOverlay(
      makeEntry(),
      () => {
        closed = true
      },
    )
    const backgroundKeys: string[] = []
    const disposeBackground = keymap.intercept(
      "key",
      (ctx) => backgroundKeys.push(ctx.event.name),
      { priority: 0 },
    )

    await renderOnce()
    await act(async () => {
      host.press("e")
      host.press("escape")
    })

    expect(closed).toBe(true)
    expect(backgroundKeys).toEqual([])
    disposeBackground()
    cleanup()
  })

  it("resets to request when reopened", async () => {
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
    const { keymap, host, cleanup } = setupKeymap()
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
    const { renderOnce, captureCharFrame } = render
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()
    expect(captureCharFrame()).toContain("response")

    await act(async () => setVisible?.(false))
    await renderOnce()
    await act(async () => setVisible?.(true))
    await renderOnce()
    expect(captureCharFrame()).toContain("Test request")
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
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      entry,
      () => {},
    )
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
    const { renderOnce, captureCharFrame, cleanup } = await renderOverlay(
      entry,
      () => {},
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("X-API-Key")
    expect(frame).not.toContain("secret-api-key")
    cleanup()
  })

  it("scrolls back to body top when home is pressed", async () => {
    const body = JSON.stringify(
      { data: Array.from({ length: 500 }, (_, i) => ({ id: i })) },
      null,
      2,
    )
    const { renderOnce, captureCharFrame, host, cleanup } = await renderOverlay(
      makeEntry({
        response: {
          status: 200,
          statusText: "OK",
          headers: {},
          body,
          timeMs: 12,
          size: body.length,
        },
      }),
      () => {},
    )
    await renderOnce()
    await act(async () => host.press("right"))
    await renderOnce()

    await act(async () => {
      host.press("end")
      await new Promise((resolve) => setTimeout(resolve, 20))
      await renderOnce()
    })
    expect(captureCharFrame()).toContain('"id": 499')

    await act(async () => {
      host.press("home")
      await new Promise((resolve) => setTimeout(resolve, 20))
      await renderOnce()
    })
    expect(captureCharFrame()).toContain('"data"')
    expect(captureCharFrame()).toContain('"id": 0')
    cleanup()
  })

  it("formats header entries correctly", () => {
    const formatted = formatHeaderEntries([
      { key: "Content-Type", value: "application/json" },
      { key: "Authorization", value: "Bearer token" },
    ])
    expect(formatted).toBe(
      "Content-Type: application/json\nAuthorization: Bearer token",
    )
  })

  it("triggers onCopyHeaders and onCopyBody for the active tab and renders footer hints", async () => {
    let copiedHeaders = ""
    let copiedBody = ""
    const entry = makeEntry({
      request: {
        id: "req-1",
        name: "Test",
        method: "POST",
        url: "https://example.com",
        headers: { "X-Test": { value: "req-val", enabled: true } },
        params: [],
        body: '{"req":true}',
      },
      response: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: '{"res":true}',
        timeMs: 10,
        size: 12,
      },
    })

    const { renderOnce, host, cleanup, captureCharFrame } = await renderOverlay(
      entry,
      () => {},
      true,
      {
        onCopyHeaders: (h) => {
          copiedHeaders = h
        },
        onCopyBody: (b) => {
          copiedBody = b
        },
      },
    )
    await renderOnce()

    const frame = captureCharFrame()
    expect(frame).toContain("h copy headers")
    expect(frame).toContain("b copy body")
    expect(frame).toContain("e export")

    // On Request tab (default)
    await act(async () => host.press("h"))
    expect(copiedHeaders).toContain("X-Test: req-val")

    await act(async () => host.press("b"))
    expect(copiedBody).toBe('{"req":true}')

    // Switch to Response tab
    await act(async () => host.press("right"))
    await renderOnce()

    await act(async () => host.press("h"))
    expect(copiedHeaders).toContain("content-type: application/json")

    await act(async () => host.press("b"))
    expect(copiedBody).toBe('{"res":true}')

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
