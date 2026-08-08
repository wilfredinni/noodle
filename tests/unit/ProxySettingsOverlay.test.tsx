import { describe, expect, it } from "bun:test"
import { act, createRef } from "react"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import {
  ProxySettingsOverlay,
  type ProxySettingsOverlayHandle,
  type ProxySettingsValues,
} from "../../src/ui/overlays/ProxySettingsOverlay"

const testRender = createTestRender()

function setupKeymap() {
  const { keymap, cleanup: hostCleanup } = createTestKeymap()
  const disposeEnabled = registerEnabledFields(keymap)
  const disposeKeys = registerDefaultKeys(keymap)
  return {
    keymap: keymap as unknown as KeymapProviderProps["keymap"],
    cleanup: () => {
      disposeEnabled()
      disposeKeys()
      hostCleanup()
    },
  }
}

describe("ProxySettingsOverlay", () => {
  it("renders app and collection scope controls", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsOverlay visible collectionAvailable />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Proxy Settings")
    expect(frame).toContain("Scope")
    expect(frame).toContain("App-wide default")
    expect(frame).toContain("Mode")
    expect(frame).toContain("Use system proxy")
    cleanup()
  })

  it("starts with the app system policy and cycles focus", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ProxySettingsOverlayHandle>()
    const { renderOnce } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsOverlay visible collectionAvailable ref={ref} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    const values: Array<ProxySettingsValues | null> = []
    await act(async () => {
      values.push(ref.current?.confirm() ?? null)
    })
    expect(values[0]).toEqual({
      scope: "app",
      mode: "system",
      url: "",
      bypass: [],
    })
    expect(ref.current?.getFocus()).toBe("scope")
    await act(async () => ref.current?.cycleFocus(1))
    expect(ref.current?.getFocus()).toBe("mode")
    cleanup()
  })
})
