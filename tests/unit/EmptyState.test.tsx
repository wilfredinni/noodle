import { describe, expect, it } from "bun:test"
import { act } from "react"
import {
  RGBA,
  type ASCIIFontRenderable,
  type BoxRenderable,
} from "@opentui/core"
import { MouseButtons } from "@opentui/core/testing"
import { KeymapProvider } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { EmptyState, type EmptyStateProps } from "../../src/ui/EmptyState"
import { THEMES, ThemeProvider } from "../../src/ui/theme"
import { setupKeymap } from "./_helpers"
import { FullBorder } from "../../src/ui/borders"

const testRender = createTestRender()

async function renderEmptyState(
  onAction: () => void,
  size = { width: 80, height: 20 },
  options: Partial<EmptyStateProps> = {},
) {
  const { keymap, host, cleanup } = setupKeymap()
  const title = "title" in options ? options.title : "Noodle"
  const setup = await testRender(
    <KeymapProvider keymap={keymap}>
      <ThemeProvider activeIndex={0} previewIndex={null}>
        <EmptyState
          title={title}
          message={
            options.message ?? "Initialize collection to edit or send requests"
          }
          subtitle={options.subtitle}
          font={options.font}
          border={options.border}
          actionActive={options.actionActive}
          actionLabel={options.actionLabel}
          onAction={onAction}
        />
      </ThemeProvider>
    </KeymapProvider>,
    size,
  )
  return { ...setup, keymap, host, cleanup }
}

describe("EmptyState", () => {
  it("renders centered ASCII branding and an unbordered action", async () => {
    const { renderOnce, renderer, captureCharFrame, cleanup } =
      await renderEmptyState(() => {})
    await renderOnce()

    const title = renderer.root.findDescendantById(
      "empty-state-title",
    ) as ASCIIFontRenderable
    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    const frame = captureCharFrame()

    expect(title.text).toBe("Noodle")
    expect(frame).toContain("Initialize collection to edit or send requests")
    expect(frame).not.toContain("┌")
    expect(frame).not.toContain("└")
    expect(frame).not.toContain("▸")
    expect(Math.abs(title.screenX + title.width / 2 - 40)).toBeLessThanOrEqual(
      1,
    )
    expect(
      Math.abs(action.screenX + action.width / 2 - 40),
    ).toBeLessThanOrEqual(1)
    expect(action.screenY).toBeGreaterThan(title.screenY)

    cleanup()
  })

  it("runs the action from a left click", async () => {
    let actions = 0
    const { renderOnce, renderer, mockMouse, cleanup } = await renderEmptyState(
      () => actions++,
    )
    await renderOnce()

    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    const x = action.screenX + Math.floor(action.width / 2)

    await act(async () => {
      await mockMouse.click(x, action.screenY, MouseButtons.RIGHT)
    })
    expect(actions).toBe(0)

    await act(async () => {
      await mockMouse.click(x, action.screenY, MouseButtons.LEFT)
    })
    expect(actions).toBe(1)

    cleanup()
  })

  it("supports a tiny title with a subtitle above the action", async () => {
    const { renderOnce, renderer, captureCharFrame, cleanup } =
      await renderEmptyState(
        () => {},
        { width: 80, height: 12 },
        {
          title: "Cookies",
          subtitle: "No cookies yet",
          font: "tiny",
          message: "Add a cookie",
        },
      )
    await renderOnce()

    const title = renderer.root.findDescendantById(
      "empty-state-title",
    ) as ASCIIFontRenderable
    const subtitle = renderer.root.findDescendantById(
      "empty-state-subtitle",
    ) as BoxRenderable
    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable

    expect(title.font).toBe("tiny")
    expect(captureCharFrame()).toContain("No cookies yet")
    expect(subtitle.screenY).toBeGreaterThan(title.screenY)
    expect(action.screenY).toBeGreaterThan(subtitle.screenY)

    cleanup()
  })

  it("supports an active pane border without a title", async () => {
    const { renderOnce, renderer, captureCharFrame, cleanup } =
      await renderEmptyState(
        () => {},
        { width: 80, height: 12 },
        {
          title: undefined,
          subtitle: "No cookies yet",
          message: "Add a cookie",
          border: FullBorder,
        },
      )
    await renderOnce()

    const emptyState = renderer.root.findDescendantById(
      "empty-state",
    ) as BoxRenderable

    expect(
      renderer.root.findDescendantById("empty-state-title"),
    ).toBeUndefined()
    expect(emptyState.border).toEqual([...FullBorder.border])
    expect(emptyState.customBorderChars).toEqual(FullBorder.customBorderChars)
    expect(captureCharFrame()).toContain("┌")
    expect(captureCharFrame()).toContain("└")

    cleanup()
  })

  it("keeps the action highlighted without hover", async () => {
    const { renderOnce, renderer, cleanup } = await renderEmptyState(
      () => {},
      { width: 80, height: 12 },
      { actionActive: true },
    )
    await renderOnce()

    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    expect(
      action.backgroundColor.equals(RGBA.fromHex(THEMES[0]!.backgroundElement)),
    ).toBe(true)

    cleanup()
  })

  it("uses a contrasting secondary hover state", async () => {
    const { renderOnce, renderer, mockMouse, cleanup } = await renderEmptyState(
      () => {},
      { width: 80, height: 12 },
      { actionActive: true },
    )
    await renderOnce()

    const action = renderer.root.findDescendantById(
      "empty-state-action",
    ) as BoxRenderable
    const x = action.screenX + Math.floor(action.width / 2)

    await act(async () => {
      await mockMouse.moveTo(x, action.screenY)
      await renderOnce()
    })

    expect(
      action.backgroundColor.equals(RGBA.fromHex(THEMES[0]!.secondary)),
    ).toBe(true)

    cleanup()
  })

  it("runs the action from Enter and Space", async () => {
    let actions = 0
    const { mockInput, cleanup } = await renderEmptyState(() => actions++)

    await act(async () => mockInput.pressKey("RETURN"))
    await act(async () => mockInput.pressKey(" "))

    expect(actions).toBe(2)
    cleanup()
  })

  it("ignores keyboard activation while an overlay is active", async () => {
    let actions = 0
    const { keymap, mockInput, cleanup } = await renderEmptyState(
      () => actions++,
    )
    keymap.setData("app.overlay", "init-confirm")

    await act(async () => mockInput.pressKey("RETURN"))
    await act(async () => mockInput.pressKey(" "))

    expect(actions).toBe(0)
    cleanup()
  })
})
