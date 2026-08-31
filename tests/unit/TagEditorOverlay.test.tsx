import { describe, expect, it } from "bun:test"
import { act, createRef, useEffect, useState } from "react"
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
import { VariableCompletionInterceptor } from "../../src/ui/variable-completion/variableCompletionInterceptor"

const testRender = createTestRender()

function KeyboardHarness({
  overlayRef,
  confirmed,
  onClose,
  backgroundKeys,
  initialValue = "",
  suggestions = [],
  onClear,
  onDelete,
}: {
  overlayRef: React.RefObject<TagEditorOverlayHandle | null>
  confirmed: string[]
  onClose: () => void
  backgroundKeys: string[]
  initialValue?: string
  suggestions?: readonly string[]
  onClear?: () => void
  onDelete?: () => void
}) {
  const keymap = useKeymap()
  const actions = useSingleFieldFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm: (tag) => confirmed.push(tag),
    onCancel: onClose,
    onClear: onClear ?? onDelete,
  })

  useEffect(
    () =>
      keymap.intercept("key", (ctx) => backgroundKeys.push(ctx.event.name), {
        priority: 0,
      }),
    [backgroundKeys, keymap],
  )

  return (
    <>
      <VariableCompletionInterceptor />
      <TagEditorOverlay
        visible
        ref={overlayRef}
        initialValue={initialValue}
        suggestions={suggestions}
        title={onClear ? "Include Tag" : undefined}
        onConfirm={actions.confirm}
        onClear={onClear ? actions.clear : undefined}
        onDelete={onDelete ? actions.clear : undefined}
        onClose={actions.cancel}
      />
    </>
  )
}

function OpeningHarness({
  overlayRef,
  suggestions,
  onReady,
}: {
  overlayRef: React.RefObject<TagEditorOverlayHandle | null>
  suggestions: readonly string[]
  onReady: (open: () => void) => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => onReady(() => setVisible(true)), [onReady])

  return (
    <TagEditorOverlay
      visible={visible}
      ref={overlayRef}
      initialValue=""
      suggestions={suggestions}
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
          <TagEditorOverlay
            visible
            ref={ref}
            initialValue=" smoke"
            suggestions={[]}
          />
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

  it("filters suggestions case-insensitively and accepts before saving", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    const confirmed: string[] = []
    const backgroundKeys: string[] = []
    let closed = 0
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness
            overlayRef={ref}
            confirmed={confirmed}
            onClose={() => closed++}
            backgroundKeys={backgroundKeys}
            suggestions={["users", "smoke-api", "Smoke", "Smoke"]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("sM"))
    await renderOnce()
    expect(captureCharFrame()).toContain("Smoke")
    expect(captureCharFrame()).toContain("smoke-api")
    expect(captureCharFrame()).not.toContain("users")

    act(() => host.press("down"))
    act(() => host.press("return"))
    await renderOnce()
    expect(confirmed).toEqual([])
    act(() => host.press("return"))
    expect(confirmed).toEqual(["smoke-api"])
    expect(closed).toBe(0)
    expect(backgroundKeys).toEqual([])
    cleanup()
  })

  it("dismisses suggestions before closing the overlay", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    let closed = 0
    const { renderOnce, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness
            overlayRef={ref}
            confirmed={[]}
            onClose={() => closed++}
            backgroundKeys={[]}
            suggestions={["smoke"]}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("sm"))
    await renderOnce()

    act(() => host.press("escape"))
    await renderOnce()
    expect(closed).toBe(0)
    act(() => host.press("escape"))
    expect(closed).toBe(1)
    cleanup()
  })

  it("anchors sorted, deduplicated suggestions and accepts by mouse", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    let open = () => {}
    const handleReady = (next: () => void) => {
      open = next
    }
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <OpeningHarness
            overlayRef={ref}
            suggestions={["users", "smoke", "users"]}
            onReady={handleReady}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    act(() => open())
    await act(async () => {
      await renderOnce()
    })
    expect(captureCharFrame()).not.toContain("users")
    await act(async () => {
      await renderOnce()
    })
    const frame = captureCharFrame()
    expect(frame.indexOf("smoke")).toBeLessThan(frame.indexOf("users"))
    expect(frame.match(/users/g)).toHaveLength(1)

    const rows = frame.split("\n")
    const inputY = rows.findIndex((row) => row.includes("e.g. smoke"))
    const usersY = rows.findIndex((row) => row.includes("users"))
    expect(usersY).toBe(inputY + 3)
    expect(rows[usersY]!.indexOf("users")).toBeGreaterThanOrEqual(
      rows[inputY]!.indexOf("e.g. smoke"),
    )
    await act(async () =>
      mockMouse.click(
        rows[usersY]!.indexOf("users"),
        usersY,
        MouseButtons.LEFT,
      ),
    )
    await renderOnce()
    act(() => expect(ref.current?.confirm()).toBe("users"))
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

  it("deletes an existing request tag by keyboard or mouse", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<TagEditorOverlayHandle>()
    let deleted = 0
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness
            overlayRef={ref}
            confirmed={[]}
            onClose={() => {}}
            backgroundKeys={[]}
            initialValue="smoke"
            onDelete={() => deleted++}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("^D delete")
    expect(frame).not.toContain("esc close")

    act(() => host.press("d", { ctrl: true }))
    expect(deleted).toBe(1)

    const rows = frame.split("\n")
    const y = rows.findIndex((row) => row.includes("delete"))
    await act(async () =>
      mockMouse.click(rows[y]!.indexOf("delete"), y, MouseButtons.LEFT),
    )
    expect(deleted).toBe(2)
    cleanup()
  })
})
