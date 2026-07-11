import { describe, expect, it } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { RGBA } from "@opentui/core"
import { ThemeProvider, THEMES } from "../src/ui/theme"
import { JsonBodyViewer } from "../src/ui/JsonBodyViewer"

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
})
