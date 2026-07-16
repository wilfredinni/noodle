import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { UrlBar } from "../../src/ui/UrlBar"
import { setupKeymap } from "./_helpers"

function UrlBarHarness({
  subFocus = "text",
  focused = true,
  onMethodChange,
}: {
  subFocus?: "select" | "text"
  focused?: boolean
  onMethodChange?: (method: string) => void
}) {
  const [url, setUrl] = useState("https://example.com")
  const [method, setMethod] = useState<"GET" | "POST">("GET")
  return (
    <UrlBar
      method={method}
      url={url}
      params={[]}
      setUrl={setUrl}
      setMethod={(next) => {
        setMethod(next as "GET" | "POST")
        onMethodChange?.(next)
      }}
      onDefocus={() => {}}
      focused={focused}
      subFocus={subFocus}
      activeEnv={{
        name: "test",
        vars: { base_url: "https://api.example.com" },
      }}
    />
  )
}

describe("UrlBar", () => {
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
})
