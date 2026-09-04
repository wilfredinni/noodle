import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { createTestRender } from "../testRender"
import { MouseButtons } from "@opentui/core/testing"
import { InputRenderable, type BaseRenderable } from "@opentui/core"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { UrlBar } from "../../src/ui/UrlBar"
import type { Method } from "../../src/schema"
import { setupKeymap } from "./_helpers"

const testRender = createTestRender()

function UrlBarHarness({
  subFocus = "text",
  focused = true,
  initialMethod = "GET",
  onMethodChange,
  onDefocus,
  jumpMode = false,
  onPaneFocus,
  onSubFocus,
  onSend,
  sending = false,
  initialUrl = "https://example.com",
}: {
  subFocus?: "select" | "text"
  focused?: boolean
  initialMethod?: Method
  onMethodChange?: (method: string) => void
  onDefocus?: (rawUrl: string) => void
  jumpMode?: boolean
  onPaneFocus?: () => void
  onSubFocus?: (subFocus: "select" | "text") => void
  onSend?: () => void
  sending?: boolean
  initialUrl?: string | null
}) {
  const [url, setUrl] = useState(initialUrl)
  const [method, setMethod] = useState<Method>(initialMethod)
  return (
    <UrlBar
      method={method}
      url={url}
      params={[]}
      setUrl={setUrl}
      setMethod={(next) => {
        setMethod(next)
        onMethodChange?.(next)
      }}
      onDefocus={onDefocus ?? (() => {})}
      focused={focused}
      subFocus={subFocus}
      jumpMode={jumpMode}
      onPaneFocus={onPaneFocus}
      onSubFocus={onSubFocus}
      onSend={onSend}
      sending={sending}
      activeEnv={{
        name: "test",
        vars: { base_url: "https://api.example.com" },
      }}
    />
  )
}

