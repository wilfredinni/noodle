import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { KeymapProvider } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import { UrlBar } from "../../src/ui/UrlBar"
import { setupKeymap } from "./_helpers"

function UrlBarHarness() {
  const [url, setUrl] = useState("https://example.com")
  return (
    <UrlBar
      method="GET"
      url={url}
      params={[]}
      setUrl={setUrl}
      onDefocus={() => {}}
      focused
      subFocus="text"
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
})
