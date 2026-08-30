import { describe, expect, it } from "bun:test"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { act } from "react"
import { createTestRender } from "../testRender"
import { ActionButton } from "../../src/ui/ActionButton"
import { contrastOnSecondary, THEMES, ThemeProvider } from "../../src/ui/theme"

const testRender = createTestRender()
const theme = THEMES[0]!

describe("ActionButton", () => {
  it("keeps the shortcut accented and the description muted until hover", async () => {
    const { renderOnce, renderer, captureSpans, mockMouse } = await testRender(
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <ActionButton
          id="action-button"
          label="Save"
          shortcut="enter"
          onAction={() => {}}
        />
      </ThemeProvider>,
      { width: 30, height: 3 },
    )
    await renderOnce()

    const action = renderer.root.findDescendantById(
      "action-button",
    ) as BoxRenderable
    const spans = () => captureSpans().lines.flatMap((line) => line.spans)
    const shortcut = () => spans().find((span) => span.text.includes("enter"))
    const label = () => spans().find((span) => span.text.includes("Save"))

    expect(action.width).toBe("enter Save".length + 2)
    expect(shortcut()?.fg.equals(RGBA.fromHex(theme.secondary))).toBe(true)
    expect(label()?.fg.equals(RGBA.fromHex(theme.textMuted))).toBe(true)

    await act(async () => {
      await mockMouse.moveTo(action.screenX + 1, action.screenY)
      await renderOnce()
    })

    const hoverColor = RGBA.fromHex(contrastOnSecondary(theme))
    expect(shortcut()?.fg.equals(hoverColor)).toBe(true)
    expect(label()?.fg.equals(hoverColor)).toBe(true)
  })
})
