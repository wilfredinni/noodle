import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { UrlBar } from "../../src/ui/UrlBar"
import type { Method } from "../../src/schema"
import { setupKeymap } from "./_helpers"

function UrlBarHarness({
  subFocus = "text",
  focused = true,
  initialMethod = "GET",
  onMethodChange,
  onDefocus,
  jumpMode = false,
  onPaneFocus,
}: {
  subFocus?: "select" | "text"
  focused?: boolean
  initialMethod?: Method
  onMethodChange?: (method: string) => void
  onDefocus?: (rawUrl: string) => void
  jumpMode?: boolean
  onPaneFocus?: () => void
}) {
  const [url, setUrl] = useState("https://example.com")
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
      activeEnv={{
        name: "test",
        vars: { base_url: "https://api.example.com" },
      }}
    />
  )
}

describe("UrlBar", () => {
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
})
