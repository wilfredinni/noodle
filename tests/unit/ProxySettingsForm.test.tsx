import { describe, expect, it } from "bun:test"
import { act } from "react"
import { type BoxRenderable } from "@opentui/core"
import { createTestKeymap } from "@opentui/keymap/testing"
import {
  registerDefaultKeys,
  registerEnabledFields,
} from "@opentui/keymap/addons"
import { KeymapProvider } from "@opentui/keymap/react"
import type { KeymapProviderProps } from "@opentui/keymap/react"
import { createTestRender } from "../testRender"
import { ThemeProvider } from "../../src/ui/theme"
import { ProxySettingsForm } from "../../src/ui/settings/ProxySettingsForm"

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

describe("ProxySettingsForm", () => {
  it("moves between fields with the arrow keys", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, renderer } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test:8080" }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()

    const mode = renderer.root.findDescendantById(
      "settings-proxy-mode",
    ) as BoxRenderable
    const editor = renderer.root.findDescendantById(
      "settings-proxy-editor",
    ) as BoxRenderable
    expect(mode.backgroundColor.a).toBeGreaterThan(0)
    expect(editor.backgroundColor.a).toBe(0)

    await act(async () => host.press("down"))
    expect(mode.backgroundColor.a).toBe(0)
    expect(editor.backgroundColor.a).toBeGreaterThan(0)
    cleanup()
  })

  it("switches between Fields and Advanced URL before either is filled", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "system" }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()

    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await act(async () => host.press("tab"))
    await act(async () => host.press("return"))
    await act(async () => host.press("down"))
    await act(async () => host.press("return"))
    await renderOnce()

    expect(captureCharFrame()).toContain("Proxy URL")

    await act(async () => host.press("return"))
    await act(async () => host.press("up"))
    await act(async () => host.press("return"))
    await renderOnce()

    expect(captureCharFrame()).toContain("Hostname")
    expect(captureCharFrame()).not.toContain("Proxy URL")
    cleanup()
  })

  it("renders canonical custom proxies as structured fields", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{
              mode: "custom",
              url: "https://$PROXY_USER:$PROXY_PASSWORD@proxy.test:8443",
              bypass: ["localhost"],
            }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 34 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Fields")
    expect(frame).toContain("Hostname")
    expect(frame).toContain("Proxy authentication")
    expect(frame).toContain("Username variable")
    expect(frame).toContain("Bypass hosts")
    expect(frame).toContain("Choose the system proxy")
    expect(frame).toContain("Use structured fields")
    expect(frame).toContain("Protocol used to connect")
    expect(frame).toContain("Hostname or IP address")
    expect(frame).toContain("Optional port used")
    expect(frame).toContain(
      "Use environment variables for the proxy credentials",
    )
    expect(frame).toContain(
      "Environment variable containing the proxy username",
    )
    expect(frame).toContain(
      "Environment variable containing the proxy password",
    )
    const lines = frame.split("\n")
    expect(
      lines.findIndex((line) => line.includes("Bypass hosts")),
    ).toBeLessThan(
      lines.findIndex((line) => line.includes("Proxy authentication")),
    )
    cleanup()
  })

  it("renders structured validation errors below the invalid field", async () => {
    const { keymap, host, cleanup } = setupKeymap()
    const { renderOnce, mockInput, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test:8080" }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 90, height: 24 },
    )
    await renderOnce()

    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    await act(async () => host.press("down"))
    for (let index = 0; index < 10; index += 1) {
      await act(async () => mockInput.pressBackspace())
    }
    await renderOnce()

    const lines = captureCharFrame().split("\n")
    const hostnameLine = lines.findIndex((line) => line.includes("Hostname"))
    const errorLine = lines.findIndex((line) =>
      line.includes("Proxy hostname is required"),
    )
    const portLine = lines.findIndex((line) => line.includes("Port"))
    expect(hostnameLine).toBeGreaterThanOrEqual(0)
    expect(errorLine).toBeGreaterThan(hostnameLine)
    expect(errorLine).toBeLessThan(portLine)
    cleanup()
  })

  it("keeps non-lossless proxy URLs in Advanced mode", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="collection"
            focused
            proxy={{ mode: "custom", url: "http://proxy.test/path" }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 18 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Advanced URL")
    expect(frame).toContain("Proxy URL")
    expect(frame).not.toContain("Hostname")
    expect(frame).not.toContain("Proxy authentication")
    expect(frame).not.toContain("Username variable")
    expect(frame).not.toContain("Password variable")
    expect(frame).toContain("credentials directly in the URL")
    cleanup()
  })

  it("explains when --no-proxy overrides the saved app setting", async () => {
    const { keymap, cleanup } = setupKeymap()
    const { renderOnce, captureCharFrame } = await testRender(
      <KeymapProvider keymap={keymap}>
        <ThemeProvider activeIndex={0} previewIndex={null}>
          <ProxySettingsForm
            scope="app"
            focused
            noProxy
            proxy={{ mode: "system" }}
            activeEnv={null}
            onChange={() => true}
          />
        </ThemeProvider>
      </KeymapProvider>,
      { width: 80, height: 12 },
    )
    await renderOnce()
    expect(captureCharFrame()).toContain(
      "disabled for this session by --no-proxy",
    )
    cleanup()
  })
})
