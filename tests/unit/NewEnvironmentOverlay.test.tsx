import { describe, expect, it } from "bun:test"
import { act, createRef, useEffect } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider, useKeymap } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  NewEnvironmentOverlay,
  type NewEnvironmentOverlayHandle,
  type NewEnvironmentValues,
} from "../../src/ui/overlays/NewEnvironmentOverlay"
import { useFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"

function setupKeymap() {
  const { keymap, host, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    host,
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

function KeyboardHarness({
  overlayRef,
  onConfirm,
  onCancel,
  backgroundKeys,
}: {
  overlayRef: React.RefObject<NewEnvironmentOverlayHandle | null>
  onConfirm: (values: NewEnvironmentValues) => void
  onCancel: () => void
  backgroundKeys: string[]
}) {
  const keymap = useKeymap()
  const actions = useFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm,
    onCancel,
    passThroughFocuses: ["color"],
  })

  useEffect(
    () =>
      keymap.intercept("key", (ctx) => backgroundKeys.push(ctx.event.name), {
        priority: 0,
      }),
    [backgroundKeys, keymap],
  )

  return (
    <NewEnvironmentOverlay
      visible
      ref={overlayRef}
      onConfirm={actions.confirm}
      onClose={actions.cancel}
    />
  )
}

describe("NewEnvironmentOverlay", () => {
  it("renders with name focus and no color selected", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewEnvironmentOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewEnvironmentOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()

    const frame = captureCharFrame()
    const colorRow = frame.split("\n").find((row) => row.includes("(none)"))
    expect(frame).toContain("New Environment")
    expect(colorRow).toBeDefined()
    expect(colorRow!.indexOf("▼")).toBeGreaterThan(45)
    expect(ref.current?.getFocus()).toBe("name")
    cleanup()
  })

  it("requires a name and accepts an optional color", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<NewEnvironmentOverlayHandle>()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewEnvironmentOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 24 },
    )
    await renderOnce()

    let emptyResult: NewEnvironmentValues | null | undefined
    act(() => {
      emptyResult = ref.current?.confirm()
    })
    expect(emptyResult).toBeNull()
    await renderOnce()
    expect(captureCharFrame()).toContain("Environment name is required")

    await act(async () => mockInput.typeText("  staging  "))
    act(() => ref.current?.cycleFocus(1))
    await renderOnce()
    act(() => host.press("return"))
    await renderOnce()
    act(() => host.press("down"))
    await renderOnce()
    act(() => host.press("return"))
    await renderOnce()

    let result: NewEnvironmentValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toEqual({
      name: "staging",
      color: "primary",
    })
    cleanup()
  })

  it("shows persistence errors without clearing the form", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<NewEnvironmentOverlayHandle>()
    const { renderOnce, captureCharFrame, mockInput } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <NewEnvironmentOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 20 },
    )
    await renderOnce()
    await act(async () => mockInput.typeText("staging"))
    act(() => ref.current?.setError("Environment already exists"))
    await renderOnce()

    expect(captureCharFrame()).toContain("Environment already exists")
    let result: NewEnvironmentValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toEqual({
      name: "staging",
      color: undefined,
    })
    cleanup()
  })

  it("owns form shortcuts and supports footer mouse actions", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<NewEnvironmentOverlayHandle>()
    const confirmed: NewEnvironmentValues[] = []
    const backgroundKeys: string[] = []
    let closed = 0
    const { renderOnce, captureCharFrame, mockInput, mockMouse } =
      await testRender(
        <KeymapProvider keymap={keymap}>
          <ThemeProvider activeIndex={0} previewIndex={null}>
            <KeyboardHarness
              overlayRef={ref}
              onConfirm={(values) => confirmed.push(values)}
              onCancel={() => closed++}
              backgroundKeys={backgroundKeys}
            />
          </ThemeProvider>
        </KeymapProvider>,
        { width: 70, height: 20 },
      )
    await renderOnce()
    await act(async () => mockInput.typeText("development"))
    await renderOnce()

    act(() => host.press("tab"))
    await renderOnce()
    expect(ref.current?.getFocus()).toBe("color")
    act(() => host.press("x"))
    expect(backgroundKeys).toEqual([])
    act(() => host.press("tab", { shift: true }))
    await renderOnce()
    expect(ref.current?.getFocus()).toBe("name")
    act(() => host.press("s", { ctrl: true }))
    expect(confirmed).toEqual([{ name: "development", color: undefined }])
    expect(backgroundKeys).toEqual([])

    const rows = captureCharFrame().split("\n")
    const footerY = rows.findIndex((row) => row.includes("save"))
    await act(async () => {
      await mockMouse.click(
        rows[footerY]!.indexOf("save"),
        footerY,
        MouseButtons.LEFT,
      )
      await mockMouse.click(
        rows[footerY]!.indexOf("close"),
        footerY,
        MouseButtons.LEFT,
      )
    })
    expect(confirmed).toHaveLength(2)
    expect(closed).toBe(1)
    cleanup()
  })
})
