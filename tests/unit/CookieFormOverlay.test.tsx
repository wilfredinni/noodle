import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { MouseButtons } from "@opentui/core/testing"
import { createTestRender } from "../testRender"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { ThemeProvider } from "../../src/ui/theme"
import {
  CookieFormOverlay,
  type CookieFormOverlayHandle,
  type CookieFormValues,
} from "../../src/ui/overlays/CookieFormOverlay"
import { useFormOverlayIntercept } from "../../src/ui/intercepts/useFormOverlayIntercept"

const testRender = createTestRender()

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
}: {
  overlayRef: React.RefObject<CookieFormOverlayHandle | null>
}) {
  useFormOverlayIntercept({
    visible: true,
    handleRef: overlayRef,
    onConfirm: () => {},
    onCancel: () => {},
    passThroughFocuses: ["sameSite"],
    toggleFocuses: ["secure", "httpOnly", "hostOnly"],
  })
  return (
    <CookieFormOverlay
      visible
      ref={overlayRef}
      initial={{
        name: "session",
        value: "abc",
        domain: "example.com",
        path: "/",
        expires: null,
        secure: false,
        httpOnly: false,
        hostOnly: false,
      }}
    />
  )
}

describe("CookieFormOverlay", () => {
  it("renders fields and starts focused on name", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CookieFormOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("New Cookie")
    expect(frame).toContain("Name")
    expect(frame).toContain("SameSite")
    expect(ref.current?.getFocus()).toBe("name")
    cleanup()
  })

  it("prefills when editing an existing cookie", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CookieFormOverlay
            visible
            ref={ref}
            initial={{
              name: "session",
              value: "abc",
              domain: "example.com",
              path: "/",
              expires: null,
              secure: true,
              httpOnly: true,
              hostOnly: false,
              sameSite: "lax",
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Edit Cookie")
    const result = ref.current?.confirm()
    expect(result).toEqual({
      name: "session",
      value: "abc",
      domain: "example.com",
      path: "/",
      expires: "",
      secure: true,
      httpOnly: true,
      hostOnly: false,
      sameSite: "lax",
    })
    cleanup()
  })

  it("validates name, domain, and expires", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CookieFormOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()

    let result: CookieFormValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result).toBeNull()
    await renderOnce()
    expect(captureCharFrame()).toContain("Cookie name is required")

    cleanup()
  })

  it("cycles focus through all nine fields", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CookieFormOverlay visible ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()

    const seen: string[] = []
    for (let i = 0; i < 9; i++) {
      seen.push(ref.current?.getFocus() ?? "")
      act(() => ref.current?.cycleFocus(1))
    }
    expect(seen).toEqual([
      "name",
      "value",
      "domain",
      "path",
      "expires",
      "secure",
      "httpOnly",
      "hostOnly",
      "sameSite",
    ])
    expect(ref.current?.getFocus()).toBe("name")
    cleanup()
  })

  it("toggles secure, httpOnly, and hostOnly through the handle", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <CookieFormOverlay
            visible
            ref={ref}
            initial={{
              name: "session",
              value: "abc",
              domain: "example.com",
              path: "/",
              expires: null,
              secure: false,
              httpOnly: false,
              hostOnly: false,
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()

    for (let i = 0; i < 5; i++) act(() => ref.current?.cycleFocus(1))
    expect(ref.current?.getFocus()).toBe("secure")
    act(() => ref.current?.toggleFocused())
    act(() => ref.current?.cycleFocus(1))
    act(() => ref.current?.toggleFocused())
    act(() => ref.current?.cycleFocus(1))
    act(() => ref.current?.toggleFocused())
    await renderOnce()
    let result: CookieFormValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result?.secure).toBe(true)
    expect(result?.httpOnly).toBe(true)
    expect(result?.hostOnly).toBe(true)
    cleanup()
  })

  it("toggles Secure with Space and HttpOnly with the mouse", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const ref = createRef<CookieFormOverlayHandle>()
    const { renderOnce, captureCharFrame, mockMouse } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <KeyboardHarness overlayRef={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 70, height: 40 },
    )
    await renderOnce()

    for (let i = 0; i < 5; i++) act(() => host.press("tab"))
    await renderOnce()
    expect(ref.current?.getFocus()).toBe("secure")
    act(() => host.press("space"))
    await renderOnce()

    const rows = captureCharFrame().split("\n")
    const httpOnlyLabelY = rows.findIndex((row) => row.includes("HttpOnly"))
    const httpOnlyY = rows.findIndex(
      (row, index) => index > httpOnlyLabelY && row.includes("[ ]"),
    )
    const httpOnlyX = rows[httpOnlyY]!.indexOf("[ ]") + 1
    await act(async () => {
      await mockMouse.click(httpOnlyX, httpOnlyY, MouseButtons.LEFT)
    })
    await renderOnce()

    let result: CookieFormValues | null | undefined
    act(() => {
      result = ref.current?.confirm()
    })
    expect(result?.secure).toBe(true)
    expect(result?.httpOnly).toBe(true)
    cleanup()
  })
})
