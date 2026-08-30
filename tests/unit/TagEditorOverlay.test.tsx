import { describe, expect, it } from "bun:test"
import { act, createRef, useEffect } from "react"
import { KeymapProvider, useKeymap } from "@opentui/keymap/react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { setupKeymap } from "./_helpers"
import { ThemeProvider } from "../../src/ui/theme"
import {
  TagEditorOverlay,
  type TagEditorOverlayHandle,
} from "../../src/ui/overlays/TagEditorOverlay"
import { useSingleFieldFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"

const testRender = createTestRender()

function KeyboardHarness({
  overlayRef,
  confirmed,
  onClose,
  backgroundKeys,
  initialValue = "",
  onClear,
}: {
  overlayRef: React.RefObject<TagEditorOverlayHandle | null>
  confirmed: string[]
  onClose: () => void
  backgroundKeys: string[]
  initialValue?: string
  onClear?: () => void
}) {
  const keymap = useKeymap()
  const actions = useSingleFieldFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm: (tag) => confirmed.push(tag),
    onCancel: onClose,
    onClear,
  })

  useEffect(
    () =>
      keymap.intercept("key", (ctx) => backgroundKeys.push(ctx.event.name), {
        priority: 0,
      }),
    [backgroundKeys, keymap],
  )

  return (
    <TagEditorOverlay
      visible
      ref={overlayRef}
      initialValue={initialValue}
      title={onClear ? "Include Tag" : undefined}
      onConfirm={actions.confirm}
      onClear={onClear ? actions.clear : undefined}
      onClose={actions.cancel}
    />
  )
}

describe("TagEditorOverlay", () => {
  it("prefills and validates an existing tag", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <TagEditorOverlay visible ref={ref} initialValue=" smoke" />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Edit Tag")
    act(() => expect(ref.current?.confirm()).toBeNull())
    await renderOnce()
    expect(captureCharFrame()).toContain(
      "Tag must be a non-empty trimmed string",
    )
    cleanup()
  })

  it("submits from the input or shortcut and owns Escape", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    const confirmed: string[] = []
    const backgroundKeys: string[] = []
    let closed = 0
    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness
            overlayRef={ref}
            confirmed={confirmed}
            onClose={() => closed++}
            backgroundKeys={backgroundKeys}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("smoke"))
    await renderOnce()
    expect(confirmed).toEqual([])
    act(() => host.press("return"))
    expect(confirmed).toEqual(["smoke"])
    act(() => host.press("s", { ctrl: true }))
    expect(confirmed).toEqual(["smoke", "smoke"])
    act(() => host.press("escape"))

    expect(closed).toBe(1)
    expect(backgroundKeys).toEqual([])
    cleanup()
  })

  it("clears an existing Runner filter by keyboard or mouse", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    const confirmed: string[] = []
    const backgroundKeys: string[] = []
    let cleared = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness
            overlayRef={ref}
            confirmed={confirmed}
            onClose={() => {}}
            backgroundKeys={backgroundKeys}
            initialValue="smoke"
            onClear={() => cleared++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    act(() => host.press("d", { ctrl: true }))
    expect(cleared).toBe(1)

    const rows = captureCharFrame().split("\n")
    const y = rows.findIndex((row) => row.includes("clear"))
    await act(async () =>
      mockMouse.click(rows[y]!.indexOf("clear"), y, MouseButtons.LEFT),
    )
    expect(cleared).toBe(2)
    expect(confirmed).toEqual([])
    expect(backgroundKeys).toEqual([])
    cleanup()
  })
})