describe("UrlBar", () => {
  it("sends on left click only without focusing the URL bar", async () => {
    const { keymap, cleanup } = setupKeymap()
    let sends = 0
    let focusCount = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness
            onSend={() => sends++}
            onPaneFocus={() => focusCount++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    const lines = frame.split("\n")
    const sendY = lines.findIndex((line) => line.includes("Send"))
    const sendX = lines[sendY].indexOf("Send")
    await mockMouse.click(sendX, sendY, MouseButtons.RIGHT)
    expect(sends).toBe(0)

    await mockMouse.click(sendX, sendY, MouseButtons.LEFT)
    expect(sends).toBe(1)
    expect(focusCount).toBe(0)
    cleanup()
  })

  it("keeps the URL width stable while sending a long URL", async () => {
    const { keymap, cleanup } = setupKeymap()
    let startSending = () => {}

    function TestContainer() {
      const [sending, setSending] = useState(false)
      startSending = () => setSending(true)
      return (
        <UrlBarHarness
          initialUrl={`https://example.com/${"long-path/".repeat(20)}`}
          onSend={() => {}}
          sending={sending}
        />
      )
    }

    const { renderOnce, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TestContainer />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 40, height: 12 },
    )
    await renderOnce()

    const findInput = (node: BaseRenderable): InputRenderable | undefined => {
      if (node instanceof InputRenderable) return node
      for (const child of node.getChildren()) {
        const input = findInput(child)
        if (input) return input
      }
    }
    const width = findInput(renderer.root)!.width
    const button = renderer.root.findDescendantById("urlbar-send-button")!
    const sendSlotWidth = button.parent!.width
    expect(button.width).toBe(6)
    expect(sendSlotWidth).toBe(8)

    act(() => startSending())
    await renderOnce()

    expect(findInput(renderer.root)!.width).toBe(width)
    expect(
      renderer.root.findDescendantById("urlbar-send-button")!.parent!.width,
    ).toBe(sendSlotWidth)
    cleanup()
  })

  it("hides the Send control when sending is unavailable", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    expect(captureCharFrame()).not.toContain("Send")
    cleanup()
  })

  it("shows a spinner beside Send and prevents repeat sends", async () => {
    const originalSetInterval = globalThis.setInterval
    globalThis.setInterval = (() => 0) as unknown as typeof setInterval
    const { keymap, cleanup } = setupKeymap()
    try {
      let sends = 0
      const { renderOnce, captureCharFrame, mockMouse } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <UrlBarHarness onSend={() => sends++} sending />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()

      const frame = captureCharFrame()
      const lines = frame.split("\n")
      const sendY = lines.findIndex((line) => line.includes("⠋ Send"))
      const sendX = lines[sendY].indexOf("Send")
      expect(sendY).toBeGreaterThanOrEqual(0)

      await mockMouse.click(sendX, sendY, MouseButtons.LEFT)
      expect(sends).toBe(0)
    } finally {
      cleanup()
      globalThis.setInterval = originalSetInterval
    }
  })

  it("focuses its pane only on a left click", async () => {
    const { keymap, cleanup } = setupKeymap()
    let focusCount = 0
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness onPaneFocus={() => focusCount++} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    await mockMouse.click(0, 0, MouseButtons.RIGHT)
    expect(focusCount).toBe(0)

    await mockMouse.click(0, 0, MouseButtons.LEFT)
    expect(focusCount).toBe(1)
    cleanup()
  })

  it("focuses the URL text input on left click", async () => {
    const { keymap, cleanup } = setupKeymap()
    let subFocus = ""
    const { renderOnce, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness
            subFocus="select"
            onSubFocus={(next) => {
              subFocus = next
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    await mockMouse.click(12, 1, MouseButtons.LEFT)
    expect(subFocus).toBe("text")
    cleanup()
  })

  it("renders jump badges above real method and URL controls", async () => {
    const { keymap, cleanup } = setupKeymap()
    try {
      const { renderOnce, captureCharFrame } = await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <UrlBarHarness jumpMode />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 100, height: 12 },
      )
      await renderOnce()
      const frame = captureCharFrame()
      expect(frame).toContain(" m ")
      expect(frame).toContain(" u ")
    } finally {
      cleanup()
    }
  })

  it("shows variable suggestions while editing the URL", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$")
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("$base_url")
    cleanup()
  })

  it("renders method selector when method sub-focus is active", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness subFocus="select" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )

    await renderOnce()

    expect(captureCharFrame()).toContain("GET")
    cleanup()
  })

  it("shows the complete PATCH label and dropdown indicator", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness subFocus="select" initialMethod="PATCH" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )

    await renderOnce()

    expect(captureCharFrame()).toContain("PATCH")
    expect(captureCharFrame()).toContain("▼")

    act(() => {
      host.press("return")
    })
    await renderOnce()
    act(() => {
      host.press("escape")
    })
    await renderOnce()

    expect(captureCharFrame()).toContain("PATCH")
    expect(captureCharFrame()).toContain("▼")
    cleanup()
  })

  it("sizes the method selector for the widest method", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness subFocus="select" initialMethod="OPTIONS" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )

    await renderOnce()

    expect(captureCharFrame()).toContain("OPTIONS")
    expect(captureCharFrame()).toContain("▼")
    cleanup()
  })

  it("changes method through selector dropdown", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let selectedMethod = ""
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness
            subFocus="select"
            onMethodChange={(method) => {
              selectedMethod = method
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )

    await renderOnce()
    act(() => {
      host.press("return")
    })
    await renderOnce()
    act(() => {
      host.press("down")
    })
    await renderOnce()
    act(() => {
      host.press("return")
    })
    await renderOnce()

    expect(selectedMethod).toBe("POST")
    cleanup()
  })

  it("does not activate selector when UrlBar is not interactive", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    let selectedMethod = ""
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness
            subFocus="select"
            focused={false}
            onMethodChange={(method) => {
              selectedMethod = method
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 20 },
    )

    await renderOnce()
    act(() => {
      host.press("return")
    })
    await renderOnce()

    expect(selectedMethod).toBe("")
    cleanup()
  })

  it("triggers onDefocus callback when focus leaves UrlBar", async () => {
    const { keymap, cleanup } = setupKeymap()
    let defocusedUrl = ""
    let toggleFocus: () => void = () => {}

    function TestContainer() {
      const [focused, setFocused] = useState(true)
      toggleFocus = () => setFocused(false)
      return (
        <UrlBarHarness
          focused={focused}
          onDefocus={(rawUrl) => {
            defocusedUrl = rawUrl
          }}
        />
      )
    }

    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TestContainer />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )

    await renderOnce()
    act(() => {
      toggleFocus()
    })
    await renderOnce()

    expect(defocusedUrl).toBe("https://example.com")
    cleanup()
  })

  it("shows the 'no request selected message' when URL is not provided", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness initialUrl={null} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    expect(captureCharFrame()).toContain("no request selected")
    cleanup()
  })

  it("does not show the 'no request selected message' when initial URL is cleared, preserves input", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <UrlBarHarness initialUrl={"a"} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()

    expect(captureCharFrame()).not.toContain("no request selected")
    expect(captureCharFrame()).toContain("GET")
    expect(captureCharFrame()).toContain("▼")
    expect(captureCharFrame()).toContain("a")

    await act(async () => {
      mockInput.pressBackspace()
    })

    await renderOnce()

    expect(captureCharFrame()).not.toContain("no request selected")
    expect(captureCharFrame()).toContain("GET")
    expect(captureCharFrame()).toContain("▼")
    expect(captureCharFrame()).not.toContain("a")

    await act(async () => {
      await mockInput.typeText("https://example.com")
    })

    await renderOnce()

    expect(captureCharFrame()).not.toContain("no request selected")
    expect(captureCharFrame()).toContain("https://example.com")

    cleanup()
  })
})
