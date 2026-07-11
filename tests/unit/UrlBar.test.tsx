import { describe, expect, it } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { ThemeProvider } from "../../src/ui/theme"
import { UrlBar } from "../../src/ui/UrlBar"

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
      activeEnv={{
        name: "test",
        vars: { base_url: "https://api.example.com" },
      }}
    />
  )
}

describe("UrlBar", () => {
  it("shows variable suggestions while editing the URL", async () => {
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <UrlBarHarness />
      </ThemeProvider>,
      { width: 100, height: 12 },
    )
    await renderOnce()
    await act(async () => {
      await mockInput.typeText("$")
    })
    await renderOnce()
    expect(captureCharFrame()).toContain("$base_url")
  })
})
