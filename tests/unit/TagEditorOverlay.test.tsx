import { describe, expect, it } from "bun:test"
import { act, createRef, useEffect } from "react"
import { KeymapProvider, useKeymap } from "@opentui/keymap/react"
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
}: {
  overlayRef: React.RefObject<TagEditorOverlayHandle | null>
  confirmed: string[]
  onClose: () => void
  backgroundKeys: string[]
}) {
  const keymap = useKeymap()
  const actions = useSingleFieldFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm: (tag) => confirmed.push(tag),
    onCancel: onClose,
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
      initialValue=""
      onConfirm={actions.confirm}
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
    act(() => host.press("return"))
    expect(confirmed).toEqual(["smoke"])
    act(() => host.press("s", { ctrl: true }))
    expect(confirmed).toEqual(["smoke", "smoke"])
    act(() => host.press("escape"))

    expect(closed).toBe(1)
    expect(backgroundKeys).toEqual([])
    cleanup()
  })
})
