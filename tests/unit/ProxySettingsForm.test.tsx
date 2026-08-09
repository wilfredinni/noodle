import { describe, expect, it } from "bun:test"
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

describe("ProxySettingsForm", () => {
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
      { width: 80, height: 28 },
    )
    await renderOnce()
    const frame = captureCharFrame()
    expect(frame).toContain("Fields")
    expect(frame).toContain("Hostname")
    expect(frame).toContain("Proxy authentication")
    expect(frame).toContain("Username variable")
    expect(frame).toContain("Bypass hosts")
    const lines = frame.split("\n")
    expect(
      lines.findIndex((line) => line.includes("Bypass hosts")),
    ).toBeLessThan(
      lines.findIndex((line) => line.includes("Proxy authentication")),
    )
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
