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

  it("hides collection scope when it is not editable", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsOverlay visible collectionAvailable={false} />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 24 },
    )
    await renderOnce()
    expect(captureCharFrame()).not.toContain("Current collection")
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

  it("opens canonical custom proxies in Fields mode and saves the same URL", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ProxySettingsOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsOverlay
            visible
            collectionAvailable
            ref={ref}
            appProxy={{
              mode: "custom",
              url: "https://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8443",
              bypass: ["localhost"],
            }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 36 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Fields")
    expect(frame).toContain("Protocol")
    expect(frame).toContain("Hostname")
    expect(frame).toContain("Port")
    expect(frame).toContain("Proxy authentication")
    expect(frame).toContain("Username variable")
    expect(frame).toContain("Password variable")
    let saved: ProxySettingsValues | null | undefined
    await act(async () => {
      saved = ref.current?.confirm()
    })
    expect(saved).toEqual({
      scope: "app",
      mode: "custom",
      url: "https://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8443",
      bypass: ["localhost"],
    })

    const focusOrder = [
      "scope",
      "mode",
      "editor",
      "protocol",
      "hostname",
      "port",
      "auth",
      "username",
      "password",
      "bypass",
    ] as const
    for (const expected of focusOrder.slice(1)) {
      await act(async () => ref.current?.cycleFocus(1))
      expect(ref.current?.getFocus()).toBe(expected)
    }
    cleanup()
  })

  it("opens non-lossless URLs in Advanced URL mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const ref = createRef<ProxySettingsOverlayHandle>()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsOverlay
            visible
            collectionAvailable
            ref={ref}
            appProxy={{ mode: "custom", url: "http://proxy.test/path" }}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 36 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain("Advanced URL")
    expect(captureCharFrame()).toContain("Proxy URL")
    let saved: ProxySettingsValues | null | undefined
    await act(async () => {
      saved = ref.current?.confirm()
    })
    expect(saved).toEqual({
      scope: "app",
      mode: "custom",
      url: "http://proxy.test/path",
      bypass: [],
    })

    expect(captureCharFrame()).not.toContain("Hostname")
    cleanup()
  })
})
